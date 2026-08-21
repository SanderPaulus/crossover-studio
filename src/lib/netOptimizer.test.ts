import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrd } from './parsers/frd.ts';
import { parseZma } from './parsers/zma.ts';
import { applyTransfer, logspace, resample } from './dsp.ts';
import { fromPolar } from './complex.ts';
import type { VxpPart } from './parsers/vxp.ts';
import { crossoverToNetlist } from './vxpNetwork.ts';
import { sourceResistanceOhm } from './partAudit.ts';
import { solveNetwork } from './network.ts';
import { allSeries, bomFor, setCustomSeries } from './catalog.ts';
import { deserializeCatalog } from './catalogFile.ts';
import { floorCurve } from './impedanceFloor.ts';
import {
  busPositions,
  optimizeNetworkValues,
  reseedOutliers,
  NetOptimizeError,
  Z_FLOOR_OHM,
} from './netOptimizer.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'parsers', 'fixtures');
const load = (name: string) => readFileSync(join(FIXTURES, name), 'utf-8');

const grid = logspace(210, 19000, 400);
const gridded = (name: string) => {
  const f = parseFrd(load(name));
  return resample(f.freq, f.spl, f.phase, grid);
};
const wBase = gridded('mid_hor0_mettape.txt');
const tBase = gridded('tweet_hor0_mettape.txt');
const gridZ = (name: string) => {
  const z = parseZma(load(name));
  const g = resample(z.freq, z.magnitude, z.phase, grid, { clampEdges: true });
  return g.spl.map((m, i) => fromPolar(m, (g.phaseDeg[i] * Math.PI) / 180));
};
const driverZ = {
  mid: gridZ('mid_Backwavecone_sheep75gram.ZMA'),
  tweeter: gridZ('tweeter.ZMA'),
};
const NO_ADJ = { offsetMm: 0, trimDb: 0, inverted: false };

/** Crude 2-way: series L into the mid, series C into the tweeter — with
 *  deliberately WRONG values the optimizer must repair. */
function crudeNetwork(lock: 'none' | 'coil'): VxpPart[] {
  return [
    {
      type: 'Generator',
      partId: 'G1',
      params: [
        { name: 'Eg', value: 2.83, unit: 'V' },
        { name: 'Rg', value: 0.001, unit: 'Ω' },
      ],
      wires: [{ x: 3, y: 4 }, { x: 3, y: 11 }],
    },
    { type: 'Ground', params: [], wires: [{ x: 3, y: 11 }] },
    {
      type: 'Inductor',
      partId: 'L1',
      locked: lock === 'coil',
      params: [
        { name: 'L', value: 0.4, unit: 'mH' },
        { name: 'DCR', value: 0.16, unit: 'Ω' },
      ],
      wires: [{ x: 3, y: 4 }, { x: 10, y: 4 }],
    },
    {
      type: 'Driver',
      partId: 'D1',
      model: 'mid',
      inverted: false,
      params: [],
      wires: [{ x: 10, y: 4 }, { x: 10, y: 11 }],
    },
    { type: 'Ground', params: [], wires: [{ x: 10, y: 11 }] },
    {
      type: 'Capacitor',
      partId: 'C1',
      params: [{ name: 'C', value: 2.0, unit: 'uF' }],
      wires: [{ x: 3, y: 4 }, { x: 16, y: 4 }],
    },
    {
      type: 'Driver',
      partId: 'D2',
      model: 'tweeter',
      inverted: false,
      params: [],
      wires: [{ x: 16, y: 4 }, { x: 16, y: 11 }],
    },
    { type: 'Ground', params: [], wires: [{ x: 16, y: 11 }] },
  ];
}

describe('optimizeNetworkValues (passive-in-the-loop)', () => {
  it('improves the measured combined response by moving component values', () => {
    const r = optimizeNetworkValues(crudeNetwork('none'), grid, wBase, tBase, driverZ, NO_ADJ, {
      phasePriority: 0.3,
    });
    expect(r.tuned).toBe(2);
    expect(r.after.rippleDb).toBeLessThan(r.before.rippleDb);
    // Values actually moved and were written back into the parts.
    const l = r.parts.find((p) => p.partId === 'L1')!.params.find((q) => q.name === 'L')!.value;
    const c = r.parts.find((p) => p.partId === 'C1')!.params.find((q) => q.name === 'C')!.value;
    expect(l).not.toBeCloseTo(0.4, 3);
    expect(c).not.toBeCloseTo(2.0, 3);
  });

  it('respects a locked component', () => {
    const r = optimizeNetworkValues(crudeNetwork('coil'), grid, wBase, tBase, driverZ, NO_ADJ, {
      phasePriority: 0.3,
    });
    expect(r.tuned).toBe(1);
    const l = r.parts.find((p) => p.partId === 'L1')!.params.find((q) => q.name === 'L')!.value;
    expect(l).toBeCloseTo(0.4, 6); // locked value untouched
    expect(r.after.rippleDb).toBeLessThanOrEqual(r.before.rippleDb + 1e-9);
  });

  it('refuses when everything is locked', () => {
    const all = crudeNetwork('coil').map((p) =>
      p.type === 'Capacitor' ? { ...p, locked: true } : p,
    );
    expect(() =>
      optimizeNetworkValues(all, grid, wBase, tBase, driverZ, NO_ADJ),
    ).toThrow(NetOptimizeError);
  });
});

