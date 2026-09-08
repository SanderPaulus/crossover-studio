/**
 * E-3 — CASUS 1b THROUGH THE TWO-WAY ROUTE OF THE v2 WORKER.
 *
 * The cheap half: the generator's record is consistent with the fixture (the
 * gates it armed, the seed, the band, the declaration it carried, a runtime on
 * every candidate), and the E-3 measurement that made the route usable is
 * pinned on the synthesis alone — no chain run. The dear half is one `[live]`
 * `[bytes]` reproduction of the cheapest delivered netlist through
 * `handleV2Request` kind `v2ChainOne`, the way `casus1V2Candidates.test.ts`
 * does it for the three-way corpus. Both tags for the reasons `ciLayer.test.ts`
 * gives: a live chain run is planning (`test:fast` skips it) and a byte
 * comparison of a tuner run holds per (machine, runtime) only (A5e.4, V46).
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stableJson } from './optimizer/determinism.ts';
import { handleV2Request, type V2ChainOnePayload, type V2Response } from './optimizer/worker.ts';
import type { ChainResult } from '../designChain.ts';
import { synthesize } from '../synthesis.ts';
import { evalDriverFilter } from '../filters.ts';
import { ALIVE_DB } from '../threeWayChain.ts';
import {
  CASUS1B_CONTINUOUS_POWER_W,
  CASUS1B_DIR,
  CASUS1B_TARGET_CURVE,
  CASUS1B_V2_BAND_HZ,
  CASUS1B_V2_BUDGETS,
  CASUS1B_V2_GATES,
  CASUS1B_V2_GRID,
  CASUS1B_V2_SEED,
  CASUS1B_V2_SETTINGS,
  casus1bChainInput,
  casus1bChainInputFor,
  casus1bField,
  casus1bFiles,
  casus1bManifest,
  casus1bReport,
  casus1bSeed,
  casus1bV2Declaration,
  casus1bV2Facts,
  loadGolden1b,
} from './casus1b.fixture.ts';

interface Herkomst {
  seed: number;
  oordeelband_hz: [number, number];
  grid: { van_hz: number; tot_hz: number; punten: number };
  meetopstelling: {
    v2_poorten_gewapend: string[];
    v2_budgetten_gewapend: string[];
    beschermingen_via_kandidaat: string[];
    ketenverklaring: { stated: Record<string, unknown> };
    zoekmaat_gladding_oct: number | null;
    vloer_zoekdoel_bron: string | null;
  };
  shortlist: { overwogen: number; bevroren: number; leverde_geen_netwerk: number };
  kandidaat_uitkomst: { label: string; geleverd: boolean; looptijd_s: number; verwerping: { regels: string[]; reden: string } | null }[];
  bestanden: { name: string; label: string }[];
}
const HERKOMST = JSON.parse(readFileSync(join(CASUS1B_DIR, '..', 'casus1b_v2_herkomst.json'), 'utf-8')) as Herkomst;
const golden = loadGolden1b();
const manifest = casus1bManifest(golden);
const files = casus1bFiles(manifest);
const report = casus1bReport(null, manifest, files, golden);
const field = casus1bField(report);
const gridded = casus1bChainInput(manifest, files);

describe('E-3 casus 1b — the record of the two-way run agrees with the fixture', () => {
  it('the gates, the budgets, the seed and the band the generator recorded are the fixture\'s', () => {
    expect(HERKOMST.seed).toBe(CASUS1B_V2_SEED);
    expect(HERKOMST.oordeelband_hz).toEqual(CASUS1B_V2_BAND_HZ);
    expect(HERKOMST.grid.punten).toBe(CASUS1B_V2_GRID.length);
    expect(HERKOMST.meetopstelling.v2_poorten_gewapend).toEqual(Object.keys(CASUS1B_V2_GATES).sort());
    expect(HERKOMST.meetopstelling.v2_budgetten_gewapend).toEqual(Object.keys(CASUS1B_V2_BUDGETS).sort());
    // No budget on casus 1b, and the record says why (the two casus-1 budgets are woofer-bound).
    expect(HERKOMST.meetopstelling.v2_budgetten_gewapend).toEqual([]);
  });

  it('the declaration the generator carried is the declaration the fixture builds today, key for key', () => {
    const c = field.field.candidates[field.field.candidates.length - 1];
    const decl = casus1bV2Declaration(c, gridded.safety);
    /* THE DELTA BETWEEN THE RECORD AND TODAY, NAMED — and since C-2 it is
     * EMPTY, because casus 1b was regenerated on the same engine casus 1 was.
     * At E-4 it held `coilSnapDcrCeiling`: the record predated that key and
     * rewriting it would have needed a generator run. This is the V15 bridge
     * form and it stays in place empty, so the next key that arrives without a
     * regeneration has somewhere to be named — the claim is exact in both
     * directions, a key that appears unnamed fails and so does one that stops
     * appearing. */
    const SINCE_THE_RECORD: string[] = [];
    expect(Object.keys(decl.declaration.stated).sort()).toEqual(
      [...HERKOMST.meetopstelling.beschermingen_via_kandidaat, ...SINCE_THE_RECORD].sort(),
    );
    for (const k of SINCE_THE_RECORD) {
      expect(HERKOMST.meetopstelling.beschermingen_via_kandidaat, `${k} is in the record after all`).not.toContain(k);
    }
    expect(stableJson(decl.chainDeclaration.stated)).toBe(stableJson(HERKOMST.meetopstelling.ketenverklaring.stated));
    /* The two E-3 readings that made this route usable, as the record shows
     * them: the search smoothing is stated (and reaches the vf design step),
     * and the synthesis fits on the alive points. */
    expect(HERKOMST.meetopstelling.zoekmaat_gladding_oct).toBe(0);
    expect(decl.chainDeclaration.stated.synthesisGrid).toBe('alive');
    expect(HERKOMST.meetopstelling.vloer_zoekdoel_bron).toBe(decl.declaration.stated.zFloorBarrierSource);
  });

  it('every candidate carries a recorded runtime, and the shortlist counts add up', () => {
    expect(HERKOMST.kandidaat_uitkomst).toHaveLength(field.field.candidates.length);
    for (const o of HERKOMST.kandidaat_uitkomst) {
      expect(o.looptijd_s).toBeGreaterThan(0);
      expect(field.field.candidates.some((c) => c.label === o.label), o.label).toBe(true);
    }
    expect(HERKOMST.shortlist.overwogen).toBe(field.field.candidates.length);
    expect(HERKOMST.shortlist.leverde_geen_netwerk).toBe(HERKOMST.kandidaat_uitkomst.filter((o) => o.verwerping !== null).length);
    expect(HERKOMST.shortlist.bevroren).toBe(HERKOMST.bestanden.length);
    expect(HERKOMST.shortlist.bevroren).toBeLessThanOrEqual(HERKOMST.kandidaat_uitkomst.filter((o) => o.geleverd).length);
  });

  it('E-3, the measurement behind the fifth chain key: on the FULL grid the tweeter branch degenerates, on the alive points it builds', () => {
    /* The synthesis alone, no chain run. The grid's top point (20 000 Hz) is a
     * silent ghost on both ways — the far field ends there — and a fit that
     * sees it chases a -400 dB target into a branch that presents next to
     * nothing to the amplifier (`degenerateLoad`). The three-way chain has
     * always excluded such points (`threeWayChain.ts`, `ALIVE_DB`); the
     * two-way chain did not, and every exploration candidate of casus 1b came
     * back degenerate until E-3 wired `synthesisGrid`. Asserted on the
     * tweeter's HP at the middle candidate, the shape the generator's vf step
     * delivered. */
    const c = field.field.candidates[Math.floor(field.field.candidates.length / 2)];
    const grid = [...gridded.grid];
    const t = gridded.t;
    expect(t.spl[grid.length - 1]).toBeLessThan(ALIVE_DB);
    expect(t.spl.filter((v) => v <= ALIVE_DB)).toHaveLength(1);
    const spec = {
      gainDb: 0,
      hp: { enabled: true, kind: 'LR' as const, order: 4 as const, freq: c.crossings[0].hz },
      lp: { enabled: false, kind: 'LR' as const, order: 2 as const, freq: 20000 },
      eq: [],
    };
    void evalDriverFilter;
    const opts = {
      mode: CASUS1B_V2_SETTINGS.synthMode,
      phasePriority: CASUS1B_V2_SETTINGS.phasePriority,
      catalogSnap: false,
      corrections: 'lean' as const,
      leanTargetDb: CASUS1B_V2_SETTINGS.targets!.rippleDb,
      label: 'high',
    };
    const full = synthesize(spec, grid, gridded.driverZ.tweeter, { ...opts, driverSplDb: [...t.spl] });
    const alive = grid.map((_, i) => i).filter((i) => t.spl[i] > ALIVE_DB);
    const sub = synthesize(spec, alive.map((i) => grid[i]), alive.map((i) => gridded.driverZ.tweeter[i]), {
      ...opts,
      driverSplDb: alive.map((i) => t.spl[i]),
    });
    expect(full.degenerateLoad, 'the full-grid fit did not degenerate — the E-3 finding no longer holds').toBeTruthy();
    expect(full.degenerateLoad!.atHz).toBe(grid[grid.length - 1]);
    expect(sub.degenerateLoad).toBeUndefined();
    expect(sub.inputZMinOhm).toBeGreaterThan(full.inputZMinOhm);
  }, 120_000);
});

