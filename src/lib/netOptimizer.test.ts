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
import { solveNetwork } from './network.ts';
import { allSeries, bomFor, setCustomSeries } from './catalog.ts';
import { deserializeCatalog } from './catalogFile.ts';
import {
  busPositions,
  optimizeNetworkValues,
  reseedOutliers,
  NetOptimizeError,
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
    // Just beyond what value tuning alone achieved → escalation mode.
    const staged = {
      rippleDb: Math.max(plain.after.rippleDb * 0.8, 0.05),
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

describe('amplifier-load floor (system Z ≥ 3 Ω fundamental)', () => {
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
    // The repair must lift the dip (essentially) back to the floor; 2.8
    // allows the barrier's soft tail near 3.0.
    expect(zMinOf(r.parts)).toBeGreaterThan(2.8);
    expect(r.ampFloorNote).toContain('lifted');
    // …without buying it with response quality.
    expect(r.after.rippleDb).toBeLessThanOrEqual(r.before.rippleDb + 1e-9);
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