describe('staged mode (trapmethode on the assembled network)', () => {
  /** Crude network + a REDUNDANT second cap in parallel with the tweeter's
   *  series C: removing it and letting C1 absorb the sum is exactly
   *  loss-free — the canonical part that no longer earns its place. (A
   *  spare shunt R is deliberately NOT used here: in a pad-less network the
   *  tuner rightfully adopts it as a level tool.) */
  function withRedundantCap(): VxpPart[] {
    return [
      ...crudeNetwork('none'),
      {
        type: 'Capacitor',
        partId: 'C9',
        params: [{ name: 'C', value: 1.5, unit: 'uF' }],
        wires: [{ x: 3, y: 4 }, { x: 16, y: 4 }],
      },
    ];
  }

  it('prunes parts that no longer earn their place while the targets stay met', () => {
    const plain = optimizeNetworkValues(withRedundantCap(), grid, wBase, tBase, driverZ, NO_ADJ, {
      phasePriority: 0.3,
    });
    // Targets the tuned design meets with only a LITTLE headroom: enough to
    // shed exact redundancy, not enough to strip working filter parts.
    const staged = {
      rippleDb: plain.after.rippleDb * 1.08 + 0.05,
      phaseDeg: plain.after.phaseDeg * 1.08 + 2,
    };
    const r = optimizeNetworkValues(withRedundantCap(), grid, wBase, tBase, driverZ, NO_ADJ, {
      phasePriority: 0.3,
      staged,
    });
    // Redundancy resolved: exactly ONE of the two parallel caps survives —
    // which one goes is the optimizer's call. (Both gone = dead tweeter
    // branch, impossible within the targets.)
    expect(r.removed.length).toBeGreaterThan(0);
    expect(r.parts.filter((p) => p.partId === 'C1' || p.partId === 'C9')).toHaveLength(1);
    // Fewest components, but the goal still met (small full-vs-decimated-grid slack).
    expect(r.after.rippleDb).toBeLessThanOrEqual(staged.rippleDb + 0.15);
    expect(r.after.phaseDeg).toBeLessThanOrEqual(staged.phaseDeg + 3);
  });

  it('looser targets never cost MORE components (Sander\'s expectation)', () => {
    // "Ik verwacht bij hogere marges dat ik minder onderdelen nodig heb" — that
    // IS what staged mode promises, and it did not hold: the prune tested only
    // the three lowest-fx removals per round and abandoned the whole sweep
    // when those three failed. A genuinely dead part leaves fx almost exactly
    // where it was, so it ranks BELOW removals that happen to nudge fx down,
    // and it never got tried. Measured on his 29-part 3-way: targets met with
    // room to spare (2.7 dB of 3, 12.8 deg of 15) and nothing was shed.
    const seed = withRedundantCap();
    const plain = optimizeNetworkValues(seed, grid, wBase, tBase, driverZ, NO_ADJ, {
      phasePriority: 0.3,
    });
    const run = (rippleMul: number, phaseMul: number) =>
      optimizeNetworkValues(seed, grid, wBase, tBase, driverZ, NO_ADJ, {
        phasePriority: 0.3,
        staged: {
          rippleDb: plain.after.rippleDb * rippleMul + 0.05,
          phaseDeg: plain.after.phaseDeg * phaseMul + 2,
        },
      });
    const tight = run(1.05, 1.05);
    const loose = run(1.6, 1.6);
    const live = (r: ReturnType<typeof run>) =>
      r.parts.filter((p) => p.partId && !p.open && !p.shorted && /^[LCR]/.test(p.type[0])).length;
    expect(loose.removed.length).toBeGreaterThanOrEqual(tight.removed.length);
    expect(live(loose)).toBeLessThanOrEqual(live(tight));
    // …and the loose run still honours the goal it was given.
    expect(loose.after.rippleDb).toBeLessThanOrEqual(plain.after.rippleDb * 1.6 + 0.2);
  });

  it('a locked part is never pruned', () => {
    const parts = withRedundantCap().map((p) => (p.partId === 'C9' ? { ...p, locked: true } : p));
    const plain = optimizeNetworkValues(parts, grid, wBase, tBase, driverZ, NO_ADJ, {
      phasePriority: 0.3,
    });
    const r = optimizeNetworkValues(parts, grid, wBase, tBase, driverZ, NO_ADJ, {
      phasePriority: 0.3,
      staged: { rippleDb: plain.after.rippleDb * 1.2 + 0.1, phaseDeg: plain.after.phaseDeg * 1.2 + 5 },
    });
    expect(r.removed).not.toContain('C9');
    expect(r.parts.some((p) => p.partId === 'C9')).toBe(true);
  });

  it('fix 2c: xoFloorPairs pushes a delivered crossing up to (or within 5 % of) the floor', () => {
    const plain = optimizeNetworkValues(paddedNetwork(), grid, wBase, tBase, driverZ, NO_ADJ, { phasePriority: 0.5 });
    const xo0 = plain.after.xoHz!;
    expect(xo0).toBeGreaterThan(0);
    const floor = xo0 * 1.3;
    const r = optimizeNetworkValues(paddedNetwork(), grid, wBase, tBase, driverZ, NO_ADJ, {
      phasePriority: 0.5,
      xoFloorPairs: [floor],
    });
    expect(r.after.xoHz!).toBeGreaterThanOrEqual(floor * 0.95);
  });

  /** Tweeter behind HP cap + series pad R: the raw tweeter's top-octave droop
   *  is invisible to pure level/value moves — the bypass-C is the tool. */
  function paddedNetwork(): VxpPart[] {
    return [
      {
        type: 'Generator',
        partId: 'G1',
        params: [
          { name: 'Eg', value: 2.83, unit: 'V' },
          { name: 'Rg', value: 0.001, unit: 'Ω' },
        ],
        wires: [{ x: 3, y: 4 }, { x: 3, y: 11 }],
      },
      { type: 'Ground', params: [], wires: [{ x: 3, y: 11 }] },
      {
        type: 'Inductor',
        partId: 'L1',
        params: [
          { name: 'L', value: 0.35, unit: 'mH' },
          { name: 'DCR', value: 0.16, unit: 'Ω' },
        ],
        wires: [{ x: 3, y: 4 }, { x: 10, y: 4 }],
      },
      {
        type: 'Driver',
        partId: 'D1',
        model: 'mid',
        inverted: false,
        params: [],
        wires: [{ x: 10, y: 4 }, { x: 10, y: 11 }],
      },
      { type: 'Ground', params: [], wires: [{ x: 10, y: 11 }] },
      {
        type: 'Capacitor',
        partId: 'C1',
        params: [{ name: 'C', value: 6, unit: 'uF' }],
        wires: [{ x: 3, y: 4 }, { x: 16, y: 4 }],
      },
      {
        type: 'Resistor',
        partId: 'R1',
        params: [{ name: 'R', value: 6.8, unit: 'Ω' }],
        wires: [{ x: 16, y: 4 }, { x: 22, y: 4 }],
      },
      {
        type: 'Driver',
        partId: 'D2',
        model: 'tweeter',
        inverted: false,
        params: [],
        wires: [{ x: 22, y: 4 }, { x: 22, y: 11 }],
      },
      { type: 'Ground', params: [], wires: [{ x: 22, y: 11 }] },
    ];
  }

  it('escalates with a bypass-C across the series pad when targets are out of reach (rule 3)', () => {
    // Ripple-focused priority: the bypass-C is an amplitude tool (it lifts
    // the tweeter's drooping top around the pad) — that is the job it must
    // prove here.
    const plain = optimizeNetworkValues(paddedNetwork(), grid, wBase, tBase, driverZ, NO_ADJ, {
      phasePriority: 0,
    });
    // Beyond what value tuning alone achieves → escalation mode. 0.65, not
    // the historical 0.8: with the error-smoothed objective (aug 2026) the
    // staged barrier tune alone already reached 0.75× (4.36 vs 5.81 dB,
    // better than the legacy bypass-C result of 5.00), so at 0.8 the targets
    // were simply MET and rule 3 never had to fire.
    const staged = {
      rippleDb: Math.max(plain.after.rippleDb * 0.65, 0.05),
      phaseDeg: plain.after.phaseDeg + 15,
    };
    const r = optimizeNetworkValues(paddedNetwork(), grid, wBase, tBase, driverZ, NO_ADJ, {
      phasePriority: 0,
      staged,
    });
    expect(r.added.length).toBeGreaterThan(0);
    const cap = r.parts.find((p) => p.partId === r.added[0])!;
    expect(cap.type).toBe('Capacitor');
    // The loop is drawn raised: its two wires + C connect the pad's terminals.
    expect(r.after.rippleDb).toBeLessThan(plain.after.rippleDb);
  });
});

describe('debris sweep after pruning', () => {
  /** Crude network + a full shunt notch chain (L-C-R to ground, drawn with
   *  connecting wires + its own ground symbol) that does nothing useful at
   *  30 kHz-equivalent values — prune bait with debris potential. */
  function withNotchChain(): VxpPart[] {
    return [
      ...crudeNetwork('none'),
      // chain hangs off the mid bus at x=10 (driver node), like synthesis draws
      { type: 'Wire', params: [], wires: [{ x: 10, y: 4 }, { x: 20, y: 4 }] },
      {
        type: 'Inductor',
        partId: 'L8',
        params: [{ name: 'L', value: 0.06, unit: 'mH' }],
        wires: [{ x: 20, y: 4 }, { x: 20, y: 9 }],
      },
      {
        type: 'Capacitor',
        partId: 'C8',
        params: [{ name: 'C', value: 0.4, unit: 'uF' }],
        wires: [{ x: 20, y: 9 }, { x: 20, y: 14 }],
      },
      { type: 'Wire', params: [], wires: [{ x: 20, y: 14 }, { x: 20, y: 19 }] },
      { type: 'Ground', params: [], wires: [{ x: 20, y: 19 }] },
      // A floating leftover from an earlier run — staged mode sweeps it too.
      { type: 'Wire', params: [], wires: [{ x: 40, y: 30 }, { x: 46, y: 30 }] },
    ];
  }

  it('pruned chains take their orphaned wires and grounds along', () => {
    const plain = optimizeNetworkValues(withNotchChain(), grid, wBase, tBase, driverZ, NO_ADJ, {
      phasePriority: 0.3,
    });
    const r = optimizeNetworkValues(withNotchChain(), grid, wBase, tBase, driverZ, NO_ADJ, {
      phasePriority: 0.3,
      staged: {
        rippleDb: plain.after.rippleDb * 1.08 + 0.05,
        phaseDeg: plain.after.phaseDeg * 1.08 + 2,
      },
    });
    // The chain (or part of it) went — and NO orphaned wire/ground remains:
    // every surviving wire/ground still touches a live component net.
    expect(r.removed.length).toBeGreaterThan(0);
    const key = (w: { x: number; y: number }) => `${w.x},${w.y}`;
    const anchors = new Set(
      r.parts
        .filter((p) => p.type !== 'Wire' && p.type !== 'Ground')
        .flatMap((p) => p.wires.map(key)),
    );
    // Transitive reach through wires, seeded from component terminals.
    let grew = true;
    while (grew) {
      grew = false;
      for (const p of r.parts) {
        if (p.type !== 'Wire') continue;
        if (p.wires.some((w) => anchors.has(key(w)))) {
          for (const w of p.wires) {
            if (!anchors.has(key(w))) {
              anchors.add(key(w));
              grew = true;
            }
          }
        }
      }
    }
    for (const p of r.parts) {
      if (p.type !== 'Wire' && p.type !== 'Ground') continue;
      expect(p.wires.some((w) => anchors.has(key(w)))).toBe(true);
    }
    // Pre-existing floating debris is swept along (undo brings a sketch back).
    expect(r.parts.some((p) => p.type === 'Wire' && p.wires.some((w) => w.y === 30))).toBe(false);
    // And no dangling stubs: every 2-point wire endpoint is shared by
    // something else (a bus-attached tail must be eaten down to the bus).
    const useCount = new Map<string, number>();
    for (const p of r.parts) {
      for (const w of p.wires) useCount.set(key(w), (useCount.get(key(w)) ?? 0) + 1);
    }
    for (const p of r.parts) {
      if (p.type !== 'Wire' || p.wires.length !== 2) continue;
      for (const w of p.wires) expect(useCount.get(key(w))!).toBeGreaterThan(1);
    }
  });
});

