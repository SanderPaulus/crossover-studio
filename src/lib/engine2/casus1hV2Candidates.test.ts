/**
 * H-1 — CASUS 1h THROUGH THE HYBRID ROUTE OF THE v2 WORKER.
 *
 * The cheap half: the generator's record is consistent with the fixture (the
 * gates it armed, the seed, the band, the declaration it carried, a runtime and
 * a stated active handover on every candidate), and the two things that make
 * this route what it is — the stated high-pass on the lowest passive way, and
 * the SECOND PASS that levels the active side against what was built — are
 * pinned on the record rather than on a chain run.
 *
 * The dear half is one `[live]` `[bytes]` reproduction of the cheapest
 * delivered netlist, the way `casus1bV2Candidates.test.ts` does it for the
 * two-way corpus. Both tags for the reasons `ciLayer.test.ts` gives.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stableJson } from './optimizer/determinism.ts';
import { handleV2Request, type V2ChainOnePayload, type V2Response } from './optimizer/worker.ts';
import type { ChainResult } from '../designChain.ts';
import {
  ACTIVE_WAY,
  CASUS1H_ACTIVE,
  CASUS1H_CONTINUOUS_POWER_W,
  CASUS1H_DIR,
  CASUS1H_TARGET_CURVE,
  CASUS1H_V2_BAND_HZ,
  CASUS1H_V2_BUDGETS,
  CASUS1H_V2_GATES,
  CASUS1H_V2_GRID,
  CASUS1H_V2_SEED,
  PASSIVE_LOWEST_WAY,
  casus1hActiveAt,
  casus1hChainInput,
  casus1hChainInputFor,
  casus1hField,
  casus1hFiles,
  casus1hManifest,
  casus1hSeed,
  casus1hSettingsAt,
  casus1hV2Declaration,
  casus1hV2Facts,
} from './casus1h.fixture.ts';

interface Herkomst {
  seed: number;
  oordeelband_hz: [number, number];
  grid: { van_hz: number; tot_hz: number; punten: number };
  actieve_zijde: {
    actieve_weg: string;
    onderste_passieve_weg: string;
    doelvorm: string;
    per_overname: { hz: number; gain_dB: number; delay_ms: number; omgekeerd: boolean; nul_marge_dB: number }[];
  };
  meetopstelling: {
    v2_poorten_gewapend: string[];
    v2_budgetten_gewapend: string[];
    beschermingen_via_kandidaat: string[];
    actieve_zijde_verklaard: boolean;
    zoekmaat_gladding_oct: number | null;
  };
  shortlist: { overwogen: number; bevroren: number; leverde_geen_netwerk: number };
  kandidaat_uitkomst: {
    label: string;
    geleverd: boolean;
    looptijd_s: number;
    actieve_overname_hz: number;
    hoogdoorlaat_op_de_onderste_passieve_weg: { enabled: boolean; kind: string; orde: number; hz: number };
    dsp_geleverd: { gain_dB: number; klasse_A_gain_dB: number; delay_ms: number; omgekeerd: boolean } | null;
    verwerping: { regels: string[]; reden: string } | null;
  }[];
  bestanden: { name: string; label: string }[];
}
const HERKOMST = JSON.parse(readFileSync(join(CASUS1H_DIR, '..', 'casus1h_v2_herkomst.json'), 'utf-8')) as Herkomst;
const manifest = casus1hManifest();
const files = casus1hFiles(manifest);
const activeOf = (hz: number) => casus1hActiveAt(hz, manifest, files);

describe('H-1 casus 1h — the record of the hybrid run agrees with the fixture', () => {
  it('the gates, the budgets, the seed and the band the generator recorded are the fixture\'s', () => {
    expect(HERKOMST.seed).toBe(CASUS1H_V2_SEED);
    expect(HERKOMST.oordeelband_hz).toEqual(CASUS1H_V2_BAND_HZ);
    expect(HERKOMST.grid.punten).toBe(CASUS1H_V2_GRID.length);
    expect(HERKOMST.meetopstelling.v2_poorten_gewapend).toEqual(Object.keys(CASUS1H_V2_GATES).sort());
    expect(HERKOMST.meetopstelling.v2_budgetten_gewapend).toEqual(Object.keys(CASUS1H_V2_BUDGETS).sort());
    /* M-D is not among them, and that is the measured half of this casus. */
    expect(HERKOMST.meetopstelling.v2_budgetten_gewapend).not.toContain('lfBumpBudgetDb');
    expect(HERKOMST.meetopstelling.v2_budgetten_gewapend).toContain('qesMultiplierMax');
  });

  it('the active side is DECLARED, and the record\'s settings are the ones the fixture derives today', () => {
    expect(HERKOMST.meetopstelling.actieve_zijde_verklaard).toBe(true);
    expect(HERKOMST.actieve_zijde.actieve_weg).toBe(ACTIVE_WAY);
    expect(HERKOMST.actieve_zijde.onderste_passieve_weg).toBe(PASSIVE_LOWEST_WAY);
    expect(HERKOMST.actieve_zijde.doelvorm).toBe(`${CASUS1H_ACTIVE.kind}${CASUS1H_ACTIVE.order}`);
    expect(HERKOMST.actieve_zijde.per_overname.map((p) => p.hz)).toEqual(CASUS1H_ACTIVE.positionsHz);
    for (const p of HERKOMST.actieve_zijde.per_overname) {
      const a = activeOf(p.hz);
      expect(a.settings.gainDb, `${p.hz} Hz gain`).toBeCloseTo(p.gain_dB, 3);
      expect(a.settings.delayMs, `${p.hz} Hz delay`).toBeCloseTo(p.delay_ms, 4);
      expect(a.settings.inverted, `${p.hz} Hz polarity`).toBe(p.omgekeerd);
    }
  });

  it('EVERY delivered candidate carries the stated high-pass at its own handover', () => {
    /* The thing H-1 exists to produce, read off the generator's own record of
     * what the DESIGN STEP delivered — not off a netlist, so it says the design
     * step built it rather than that some filter happens to look like one. */
    const delivered = HERKOMST.kandidaat_uitkomst.filter((o) => o.geleverd);
    expect(delivered.length, 'the hybrid field delivered nothing').toBeGreaterThan(0);
    for (const o of delivered) {
      const hp = o.hoogdoorlaat_op_de_onderste_passieve_weg;
      expect(hp.enabled, `${o.label}: no high-pass on the lowest passive way`).toBe(true);
      expect(hp.kind).toBe(CASUS1H_ACTIVE.kind);
      expect(hp.orde).toBe(CASUS1H_ACTIVE.order);
      expect(hp.hz, `${o.label}: the high-pass is not at the stated handover`).toBeCloseTo(o.actieve_overname_hz, 0);
    }
  });

  it('THE DSP GAIN IS THE DELIVERED ONE, and it is measurably not the class-A one', () => {
    /* The finding that decided the shape of this route. The class-A gain levels
     * the active side against the passive way at the shape the handover STATES;
     * a real high-pass ladder into a real driver impedance is lossy where an
     * ideal filter is not, so what was BUILT needs a different number. The
     * record carries both, so the distance is a number a reader can check —
     * and that it is dB rather than tenths is why the level match had to move
     * inside the evaluation instead of sitting in front of the run. */
    const delivered = HERKOMST.kandidaat_uitkomst.filter((o) => o.geleverd);
    for (const o of delivered) {
      expect(o.dsp_geleverd, `${o.label}: no delivered DSP settings recorded`).not.toBeNull();
      const p = o.dsp_geleverd!;
      expect(p.klasse_A_gain_dB).toBeCloseTo(activeOf(o.actieve_overname_hz).settings.gainDb, 3);
      expect(Math.abs(p.gain_dB - p.klasse_A_gain_dB), `${o.label}: the realisation costs no level at all`).toBeGreaterThan(0.5);
      /* The DELAY and the POLARITY are NOT levelled and stay the class-A answer
       * — those a search genuinely could abuse, and they are the alignment. */
      /* Four decimals: that is the precision the record is written at. */
      expect(p.delay_ms).toBeCloseTo(activeOf(o.actieve_overname_hz).settings.delayMs, 4);
      expect(p.omgekeerd).toBe(activeOf(o.actieve_overname_hz).settings.inverted);
    }
  });

  it('the declaration the generator carried is the declaration the fixture builds today, key for key', () => {
    const hz = CASUS1H_ACTIVE.positionsHz[CASUS1H_ACTIVE.positionsHz.length - 1];
    const active = activeOf(hz);
    const field = casus1hField(active.report);
    const c = field.field.candidates[field.field.candidates.length - 1];
    const gridded = casus1hChainInput(manifest, files);
    const decl = casus1hV2Declaration(c, active, gridded.safety);
    /* The V15 bridge: empty, because this corpus was raised on this engine. A
     * key that appears here unnamed fails, and so does one that stops. */
    const SINCE_THE_RECORD: string[] = [];
    expect(Object.keys(decl.declaration.stated).sort()).toEqual(
      [...HERKOMST.meetopstelling.beschermingen_via_kandidaat, ...SINCE_THE_RECORD].sort(),
    );
    expect(decl.chainDeclaration.stated.activeSide, 'the chain declaration carries no active side').toBeTruthy();
    expect(HERKOMST.meetopstelling.zoekmaat_gladding_oct).toBe(decl.declaration.stated.errorSmoothOct);
  });

  it('every candidate carries a runtime and a stated handover, and the shortlist counts add up', () => {
    for (const o of HERKOMST.kandidaat_uitkomst) {
      expect(o.looptijd_s).toBeGreaterThan(0);
      expect(CASUS1H_ACTIVE.positionsHz).toContain(o.actieve_overname_hz);
    }
    expect(HERKOMST.shortlist.overwogen).toBe(HERKOMST.kandidaat_uitkomst.length);
    expect(HERKOMST.shortlist.leverde_geen_netwerk).toBe(HERKOMST.kandidaat_uitkomst.filter((o) => o.verwerping !== null).length);
    expect(HERKOMST.shortlist.bevroren).toBe(HERKOMST.bestanden.length);
    /* The field is the PRODUCT of the stated handovers and the passive
     * candidates, so every stated handover is represented. */
    expect(new Set(HERKOMST.kandidaat_uitkomst.map((o) => o.actieve_overname_hz)).size).toBe(CASUS1H_ACTIVE.positionsHz.length);
  });
});