/**
 * THE LIVE HALF. `[live]` and `[bytes]` on the one `it`, the tag guard in
 * `casus1V2Candidates.test.ts` and the inventories in `ciLayer.test.ts` name it.
 */
describe('[live] casus 1b: the two-way route still delivers the frozen netlist', () => {
  it('[bytes] casus 1b: the cheapest delivered netlist, by recorded runtime, live through v2ChainOne, byte for byte', () => {
    const delivered = HERKOMST.bestanden
      .map((b) => ({ ...b, looptijd_s: HERKOMST.kandidaat_uitkomst.find((o) => o.label === b.label)?.looptijd_s ?? NaN }))
      .sort((a, b) => a.looptijd_s - b.looptijd_s || (a.label < b.label ? -1 : 1));
    if (delivered.length === 0) {
      expect(HERKOMST.shortlist.bevroren).toBe(0);
      return;
    }
    const target = delivered[0];
    expect(Number.isFinite(target.looptijd_s), `${target.name} has no recorded runtime`).toBe(true);
    const c = field.field.candidates.find((x) => x.label === target.label);
    expect(c, `the field no longer holds ${target.label}`).toBeTruthy();
    const payload: V2ChainOnePayload = {
      input: casus1bChainInputFor(c!, gridded, casus1bSeed()),
      label: c!.label,
      v2: {
        ...casus1bV2Facts(report, manifest, files),
        gates: { ...CASUS1B_V2_GATES },
        budgets: { ...CASUS1B_V2_BUDGETS },
        determinism: { seed: CASUS1B_V2_SEED },
        targetCurve: CASUS1B_TARGET_CURVE,
        judgeBandHz: CASUS1B_V2_BAND_HZ,
        ...(CASUS1B_CONTINUOUS_POWER_W !== null ? { amplifierPowerW: CASUS1B_CONTINUOUS_POWER_W } : {}),
      },
      candidate: casus1bV2Declaration(c!, gridded.safety),
    };
    expect(Object.keys(payload.v2.gates ?? {}).sort()).toEqual(HERKOMST.meetopstelling.v2_poorten_gewapend);
    const wire = structuredClone({ id: 1, kind: 'v2ChainOne' as const, payload });
    let out: ChainResult | null = null;
    let rejection: unknown = null;
    handleV2Request(wire, (m: V2Response) => {
      if (m.kind === 'error') throw new Error(m.message);
      if (m.kind === 'done') {
        const d = m.data as { result: ChainResult; rejection: unknown };
        out = d.result;
        rejection = d.rejection;
      }
    });
    expect(out).toBeTruthy();
    expect(rejection, 'the run refused where the record delivered').toBeNull();
    const stored = JSON.parse(readFileSync(join(CASUS1B_DIR, `${target.name}.adsfilter.json`), 'utf-8')) as { parts: unknown[] };
    expect(stableJson((out as unknown as ChainResult).parts)).toBe(stableJson(stored.parts));
    expect(stored.parts.length).toBeGreaterThan(6);
  }, 900_000);
});