describe('crossover-point pin on the assembled network', () => {
  it('the value tuner keeps the acoustic crossing inside the requested range', () => {
    const crossing = (parts: VxpPart[]): number | null => {
      const { netlist } = crossoverToNetlist({ name: 'x', parts });
      const sol = solveNetwork(netlist, grid, driverZ);
      const hFor = (model: string) => {
        const d = sol.drivers.find((x) => x.model === model);
        return d ? sol.transfers[d.id] : null;
      };
      const wF = applyTransfer(wBase, hFor('mid')!);
      const tF = applyTransfer(tBase, hFor('tweeter')!);
      for (let i = 1; i < grid.length; i++) {
        if (wF.spl[i] - tF.spl[i] <= 0) return grid[i];
      }
      return null;
    };
    const free = optimizeNetworkValues(crudeNetwork('none'), grid, wBase, tBase, driverZ, NO_ADJ, {
      phasePriority: 0.3,
    });
    const pinned = optimizeNetworkValues(crudeNetwork('none'), grid, wBase, tBase, driverZ, NO_ADJ, {
      phasePriority: 0.3,
      xoRange: [2600, 3400],
    });
    const xoPinned = crossing(pinned.parts);
    expect(xoPinned).not.toBeNull();
    expect(xoPinned!).toBeGreaterThanOrEqual(2600 * 0.95);
    expect(xoPinned!).toBeLessThanOrEqual(3400 * 1.05);
    // Sanity: the pin actually did something relative to the free run when
    // the free crossing landed elsewhere (data-dependent, so only log-free
    // assertion: pinned run is valid regardless).
    void free;
  });
});

describe('catalog snap on the assembled network', () => {
  // Snap only runs against an IMPORTED catalog: without one the design keeps
  // theoretically ideal (continuous) values (Sander's rule — no snapping to
  // the built-in estimated grid).
  it('the tuner ends on purchasable values — the BOM finds every part', () => {
    const imp = deserializeCatalog(load('gemini-catalog-v6.json'));
    setCustomSeries(imp.series, imp.parts);
    try {
      // Without the final snap the tuner un-snaps whatever the synthesis
      // snapped (Sanders BOM: "no exact catalog value" everywhere).
      const r = optimizeNetworkValues(crudeNetwork('none'), grid, wBase, tBase, driverZ, NO_ADJ, {
        phasePriority: 0.3,
        catalogSnap: true,
      });
      const bom = bomFor(r.parts);
      expect(bom.rows.length).toBeGreaterThan(0);
      expect(bom.unmatchedCount).toBe(0);
      // The snapped coil carries its catalog DCR into the schematic params.
      const l1 = r.parts.find((p) => p.partId === 'L1')!;
      expect(l1.params.some((q) => q.name === 'DCR' && q.value > 0)).toBe(true);
      // Still an improvement over the crude seed.
      expect(r.after.rippleDb).toBeLessThan(r.before.rippleDb);
    } finally {
      setCustomSeries([]);
    }
  });

});

describe('value window (boundToSeries)', () => {
  it('a bound series HARD-caps the series-path fit to its range; the network adapts', () => {
    const imp = deserializeCatalog(load('gemini-catalog-v6.json'));
    setCustomSeries(imp.series, imp.parts);
    try {
      const alumen = allSeries().find((s) => s.series === 'Alumen Z-Cap' && s.kind === 'C')!;
      expect(alumen).toBeTruthy(); // Alumen = 1–10 µF
      // Seed the tweeter SERIES cap ABOVE Alumen's ceiling.
      const seed = crudeNetwork('none').map((p) =>
        p.partId === 'C1' ? { ...p, params: [{ name: 'C', value: 33, unit: 'uF' }] } : p,
      );
      const c1Of = (r: { parts: typeof seed }) =>
        r.parts.find((p) => p.partId === 'C1')!.params.find((q) => q.name === 'C')!.value;

      const bound = optimizeNetworkValues(seed, grid, wBase, tBase, driverZ, NO_ADJ, {
        phasePriority: 0.3,
        snapPrefs: { profile: 'auto', seriesByKind: { C: alumen.id }, boundToSeries: true },
      });
      // Landed INSIDE Alumen's window (1–10 µF), pulled out of the 33 µF zone —
      // the fit was bounded, not clamped afterwards (network stayed valid).
      expect(c1Of(bound)).toBeLessThanOrEqual(10 + 1e-6);
      expect(c1Of(bound)).toBeGreaterThanOrEqual(1 - 1e-6);
      // The transparency note names the bound slot and the cost.
      expect(bound.valueWindowNote).toContain('C1');
      expect(bound.valueWindowNote).toContain('Alumen');

      // Same series choice WITHOUT boundToSeries: no window, no note.
      const free = optimizeNetworkValues(seed, grid, wBase, tBase, driverZ, NO_ADJ, {
        phasePriority: 0.3,
        snapPrefs: { profile: 'auto', seriesByKind: { C: alumen.id } },
      });
      expect(free.valueWindowNote).toBeUndefined();

      // Deterministic: the bounded fit repeats byte-identically.
      const again = optimizeNetworkValues(seed, grid, wBase, tBase, driverZ, NO_ADJ, {
        phasePriority: 0.3,
        snapPrefs: { profile: 'auto', seriesByKind: { C: alumen.id }, boundToSeries: true },
      });
      expect(c1Of(again)).toBe(c1Of(bound));
    } finally {
      setCustomSeries([]);
    }
  });
});