/**
 * THE LIVE HALF. `[live]` and `[bytes]` on the one `it`; the tag guard in
 * `casus1V2Candidates.test.ts` and the inventories in `ciLayer.test.ts` name it.
 */
describe('[live] casus 1h: the hybrid route still delivers the frozen netlist', () => {
  it('[bytes] casus 1h: the cheapest delivered netlist, by recorded runtime, live through the hybrid route, byte for byte', () => {
    const delivered = HERKOMST.bestanden
      .map((b) => ({ ...b, o: HERKOMST.kandidaat_uitkomst.find((x) => x.label === b.label)! }))
      .filter((b) => b.o !== undefined)
      .sort((a, b) => a.o.looptijd_s - b.o.looptijd_s || (a.label < b.label ? -1 : 1));
    if (delivered.length === 0) {
      expect(HERKOMST.shortlist.bevroren).toBe(0);
      return;
    }
    const target = delivered[0];
    const hz = target.o.actieve_overname_hz;
    /* THE CLASS-A SETTINGS, which is all the route needs: the LEVEL match
     * happens inside every evaluation (`levelMatchDb`), so the run that made
     * this netlist and this run start from the same three numbers. */
    const base = activeOf(hz);
    const active = { handover: base.handover, settings: base.settings };
    const field = casus1hField(base.report);
    const c = field.field.candidates.find((x) => target.label.endsWith(x.label));
    expect(c, `the field no longer holds ${target.label}`).toBeTruthy();
    const gridded = casus1hChainInput(manifest, files);
    const payload: V2ChainOnePayload = {
      input: casus1hChainInputFor(c!, gridded, casus1hSeed(), active),
      label: target.label,
      v2: {
        ...casus1hV2Facts(base.report, manifest, files),
        gates: { ...CASUS1H_V2_GATES },
        budgets: { ...CASUS1H_V2_BUDGETS },
        determinism: { seed: CASUS1H_V2_SEED },
        targetCurve: CASUS1H_TARGET_CURVE,
        judgeBandHz: CASUS1H_V2_BAND_HZ,
        ...(CASUS1H_CONTINUOUS_POWER_W !== null ? { amplifierPowerW: CASUS1H_CONTINUOUS_POWER_W } : {}),
      },
      candidate: casus1hV2Declaration(c!, active, gridded.safety),
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
    const stored = JSON.parse(readFileSync(join(CASUS1H_DIR, `${target.name}.adsfilter.json`), 'utf-8')) as { parts: unknown[] };
    expect(stableJson((out as unknown as ChainResult).parts)).toBe(stableJson(stored.parts));
    expect(stored.parts.length).toBeGreaterThan(6);
    /* And the reproduced design carries the stated high-pass — the reason this
     * whole route exists, asserted on the thing that just came out of it. */
    const hp = (out as unknown as ChainResult).vf.specs.woofer.hp;
    expect(hp.enabled).toBe(true);
    expect(hp.freq).toBeCloseTo(hz, 0);
    void casus1hSettingsAt;
  }, 1_200_000);
});