describe('dead-branch fundamentals & full-band safety gate', () => {
  it('a valley-crossing seed gets repaired, not deepened', () => {
    // Sanders schema (jul 2026): LP'd mid + starved tweeter series cap → the
    // branches "cross" deep in a hole between the mid rolloff and the
    // tweeter's late entry. The tuner must grow the cap back to life.
    const seed: VxpPart[] = [
      { type: 'Generator', partId: 'G1', params: [{ name: 'Eg', value: 2.83, unit: 'V' }, { name: 'Rg', value: 0.001, unit: 'Ω' }], wires: [{ x: 3, y: 4 }, { x: 3, y: 11 }] },
      { type: 'Ground', params: [], wires: [{ x: 3, y: 11 }] },
      { type: 'Inductor', partId: 'L1', params: [{ name: 'L', value: 1.2, unit: 'mH' }, { name: 'DCR', value: 0.3, unit: 'Ω' }], wires: [{ x: 3, y: 4 }, { x: 8, y: 4 }] },
      { type: 'Capacitor', partId: 'C2', params: [{ name: 'C', value: 22, unit: 'uF' }], wires: [{ x: 8, y: 4 }, { x: 8, y: 11 }] },
      { type: 'Ground', params: [], wires: [{ x: 8, y: 11 }] },
      { type: 'Driver', partId: 'D1', model: 'mid', inverted: false, params: [], wires: [{ x: 8, y: 4 }, { x: 10, y: 11 }] },
      { type: 'Ground', params: [], wires: [{ x: 10, y: 11 }] },
      { type: 'Capacitor', partId: 'C1', params: [{ name: 'C', value: 0.68, unit: 'uF' }], wires: [{ x: 3, y: 4 }, { x: 16, y: 4 }] },
      { type: 'Resistor', partId: 'RP1', params: [{ name: 'R', value: 1.0, unit: 'Ω' }], wires: [{ x: 16, y: 4 }, { x: 20, y: 4 }] },
      { type: 'Resistor', partId: 'RP2', params: [{ name: 'R', value: 15, unit: 'Ω' }], wires: [{ x: 20, y: 4 }, { x: 20, y: 11 }] },
      { type: 'Ground', params: [], wires: [{ x: 20, y: 11 }] },
      { type: 'Driver', partId: 'D2', model: 'tweeter', inverted: false, params: [], wires: [{ x: 20, y: 4 }, { x: 24, y: 11 }] },
      { type: 'Ground', params: [], wires: [{ x: 24, y: 11 }] },
    ];
    const r = optimizeNetworkValues(seed, grid, wBase, tBase, driverZ, NO_ADJ, {
      phasePriority: 0.3,
    });
    const c1 = r.parts.find((p) => p.partId === 'C1')!;
    const cUf = c1.params.find((q) => q.name === 'C')!.value;
    // The starved 0.68 µF must grow substantially toward textbook (~5-9 µF).
    expect(cUf).toBeGreaterThan(2);
  });

  it('full-band safety gate: a zoomed-in evaluation band cannot kill the tweeter', () => {
    // The view range is the tuner's whole world. Evaluated on 300–3200 Hz
    // only, the tuner once blew the series cap to 376 µF and dragged the
    // crossing to 891 Hz (tweeter wide open toward Fs) — invisible in-band.
    // Two legitimate outcomes: the full-band gate REJECTS the tune (seed
    // back, note set), or an upstream repair — the series-cap shrink ladder
    // walks the blown-up cap down its fx-plateau — delivers a SANE cap that
    // passes the gate honestly (measured: 376 → 1.8 µF, accepted). Either
    // way the tweeter must end safe.
    const narrow = logspace(300, 3200, 200);
    const regrid = (name: string) => {
      const f = parseFrd(load(name));
      return resample(f.freq, f.spl, f.phase, narrow);
    };
    const zNarrow = (name: string) => {
      const z = parseZma(load(name));
      const g = resample(z.freq, z.magnitude, z.phase, narrow, { clampEdges: true });
      return g.spl.map((m, i) => fromPolar(m, (g.phaseDeg[i] * Math.PI) / 180));
    };
    const zN = {
      mid: zNarrow('mid_Backwavecone_sheep75gram.ZMA'),
      tweeter: zNarrow('tweeter.ZMA'),
    };
    const r = optimizeNetworkValues(
      crudeNetwork('none'),
      narrow,
      regrid('mid_hor0_mettape.txt'),
      regrid('tweet_hor0_mettape.txt'),
      zN,
      NO_ADJ,
      {
        phasePriority: 0.3,
        safety: { freqs: grid, w: wBase, t: tBase, z: driverZ },
      },
    );
    const c1 = r.parts.find((p) => p.partId === 'C1')!.params.find((q) => q.name === 'C')!.value;
    if (r.safetyNote) {
      // Rejected: seed returned untouched.
      expect(c1).toBeCloseTo(2.0, 6);
      expect(r.tuned).toBe(0);
    } else {
      // Accepted: then the cap must be sane (no near-wire into the tweeter).
      expect(c1).toBeLessThan(5);
    }
  });

  it('series-path realism ceiling: a 91 µF series cap does not survive tuning', () => {
    // Sanders schema: the tuner parked B·C1 at 91 µF — a near-wire into the
    // tweeter (0.87 Ω at 2 kHz), elco-territory, right under the 100 µF
    // buildability cap. Series-path elements now carry a soft realism
    // CEILING (C ≤ 33 µF); wherever the tuner lands, it must leave the
    // corner of the buildability box.
    const parts = crudeNetwork('none');
    const c1 = parts.find((p) => p.partId === 'C1')!;
    c1.params[0].value = 91; // µF
    const r = optimizeNetworkValues(parts, grid, wBase, tBase, driverZ, NO_ADJ, {
      phasePriority: 0.3,
    });
    const v = r.parts.find((p) => p.partId === 'C1')!.params.find((q) => q.name === 'C')!.value;
    expect(v).toBeLessThan(40);
  });

  it('bus-path classification: series caps vs shunt chains', () => {
    const posOf = busPositions(crudeNetwork('none'));
    expect(posOf('C1')).toBe('series'); // tweeter series cap
    expect(posOf('L1')).toBe('series'); // mid series coil
  });

  it('reseedOutliers: only big-side reactive outliers move, locked parts never', () => {
    // KOAN-ish textbook: fc ≈ 2 kHz, R ≈ 6 Ω → C ≈ 13 µF, L ≈ 0.48 mH.
    const textbook = { C: 13e-6, L: 0.48e-3 };
    const mk = (type: string, partId: string, name: string, value: number, locked = false) =>
      ({ type, partId, locked, params: [{ name, value, unit: name === 'L' ? 'mH' : 'uF' }], wires: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }) as VxpPart;
    const parts = [
      mk('Capacitor', 'C-big', 'C', 33), // > 13×2.2=28.6 → reset to 13
      mk('Capacitor', 'C-ok', 'C', 20), // within band → untouched
      mk('Capacitor', 'C-locked', 'C', 33, true), // locked → untouched
      mk('Inductor', 'L-big', 'L', 1.2), // > 0.48×2.2=1.06 → reset
      mk('Resistor', 'R1', 'R', 22), // resistors never
    ];
    const out = reseedOutliers(parts, textbook)!;
    const val = (id: string) => out.find((p) => p.partId === id)!.params[0].value;
    expect(val('C-big')).toBeCloseTo(13, 3);
    expect(val('C-ok')).toBe(20);
    expect(val('C-locked')).toBe(33);
    expect(val('L-big')).toBeCloseTo(0.48, 3);
    expect(val('R1')).toBe(22);
    // Nothing over the line → null (no pointless extra tune).
    expect(reseedOutliers([mk('Capacitor', 'C-ok', 'C', 20)], textbook)).toBeNull();
  });

  it('multi-start tuning: a big-cap seed finds the matched basin, deterministically', () => {
    // The landscape is multimodal: from a 33 µF shunt seed the single-start
    // tuner could settle in the low-impedance big-cap basin (Sanders C2).
    // The textbook-reseeded second start explores the matched basin; best
    // tuned fx wins — and both starts are deterministic, so identical runs
    // give identical results (Sanders: "elke keer vergelijkbaar resultaat").
    const bigCapNet = (): VxpPart[] => [
      { type: 'Generator', partId: 'G1', params: [{ name: 'Eg', value: 2.83, unit: 'V' }, { name: 'Rg', value: 0.001, unit: 'Ω' }], wires: [{ x: 3, y: 4 }, { x: 3, y: 11 }] },
      { type: 'Ground', params: [], wires: [{ x: 3, y: 11 }] },
      { type: 'Inductor', partId: 'L1', params: [{ name: 'L', value: 0.6, unit: 'mH' }, { name: 'DCR', value: 0.25, unit: 'Ω' }], wires: [{ x: 3, y: 4 }, { x: 8, y: 4 }] },
      { type: 'Capacitor', partId: 'C2', params: [{ name: 'C', value: 33, unit: 'uF' }], wires: [{ x: 8, y: 4 }, { x: 8, y: 11 }] },
      { type: 'Ground', params: [], wires: [{ x: 8, y: 11 }] },
      { type: 'Inductor', partId: 'L6', params: [{ name: 'L', value: 0.4, unit: 'mH' }, { name: 'DCR', value: 0.2, unit: 'Ω' }], wires: [{ x: 8, y: 4 }, { x: 12, y: 4 }] },
      { type: 'Driver', partId: 'D1', model: 'mid', inverted: false, params: [], wires: [{ x: 12, y: 4 }, { x: 12, y: 11 }] },
      { type: 'Ground', params: [], wires: [{ x: 12, y: 11 }] },
      { type: 'Capacitor', partId: 'C1', params: [{ name: 'C', value: 10, unit: 'uF' }], wires: [{ x: 3, y: 4 }, { x: 16, y: 4 }] },
      { type: 'Inductor', partId: 'L2', params: [{ name: 'L', value: 0.5, unit: 'mH' }, { name: 'DCR', value: 0.2, unit: 'Ω' }], wires: [{ x: 16, y: 4 }, { x: 16, y: 11 }] },
      { type: 'Ground', params: [], wires: [{ x: 16, y: 11 }] },
      { type: 'Resistor', partId: 'RP1', params: [{ name: 'R', value: 2.2, unit: 'Ω' }], wires: [{ x: 16, y: 4 }, { x: 20, y: 4 }] },
      { type: 'Resistor', partId: 'RP2', params: [{ name: 'R', value: 10, unit: 'Ω' }], wires: [{ x: 20, y: 4 }, { x: 20, y: 11 }] },
      { type: 'Ground', params: [], wires: [{ x: 20, y: 11 }] },
      { type: 'Driver', partId: 'D2', model: 'tweeter', inverted: false, params: [], wires: [{ x: 20, y: 4 }, { x: 24, y: 11 }] },
      { type: 'Ground', params: [], wires: [{ x: 24, y: 11 }] },
    ];
    const a = optimizeNetworkValues(bigCapNet(), grid, wBase, tBase, driverZ, NO_ADJ, { phasePriority: 0.3 });
    const b = optimizeNetworkValues(bigCapNet(), grid, wBase, tBase, driverZ, NO_ADJ, { phasePriority: 0.3 });
    const c2 = (r: typeof a) =>
      r.parts.find((p) => p.partId === 'C2')!.params.find((q) => q.name === 'C')!.value;
    // Out of the big-cap zone (measured: 33 → ~18.9 µF, ripple even improved)…
    expect(c2(a)).toBeLessThan(30);
    // after.rippleDb is now the peak ±dB (the strip's unit) — a decent result
    // on this challenging big-cap net stays under ~3 dB peak.
    expect(a.after.rippleDb).toBeLessThan(3);
    // …and byte-identical across runs.
    expect(c2(b)).toBe(c2(a));
    expect(b.after.rippleDb).toBe(a.after.rippleDb);
  });
});

describe('amplifier-load floor (system Z ≥ 2.5 Ω fundamental)', () => {
  /** System |Zin| minimum of a parts array, straight from the solver. */
  const zMinOf = (parts: readonly VxpPart[]): number => {
    const { netlist } = crossoverToNetlist({ name: 'zmin', parts: [...parts] });
    const sol = solveNetwork(netlist, grid, driverZ);
    return Math.min(...sol.inputZ.map((c) => Math.hypot(c.re, c.im)));
  };

  it('lifts an amp-hostile shunt R across the input back above the floor', () => {
    // A 2 Ω resistor straight across the generator is RESPONSE-INVARIANT
    // (Rg = 1 mΩ voltage drive: driver voltages don't change whatever its
    // value) — the response objective has exactly zero gradient on it, so
    // only the amp-load floor REPAIR pass can rescue the amplifier. The
    // silent-failure case this fundamental exists for. (The floor lives at
    // decision level only — an fx term was tried and reverted, see
    // Z_FLOOR_OHM in netOptimizer.ts.)
    const seed: VxpPart[] = [
      ...crudeNetwork('none'),
      {
        type: 'Resistor',
        partId: 'RS1',
        params: [{ name: 'R', value: 2.0, unit: 'Ω' }],
        wires: [{ x: 3, y: 4 }, { x: 5, y: 11 }],
      },
      { type: 'Ground', params: [], wires: [{ x: 5, y: 11 }] },
    ];
    expect(zMinOf(seed)).toBeLessThan(2.1); // the seed really is amp-hostile
    const r = optimizeNetworkValues(seed, grid, wBase, tBase, driverZ, NO_ADJ, {
      phasePriority: 0.3,
    });
    // The repair must lift the dip (essentially) back to the 2.5 Ω floor;
    // 2.3 allows the barrier's soft tail plus the 0.15 acceptance tolerance.
    expect(zMinOf(r.parts)).toBeGreaterThan(2.3);
    expect(r.ampFloorNote).toContain('lifted');
    // …without buying it with response quality.
    expect(r.after.rippleDb).toBeLessThanOrEqual(r.before.rippleDb + 1e-9);
  });

  it('zFloorStrict repairs a machine-written seed the relative bar would excuse', () => {
    // THE BUG THIS PINS (measured on Sander's 3-way scan): the repair bar is
    // seed-relative — right for a designer's own network, meaningless when the
    // seed came out of our own synthesis. A seed dipping to ~0.4 Ω sets the
    // bar at ~0.4 Ω, so the pass "succeeds" without lifting anything, and all
    // four scan candidates shipped under the floor (winner: 0.5 Ω).
    const seed: VxpPart[] = [
      ...crudeNetwork('none'),
      {
        type: 'Resistor',
        partId: 'RS1',
        params: [{ name: 'R', value: 0.4, unit: 'Ω' }],
        wires: [{ x: 3, y: 4 }, { x: 5, y: 11 }],
      },
      { type: 'Ground', params: [], wires: [{ x: 5, y: 11 }] },
    ];
    expect(zMinOf(seed)).toBeLessThan(0.5);
    const lax = optimizeNetworkValues(seed, grid, wBase, tBase, driverZ, NO_ADJ, {
      phasePriority: 0.3,
    });
    const strict = optimizeNetworkValues(seed, grid, wBase, tBase, driverZ, NO_ADJ, {
      phasePriority: 0.3,
      zFloorStrict: true,
    });
    // THE INVARIANT, not a number: under strict the pass either reaches the
    // floor or says out loud that it could not. The relative bar has no such
    // obligation — it may accept whatever one barrier round happened to give
    // and still call the result healthy, which is precisely how a 0.5 Ω
    // network reached the top of a scan with every gate green.
    // (This synthetic seed recovers in one round, so lax lands well too; the
    // difference is the obligation, which is what must be pinned.)
    const strictMin = zMinOf(strict.parts);
    expect(strictMin > 2.3 || (strict.ampFloorNote ?? '').includes('could not be repaired')).toBe(
      true,
    );
    expect(strictMin).toBeGreaterThanOrEqual(zMinOf(lax.parts) - 1e-9);
    expect(strictMin).toBeGreaterThan(2.3);
    // The delivered minimum is reported either way — that number is what the
    // chain ranking judges, so it must exist even when nothing was repaired.
    expect(lax.after.zMinOhm).toBeDefined();
    expect(strict.after.zMinOhm).toBeGreaterThan(2.3);
  });

  it('a healthy network never enters the repair pass', () => {
    // The crude network's own system minimum sits ABOVE the floor (KOAN mid
    // 3.66 Ω + series L) — the repair must not trigger and the tune must
    // deliver its classic result untouched (regression: the floor is a
    // safety net at decision level, never a steering term).
    const r = optimizeNetworkValues(crudeNetwork('none'), grid, wBase, tBase, driverZ, NO_ADJ, {
      phasePriority: 0.3,
    });
    expect(zMinOf(r.parts)).toBeGreaterThan(3);
    expect(r.ampFloorNote).toBeUndefined();
    expect(r.after.rippleDb).toBeLessThan(r.before.rippleDb);
  });
});

describe('branch-target corridor (the leash, designer sequence 3/3)', () => {
  /** Delivered branch magnitudes of a parts array (dB per grid point). */
  const branchesOf = (parts: readonly VxpPart[]) => {
    const { netlist } = crossoverToNetlist({ name: 'leash', parts: [...parts] });
    const sol = solveNetwork(netlist, grid, driverZ);
    const hOf = (model: string) => {
      const d = sol.drivers.find((x) => x.model === model);
      return d ? sol.transfers[d.id] : undefined;
    };
    return {
      low: applyTransfer(wBase, hOf('mid')!).spl,
      high: applyTransfer(tBase, hOf('tweeter')!).spl,
    };
  };

  it('an ACHIEVABLE target is reached without leaving the corridor', () => {
    // The corridor is only an honest contract when the target is one the
    // design step would hand over: achievable, with sane levels. (Feeding it
    // the raw SEED branches of the pad-less crude net demands "keep the
    // tweeter 8 dB hot", which conflicts with the sum by construction — the
    // real chain never creates that, its targets carry the trims.) So:
    // targets = the branches of an UNLEASHED tune — reachable by definition —
    // and the leashed tune from the same seed must reach comparable quality
    // while staying inside the corridor. The bite (a rebuild costing ~60 fx)
    // is arithmetic on the weight; the no-harm direction is what needs proof.
    const seed = crudeNetwork('none');
    const free = optimizeNetworkValues(seed, grid, wBase, tBase, driverZ, NO_ADJ, {
      phasePriority: 0.3,
    });
    const tgt = branchesOf(free.parts);
    const r = optimizeNetworkValues(seed, grid, wBase, tBase, driverZ, NO_ADJ, {
      phasePriority: 0.3,
      branchTargets: { freq: [...grid], low: [...tgt.low], high: [...tgt.high] },
    });
    expect(r.after.rippleDb).toBeLessThanOrEqual(free.after.rippleDb * 1.25 + 0.05);
    const del = branchesOf(r.parts);
    // Judge only where the branch carries real level (its own top 25 dB) —
    // the same mask the chain sends; the stopband belongs to other guards.
    const maxDev = (got: readonly number[], want: readonly number[]): number => {
      const peak = Math.max(...want);
      let worst = 0;
      for (let i = 0; i < got.length; i++) {
        if (want[i] < peak - 25) continue;
        worst = Math.max(worst, Math.abs(got[i] - want[i]));
      }
      return worst;
    };
    // Corridor 3 dB is a soft barrier, so allow a little skin.
    expect(maxDev(del.low, tgt.low)).toBeLessThan(3.8);
    expect(maxDev(del.high, tgt.high)).toBeLessThan(3.8);
  });

  it('the corridor yields to the amp-load repair (the hierarchy)', () => {
    // Measured on Sanders' set: with the corridor counting inside the repair
    // pass, every candidate's Z-repair failed its own acceptance and the scan
    // shipped nine raw seeds (4.4–6.6 dB ripple, 0.1–2.0 Ω minima, absurd
    // BOMs). The floor is non-negotiable; branch fidelity yields to it. This
    // pins the regression: strict repair WITH targets present must still
    // reach the floor.
    const seed: VxpPart[] = [
      ...crudeNetwork('none'),
      {
        type: 'Resistor',
        partId: 'RS1',
        params: [{ name: 'R', value: 0.4, unit: 'Ω' }],
        wires: [{ x: 3, y: 4 }, { x: 5, y: 11 }],
      },
      { type: 'Ground', params: [], wires: [{ x: 5, y: 11 }] },
    ];
    const tgt = branchesOf(seed);
    const zMinOf = (parts: readonly VxpPart[]): number => {
      const { netlist } = crossoverToNetlist({ name: 'zc', parts: [...parts] });
      const sol = solveNetwork(netlist, grid, driverZ);
      return Math.min(...sol.inputZ.map((c) => Math.hypot(c.re, c.im)));
    };
    const r = optimizeNetworkValues(seed, grid, wBase, tBase, driverZ, NO_ADJ, {
      phasePriority: 0.3,
      zFloorStrict: true,
      branchTargets: { freq: [...grid], low: [...tgt.low], high: [...tgt.high] },
    });
    expect(zMinOf(r.parts)).toBeGreaterThan(2.3);
    expect(r.safetyNote).toBeUndefined();
  });
});

describe('catalog snap gating', () => {
  it('catalogSnap without an imported catalog is a no-op (continuous values kept)', () => {
    setCustomSeries([]);
    const r = optimizeNetworkValues(crudeNetwork('none'), grid, wBase, tBase, driverZ, NO_ADJ, {
      phasePriority: 0.3,
      catalogSnap: true,
    });
    // No import → the snap block never runs → no part carries a catalog SKU
    // attribution; the design keeps its continuous tuned values.
    expect(r.parts.every((p) => !p.catalog)).toBe(true);
  });
});

describe('4D(a) — an unmeasurable dissipation term must DROP OUT, not score zero', () => {
  it('a box tuning outside the grid gives the same result as switching the term off', () => {
    /* The distinction matters when candidates are compared: if a candidate
     * whose tuning cannot be probed simply adds 0 while another pays
     * w·(Rs/Re)², the first gets a free bonus and the comparison is invalid.
     *
     * Today the availability is a property of the RUN, not of the candidate —
     * it depends on (grid, fbHz), both fixed across a scan — so adding 0 is a
     * constant offset and the ranking is sound. This test pins that: with the
     * probe unavailable the optimiser must land on exactly what it lands on
     * with the term disabled. If a future change ever makes the band
     * per-candidate, this test is what fails.
     */
    const base = {
      phasePriority: 0.5,
      maxIterations: 60,
      catalogSnap: false,
      audit: { enabled: false as const },
    };
    // fbHz = 31 lies below the grid, so the probe refuses and the term drops.
    const unprobeable = optimizeNetworkValues(crudeNetwork('none'), grid, wBase, tBase, driverZ, NO_ADJ, {
      ...base,
      dissipationWeight: 0.05,
      audit: { enabled: false as const, fbHz: 31 },
    });
    // The same run with the term explicitly off.
    const off = optimizeNetworkValues(crudeNetwork('none'), grid, wBase, tBase, driverZ, NO_ADJ, {
      ...base,
      dissipationWeight: 0,
      audit: { enabled: false as const, fbHz: 31 },
    });
    expect(unprobeable.after.rippleDb).toBeCloseTo(off.after.rippleDb, 12);
    expect(unprobeable.evaluations).toBe(off.evaluations);
    expect(unprobeable.after.dissRatio).toBeUndefined();
    // And with a tuning INSIDE the grid the term is real again: it reports a
    // ratio, so the two runs are no longer interchangeable.
    const probeable = optimizeNetworkValues(crudeNetwork('none'), grid, wBase, tBase, driverZ, NO_ADJ, {
      ...base,
      dissipationWeight: 0.05,
      audit: { enabled: false as const, fbHz: 800 },
    });
    expect(probeable.after.dissRatio).toBeGreaterThanOrEqual(0);
  });
});

describe('A3d — the quality terms live on the band; the fundamentals deliberately do not', () => {
  it('SOLO: an absurd peak outside the band changes nothing at all', () => {
    /* The assertion Sander asked for, as behaviour rather than a runtime check:
     * if the objective never reads outside `band`, corrupting the response out
     * there must be invisible. A +40 dB spike is not subtle.
     *
     * SOLO is where the claim is exactly true, and that is not a dodge — it is
     * the definition. In solo there are zero driver PAIRS, so every
     * crossing-anchored guard drops out (documented in netOptimizer's `solo`
     * option) and the objective IS branch flatness. What remains is the pure
     * question: does the quality term respect its band? */
    const band: [number, number] = [500, 10000];
    const spike = (base: typeof wBase): typeof wBase => ({
      freq: base.freq,
      spl: base.spl.map((v, i) => (base.freq[i] < 400 || base.freq[i] > 12000 ? v + 40 : v)),
      phaseDeg: base.phaseDeg.map((v, i) =>
        base.freq[i] < 400 || base.freq[i] > 12000 ? v + 180 : v,
      ),
    });
    const opts = {
      phasePriority: 0.5,
      maxIterations: 80,
      band,
      solo: true,
      catalogSnap: false,
      audit: { enabled: false as const },
    };
    const clean = optimizeNetworkValues(crudeNetwork('none'), grid, wBase, tBase, driverZ, NO_ADJ, opts);
    const dirty = optimizeNetworkValues(crudeNetwork('none'), grid, spike(wBase), spike(tBase), driverZ, NO_ADJ, opts);
    expect(dirty.evaluations).toBe(clean.evaluations);
    expect(dirty.after.rippleDb).toBeCloseTo(clean.after.rippleDb, 12);
    const values = (r: typeof clean) =>
      r.parts
        .filter((p) => /Inductor|Capacitor|Resistor/.test(p.type))
        .map((p) => p.params.map((q) => q.value).join('/'));
    expect(values(dirty)).toEqual(values(clean));
    // The run says which band it worked on, so this is auditable afterwards
    // rather than only inside a test.
    expect(clean.bandNote).toMatch(/optimised on 500–10000 Hz/);
  });

  it('TWO-WAY: the fundamentals DO read outside the band, and that is the point of them', () => {
    /* Measured while writing the test above: with a crossing at 295 Hz and a
     * band of 500–10000, spiking the response outside the band moved both the
     * search and the landing point. The reason is not a leak — it is the
     * safety doctrine. xoDip spans [xo/4, xo·4], the leak guard
     * [xo/4, xo/1.6] ∪ [xo·1.6, xo·4] and driver protection f ≤ xo/3, all
     * anchored to the CROSSING rather than to the view range, precisely because
     * a zoomed-in band otherwise hides whole-design degeneration (the 0.68 µF
     * dead tweeter that this guard was built for).
     *
     * So the invariant is not "nothing outside the band" but:
     *   quality terms  — amplitude, phase, power — strictly inside;
     *   fundamentals   — deliberately wider, and documented as such.
     * This test pins the second half so nobody later "fixes" it into the first
     * and quietly removes the guard. */
    const band: [number, number] = [500, 10000];
    const spike = (base: typeof wBase): typeof wBase => ({
      freq: base.freq,
      spl: base.spl.map((v, i) => (base.freq[i] < 400 || base.freq[i] > 12000 ? v + 40 : v)),
      phaseDeg: base.phaseDeg,
    });
    const opts = {
      phasePriority: 0.5,
      maxIterations: 40,
      band,
      catalogSnap: false,
      audit: { enabled: false as const },
    };
    const clean = optimizeNetworkValues(crudeNetwork('none'), grid, wBase, tBase, driverZ, NO_ADJ, opts);
    const dirty = optimizeNetworkValues(crudeNetwork('none'), grid, spike(wBase), spike(tBase), driverZ, NO_ADJ, opts);
    /* The crossing lands near the bottom of the band (measured: ~890 Hz), so
     * its guards reach well below it — xo/4 is ~220 Hz — and they notice the
     * spike even though the quality terms cannot see it. */
    expect(clean.after.xoHz! / 4).toBeLessThan(band[0]);
    expect(dirty.after.rippleDb).not.toBeCloseTo(clean.after.rippleDb, 6);
  });
});

describe('A3e — the ranking\'s hard tier is a CONSTRAINT during the search', () => {
  it('a network forced past the source-resistance limit is rejected, and inside it nothing changes', () => {
    /* Two halves, and both matter.
     *
     * INSIDE the limit the constraint must contribute EXACTLY zero — otherwise
     * it is a weight in disguise and the anchor lesson applies: every added
     * term moves the search path, however small. So the same run with the
     * constraint on and off must be bit-identical when nothing violates it.
     *
     * OUTSIDE it the search must refuse to go there rather than optimising its
     * way into a design the ranking will discard anyway. */
    const opts = {
      phasePriority: 0.5,
      maxIterations: 60,
      catalogSnap: false,
      audit: { enabled: false as const },
    };
    /* The network needs a SERIES RESISTOR in the low branch for this to be
     * testable at all, and finding that out is itself the finding: with a fixed
     * topology and no series resistor, R_source is just the coil DCR, which the
     * value tuner does not move. Measured: 0.5 ohm at every limit from 0.001 to
     * 2.0, identical values throughout. So the constraint bites exactly where
     * R_source can move — a series resistor (Sander's Working(5) carried a
     * 3.3 ohm one), a pruned or escalated element, or the catalog snap picking
     * thinner wire. */
    const P = (x: number, y: number) => ({ x, y });
    const withPad = (): VxpPart[] => [
      { type: 'Generator', partId: 'G1', params: [{ name: 'Eg', value: 2.83, unit: 'V' }], wires: [P(3, 4), P(3, 11)] },
      { type: 'Ground', params: [], wires: [P(3, 11)] },
      { type: 'Resistor', partId: 'R1', params: [{ name: 'R', value: 3.3, unit: 'Ω' }], wires: [P(3, 4), P(9, 4)] },
      { type: 'Inductor', partId: 'L1', params: [{ name: 'L', value: 0.6, unit: 'mH' }, { name: 'DCR', value: 0.2, unit: 'Ω' }], wires: [P(9, 4), P(15, 4)] },
      { type: 'Driver', partId: 'D1', model: 'mid', inverted: false, params: [], wires: [P(15, 4), P(15, 11)] },
      { type: 'Ground', params: [], wires: [P(15, 11)] },
      { type: 'Capacitor', partId: 'C2', params: [{ name: 'C', value: 5.6, unit: 'uF' }], wires: [P(3, 14), P(9, 14)] },
      { type: 'Wire', params: [], wires: [P(3, 4), P(3, 14)] },
      { type: 'Driver', partId: 'D2', model: 'tweeter', inverted: false, params: [], wires: [P(9, 14), P(9, 21)] },
      { type: 'Ground', params: [], wires: [P(9, 21)] },
    ];
    const values = (r: { parts: VxpPart[] }) =>
      r.parts
        .filter((p) => /Inductor|Capacitor|Resistor/.test(p.type))
        .map((p) => p.params.map((q) => q.value).join('/'));

    /* And the low branch has to NEED its pad, or the amplitude term simply
     * tunes the resistor away for free — measured: 3.3 -> 0.19 ohm with no
     * constraint at all. A branch that is 12 dB hotter than the other cannot do
     * that: the level term holds the pad in place, so R_source and flatness
     * genuinely compete. That is Sander's case (his low branch ended at
     * 3.42 ohm while every flatness number looked fine), and it is the only
     * situation in which this constraint has anything to decide. */
    const hot: typeof wBase = { ...wBase, spl: wBase.spl.map((v) => v + 12) };
    const free = optimizeNetworkValues(withPad(), grid, hot, tBase, driverZ, NO_ADJ, opts);
    // INSIDE the limit: exactly zero contribution, so bit-identical.
    const loose = optimizeNetworkValues(withPad(), grid, hot, tBase, driverZ, NO_ADJ, {
      ...opts,
      rSourceDisqualifyOhm: 50,
    });
    expect(loose.after.rippleDb).toBeCloseTo(free.after.rippleDb, 12);
    expect(loose.evaluations).toBe(free.evaluations);
    expect(values(loose)).toEqual(values(free));

    /* OUTSIDE it the search moves substantially — but MEASURED, it does not
     * yet guarantee. On this fixture the delivered network goes from 7.17 to
     * 5.47 ohm against a 1.0 limit: a large push, not a wall.
     *
     * The likely reason, and it is the failure shape this codebase keeps
     * paying for: a guard enforced at step N and undone at step N+1. The
     * value search does respect the constraint, but the passes that run AFTER
     * it — the amplifier-floor repair in particular, which raises resistance
     * to lift an impedance dip — know nothing about it. Pinned as measured
     * rather than as hoped, so the gap is visible instead of asserted away. */
    const held = optimizeNetworkValues(withPad(), grid, hot, tBase, driverZ, NO_ADJ, {
      ...opts,
      rSourceDisqualifyOhm: 1.0,
    });
    expect(values(held)).not.toEqual(values(free));
    const rsFree = sourceResistanceOhm(free.parts, { grid, driverZ })!;
    const rsHeld = sourceResistanceOhm(held.parts, { grid, driverZ })!;
    expect(rsFree).toBeGreaterThan(6);
    expect(rsHeld).toBeLessThan(rsFree - 1);
  });
});

describe('A3f — a constraint survives the passes that run after the search', () => {
  it('a repair that can only succeed by breaking the limit is rolled back and declared infeasible', () => {
    /* The failure shape this codebase keeps paying for: a guard enforced at
     * step N and undone at step N+1. The amplifier-floor repair RAISES
     * resistance to lift an impedance dip, and resistance is exactly what the
     * source-resistance limit bounds — two passes turning the same knob in
     * opposite directions.
     *
     * The rule is not "pick the lesser evil": if both goals cannot hold, the
     * candidate is infeasible and says so. Silently choosing one is the only
     * outcome that is not allowed. */
    const P = (x: number, y: number) => ({ x, y });
    // A network with a series resistor big enough that any further increase
    // breaks a tight limit, feeding a hot branch so the pad cannot just go.
    const net = (): VxpPart[] => [
      { type: 'Generator', partId: 'G1', params: [{ name: 'Eg', value: 2.83, unit: 'V' }], wires: [P(3, 4), P(3, 11)] },
      { type: 'Ground', params: [], wires: [P(3, 11)] },
      { type: 'Resistor', partId: 'R1', params: [{ name: 'R', value: 3.3, unit: 'Ω' }], wires: [P(3, 4), P(9, 4)] },
      { type: 'Inductor', partId: 'L1', params: [{ name: 'L', value: 0.6, unit: 'mH' }, { name: 'DCR', value: 0.2, unit: 'Ω' }], wires: [P(9, 4), P(15, 4)] },
      { type: 'Driver', partId: 'D1', model: 'mid', inverted: false, params: [], wires: [P(15, 4), P(15, 11)] },
      { type: 'Ground', params: [], wires: [P(15, 11)] },
      { type: 'Capacitor', partId: 'C2', params: [{ name: 'C', value: 5.6, unit: 'uF' }], wires: [P(3, 14), P(9, 14)] },
      { type: 'Wire', params: [], wires: [P(3, 4), P(3, 14)] },
      { type: 'Driver', partId: 'D2', model: 'tweeter', inverted: false, params: [], wires: [P(9, 14), P(9, 21)] },
      { type: 'Ground', params: [], wires: [P(9, 21)] },
    ];
    const hot: typeof wBase = { ...wBase, spl: wBase.spl.map((v) => v + 12) };
    const opts = {
      phasePriority: 0.5,
      maxIterations: 60,
      catalogSnap: false,
      audit: { enabled: false as const },
      rSourceDisqualifyOhm: 1.0,
    };
    const r = optimizeNetworkValues(net(), grid, hot, tBase, driverZ, NO_ADJ, opts);
    const rs = sourceResistanceOhm(r.parts, { grid, driverZ })!;
    /* The one outcome that is forbidden is passing silently: either the
     * delivered design is inside the limit, or it is marked infeasible with the
     * reason. Both are acceptable answers about this candidate. */
    const insideLimit = rs < 1.0;
    expect(insideLimit || r.infeasible !== undefined).toBe(true);
    if (r.infeasible) {
      expect(r.infeasible).toMatch(/infeasible|limit/);
      // And the design returned is still the last one that satisfied every
      // constraint, so it is safe to look at.
      expect(r.parts.length).toBeGreaterThan(0);
    }
  });

  it('the figure a ranking judges on is the one the delivered network measures', () => {
    /* Found by measuring A3f on Sanders project, and it is the same disease as
     * the bug that started this round: the number in the table was not the
     * number of the thing delivered. `audit.rSourceOhm` is frozen at gate 4 —
     * the code there says so, "before the shrink ladder and the snap" — and
     * both of those passes still move source resistance. His 562/2270 candidate
     * was struck through on the audit's 2.0002 Ω while the network that would
     * actually be built measures 1.64 Ω, inside the 2.0 Ω limit.
     *
     * So the constraint was doing its job and the RANKING was reading a stale
     * number. The rule is the A3f rule one level up: one definition, asked by
     * everything that judges. */
    const P = (x: number, y: number) => ({ x, y });
    const net = (): VxpPart[] => [
      { type: 'Generator', partId: 'G1', params: [{ name: 'Eg', value: 2.83, unit: 'V' }], wires: [P(3, 4), P(3, 11)] },
      { type: 'Ground', params: [], wires: [P(3, 11)] },
      { type: 'Resistor', partId: 'R1', params: [{ name: 'R', value: 2.2, unit: 'Ω' }], wires: [P(3, 4), P(9, 4)] },
      { type: 'Inductor', partId: 'L1', params: [{ name: 'L', value: 0.6, unit: 'mH' }, { name: 'DCR', value: 0.2, unit: 'Ω' }], wires: [P(9, 4), P(15, 4)] },
      { type: 'Driver', partId: 'D1', model: 'mid', inverted: false, params: [], wires: [P(15, 4), P(15, 11)] },
      { type: 'Ground', params: [], wires: [P(15, 11)] },
      { type: 'Capacitor', partId: 'C2', params: [{ name: 'C', value: 5.6, unit: 'uF' }], wires: [P(3, 14), P(9, 14)] },
      { type: 'Wire', params: [], wires: [P(3, 4), P(3, 14)] },
      { type: 'Driver', partId: 'D2', model: 'tweeter', inverted: false, params: [], wires: [P(9, 14), P(9, 21)] },
      { type: 'Ground', params: [], wires: [P(9, 21)] },
    ];
    const hot: typeof wBase = { ...wBase, spl: wBase.spl.map((v) => v + 12) };
    const r = optimizeNetworkValues(net(), grid, hot, tBase, driverZ, NO_ADJ, {
      phasePriority: 0.5,
      maxIterations: 60,
      catalogSnap: false,
      audit: { enabled: true as const, thresholds: { rSourceOhm: 1.0 } },
      rSourceDisqualifyOhm: 2.0,
    });
    // The judged figure lives in `after`, which report() builds from the parts
    // handed over — so it is delivered BY CONSTRUCTION (A3g).
    expect(r.after.rSourceOhm).not.toBeNull();
    const measured = sourceResistanceOhm(r.parts, { grid, driverZ })!;
    expect(r.after.rSourceOhm!).toBeCloseTo(measured, 9);
    // And `before` is the seed's, measured on the seed's parts.
    const seedRs = sourceResistanceOhm(net(), { grid, driverZ })!;
    expect(r.before.rSourceOhm!).toBeCloseTo(seedRs, 9);
  });
});

describe('A3i-2 — the derived load floor is a constraint, not a weight', () => {
  const P = (x: number, y: number) => ({ x, y });
  /* A shunt resistor across the terminals: a load the tuner cannot filter its
   * way out of, so the constraint has something real to bite on. */
  const net = (shuntOhm: number): VxpPart[] => [
    { type: 'Generator', partId: 'G1', params: [{ name: 'Eg', value: 2.83, unit: 'V' }], wires: [P(3, 4), P(3, 11)] },
    { type: 'Ground', params: [], wires: [P(3, 11)] },
    { type: 'Resistor', partId: 'R9', locked: true, params: [{ name: 'R', value: shuntOhm, unit: 'Ω' }], wires: [P(3, 4), P(3, 11)] },
    { type: 'Inductor', partId: 'L1', params: [{ name: 'L', value: 0.6, unit: 'mH' }, { name: 'DCR', value: 0.2, unit: 'Ω' }], wires: [P(3, 4), P(9, 4)] },
    { type: 'Driver', partId: 'D1', model: 'mid', inverted: false, params: [], wires: [P(9, 4), P(9, 11)] },
    { type: 'Ground', params: [], wires: [P(9, 11)] },
    { type: 'Capacitor', partId: 'C2', params: [{ name: 'C', value: 5.6, unit: 'uF' }], wires: [P(3, 14), P(9, 14)] },
    { type: 'Wire', params: [], wires: [P(3, 4), P(3, 14)] },
    { type: 'Driver', partId: 'D2', model: 'tweeter', inverted: false, params: [], wires: [P(9, 14), P(9, 21)] },
    { type: 'Ground', params: [], wires: [P(9, 21)] },
  ];
  const run = (parts: VxpPart[], loadFloor?: { nominalOhm: number }) =>
    optimizeNetworkValues(parts, grid, wBase, tBase, driverZ, NO_ADJ, {
      phasePriority: 0.5,
      maxIterations: 40,
      catalogSnap: false,
      audit: { enabled: false as const },
      ...(loadFloor ? { loadFloor } : {}),
    });

  it('OFF by default — every existing path stays bit-identical', () => {
    /* The anchor lesson, tested rather than asserted: a term that is supposed
     * to contribute exactly zero has to be shown to contribute exactly zero,
     * because "small" is not "none" for a deterministic simplex. */
    const a = run(net(8));
    const b = run(net(8), { nominalOhm: 2 }); // 1.6 Ω floor, comfortably clear
    expect(b.after.rippleDb).toBeCloseTo(a.after.rippleDb, 12);
    expect(b.evaluations).toBe(a.evaluations);
    expect(b.infeasible).toBeUndefined();
  });

  it('a load the filter cannot lift is declared INFEASIBLE, with the numbers', () => {
    const r = run(net(1.2), { nominalOhm: 4 }); // 3.2 Ω floor, 1.2 Ω shunt
    expect(r.infeasible).toBeDefined();
    expect(r.infeasible!).toMatch(/against a floor of/);
    expect(r.infeasible!).toMatch(/4 Ω nominal, IEC 60268-5/);
    // Never "silently worse": the one forbidden outcome.
    expect(r.after.zMinOhm!).toBeLessThan(3.2);
  });

  it('the floor is frequency-dependent, and that changes the verdict', () => {
    /* The same dip judged twice. A shunt that breaches a 3.2 Ω floor in the
     * bass clears the relaxed floor above 4 kHz, because the limit is on
     * CURRENT and programme voltage falls there. A flat threshold cannot make
     * that distinction, which is the whole reason the curve has a shape. */
    const flatLow = floorCurve(grid, 4).floorOhm[0];
    const top = floorCurve(grid, 4).floorOhm[grid.length - 1];
    expect(flatLow).toBeCloseTo(3.2, 6);
    expect(top).toBeCloseTo(1.6, 6);
  });
});

describe('A3g — every judged quantity describes the network that ships', () => {
  /* These tests are boring on purpose. Four times now a number that looked
   * like it described what was happening described something else, with green
   * tests around it — because nothing ever asserted the one property that
   * matters: the figure a caller judges on belongs to the parts it was handed.
   *
   * `after` is built by report(metrics, parts) from `outParts`, so the
   * property holds BY CONSTRUCTION. What these pin is that the construction is
   * real, for every quantity in the inventory, so a future pass appended after
   * the reporting cannot quietly break it again. */
  const P = (x: number, y: number) => ({ x, y });
  const seedNet = (): VxpPart[] => [
    { type: 'Generator', partId: 'G1', params: [{ name: 'Eg', value: 2.83, unit: 'V' }], wires: [P(3, 4), P(3, 11)] },
    { type: 'Ground', params: [], wires: [P(3, 11)] },
    { type: 'Inductor', partId: 'L1', params: [{ name: 'L', value: 0.6, unit: 'mH' }, { name: 'DCR', value: 0.2, unit: 'Ω' }], wires: [P(3, 4), P(9, 4)] },
    { type: 'Driver', partId: 'D1', model: 'mid', inverted: false, params: [], wires: [P(9, 4), P(9, 11)] },
    { type: 'Ground', params: [], wires: [P(9, 11)] },
    { type: 'Capacitor', partId: 'C1', params: [{ name: 'C', value: 5.6, unit: 'uF' }], wires: [P(3, 14), P(9, 14)] },
    { type: 'Wire', params: [], wires: [P(3, 4), P(3, 14)] },
    { type: 'Driver', partId: 'D2', model: 'tweeter', inverted: false, params: [], wires: [P(9, 14), P(9, 21)] },
    { type: 'Ground', params: [], wires: [P(9, 21)] },
  ];
  const run = (extra: Record<string, unknown> = {}) =>
    optimizeNetworkValues(seedNet(), grid, wBase, tBase, driverZ, NO_ADJ, {
      phasePriority: 0.5,
      maxIterations: 40,
      catalogSnap: false,
      audit: { enabled: true as const, thresholds: { rSourceOhm: 1.0 } },
      ...extra,
    });

  it('re-solving the delivered parts reproduces every number in `after`', () => {
    /* WITH A SAFETY GRID ARMED, because zMinOf takes the worst of the eval grid
     * and the safety grid — and the safety half re-solves from `ps`. If that
     * argument were ever dropped for a captured variable, Z-min would silently
     * describe a different network than R_source does, which is the question
     * Sander asked before trusting any Z number in the scan table. */
    const r = run({
      safety: { freqs: grid, w: wBase, t: tBase, z: driverZ },
    });
    /* The independent check: take the parts that came out, run them through
     * the SAME optimiser with nothing free to move, and read its `before`.
     * If any field in `after` belonged to an earlier network, this disagrees. */
    let leftOne = false;
    const locked = r.parts.map((p) => {
      if (!/Resistor|Inductor|Capacitor/.test(p.type) || leftOne) return { ...p, locked: true };
      leftOne = true;
      return { ...p, locked: false }; // one free part, else the tuner refuses
    });
    const re = optimizeNetworkValues(locked, grid, wBase, tBase, driverZ, NO_ADJ, {
      phasePriority: 0.5,
      maxIterations: 1, // and `before` is read, so nothing it does can reach it
      catalogSnap: false,
      audit: { enabled: false as const },
      safety: { freqs: grid, w: wBase, t: tBase, z: driverZ },
    });
    expect(re.before.rippleDb).toBeCloseTo(r.after.rippleDb, 9);
    expect(re.before.avgDevDb!).toBeCloseTo(r.after.avgDevDb!, 9);
    expect(re.before.phaseDeg).toBeCloseTo(r.after.phaseDeg, 9);
    expect(re.before.zMinOhm!).toBeCloseTo(r.after.zMinOhm!, 9);
    expect(re.before.rSourceOhm!).toBeCloseTo(r.after.rSourceOhm!, 9);
  });

  it('the audit is a diagnostic of the tuned network and cannot be mistaken for the verdict', () => {
    const r = run();
    // The name says which network it describes; the old `rSourceOhm` on the
    // audit is gone, so a ranking cannot reach for it by muscle memory.
    expect(r.audit).toBeDefined();
    expect('rSourceOhm' in (r.audit as object)).toBe(false);
    expect(r.audit!.rSourceTunedOhm === null || Number.isFinite(r.audit!.rSourceTunedOhm)).toBe(true);
    // The judged figure exists independently and is the delivered one.
    expect(r.after.rSourceOhm).not.toBeNull();
    expect(r.after.rSourceOhm!).toBeCloseTo(sourceResistanceOhm(r.parts, { grid, driverZ })!, 9);
  });

  it('the amplifier-load outcome is a value, and an unrepaired floor disqualifies', () => {
    /* A shunt resistor straight across the generator is a load no filter can
     * fix: the tuner may not remove it (it is a free VALUE, not a topology
     * choice) and no value of the others lifts the minimum off the floor.
     * Before A3g this shipped with a warning; Sanders NAD M10 V2 drops into
     * protection below 2 Ω, so that is not a worse design, it is one the
     * amplifier refuses. */
    const shorted = (): VxpPart[] => [
      ...seedNet(),
      { type: 'Resistor', partId: 'R9', locked: true, params: [{ name: 'R', value: 0.5, unit: 'Ω' }], wires: [P(3, 4), P(3, 11)] },
    ];
    const r = optimizeNetworkValues(shorted(), grid, wBase, tBase, driverZ, NO_ADJ, {
      phasePriority: 0.5,
      maxIterations: 30,
      catalogSnap: false,
      zFloorStrict: true,
      audit: { enabled: false as const },
    });
    expect(r.after.zMinOhm!).toBeLessThan(Z_FLOOR_OHM);
    // A typed outcome — no caller has to read prose to learn what happened.
    expect(['failed', 'refused']).toContain(r.ampFloorRepair);
    expect(r.infeasible).toBeDefined();
    expect(r.infeasible!).toMatch(/amplifier/);
    // And the number in the sentence is the delivered one, not the pass's.
    const stated = /presents ([\d.]+) Ω/.exec(r.infeasible!);
    expect(stated).not.toBeNull();
    expect(parseFloat(stated![1])).toBeCloseTo(r.after.zMinOhm!, 1);
  });

  it('a healthy design says so with the same machinery', () => {
    const r = run();
    expect(r.ampFloorRepair).toBe('none');
    expect(r.infeasible).toBeUndefined();
  });
});
