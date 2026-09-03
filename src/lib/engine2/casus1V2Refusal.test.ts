/**
 * V31/V33 — DE KANDIDAAT DIE EEN WHOLESALE-REGEL WERKELIJK WEIGERT.
 *
 * Deze test stond tot 01-09-2026 in `casus1V2Candidates.test.ts`, naast de
 * byte-reproductie van de geleverde netlist. Zij is hier niet naartoe verhuisd
 * omdat zij ergens anders over gaat — dat doet zij niet, en haar inhoud is
 * ongewijzigd — maar om ÉÉN reden, en die is planning:
 *
 *   `handleV2Request` IS SYNCHROON. Twee live ketenruns in één BESTAND draaien
 *   daarom achter elkaar op één worker, ook op een machine met achttien kernen.
 *   Vitest parallelliseert over BESTANDEN en niet binnen een bestand, dus de
 *   enige manier waarop deze twee naast elkaar draaien is dat het twee
 *   bestanden zijn. Gemeten bij de splitsing: zie CLAUDE.md, waar de vóór/ná
 *   van de volle run met datum staat.
 *
 * DE TAGGING IS ONVERANDERD MEEVERHUISD. `[live]` is planning en geen categorie
 * (V43): de describe hieronder draagt hem, dus `npm run test:fast` filtert deze
 * run weg en `npm test` — de acceptatie-autoriteit — draait hem onveranderd.
 * `[bytes]` droeg deze test vóór de splitsing niet en draagt hij nu niet; de
 * splitsing verandert WAAR hij draait en niets aan zijn draagwijdte. Uit de
 * CI-laag valt hij door `[live]` alleen, en dat is genoeg: `test:ci` sluit
 * beide tags uit. De inventaris in `ciLayer.test.ts` legt vast dat het er
 * precies twee zijn, zodat de verhoging van één naar twee niet stil kan
 * doorgroeien.
 *
 * DE OPSTELLING IS EEN DERDE KOPIE, EN DAT IS OPZET. Het HUIDIG-rapport wordt
 * hier op dezelfde vier instellingen gebouwd als in
 * `casus1V2Candidates.test.ts` en in `scripts/generate-casus1-v2-candidates.ts`.
 * Drie kopieën van vier regels, en zij kunnen niet stil uit elkaar lopen: het
 * generatiescript SCHRIJFT de netlists en de weigeringen, de byte-test
 * vergelijkt er één netlist byte-voor-byte mee, en deze test vergelijkt de
 * weigeringsreden en twee gemeten waarden met wat datzelfde script opschreef.
 * Een instelling die hier afwijkt van het script valt dus hier om, en een die
 * daar afwijkt valt in de byte-test om. De parameters zelf staan in
 * `casus1V2.fixture.ts`, waar zij horen (P6).
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CASUS1_DIR,
  CASUS1_WOOFER_DC_OHM,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
} from './casus1.fixture.ts';
import {
  CASUS1_V2_BUDGETS,
  CASUS1_V2_GATES,
  CASUS1_V2_BAND_HZ,
  CASUS1_V2_SEED,
  CASUS1_V2_SETTINGS,
  casus1ChainInput,
  casus1Field,
  casus1V2Declaration,
  casus1V2Facts,
  CASUS1_TARGET_CURVE,
  CASUS1_EXCURSION,
  CASUS1_BUILDABILITY,
  CASUS1_CONTINUOUS_POWER_W,
  CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER,
  CASUS1_LEVEL_WORK_SETTINGS,
} from './casus1V2.fixture.ts';
import { buildReport, type EngineV2Report } from './report.ts';
import { ctcKey } from './metrics/types.ts';
import { handleV2Request, type V2Chain3Payload, type V2Response } from './optimizer/worker.ts';
import type { Chain3Input, Chain3Result } from '../threeWayChain.ts';

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const geometry = casus1Geometry(golden);

/** The provenance block, read for the two fields this test needs from it. */
const HERKOMST = JSON.parse(
  readFileSync(join(CASUS1_DIR, '..', 'casus1_v2_herkomst.json'), 'utf-8'),
) as {
  shortlist: { leverde_geen_netwerk: number };
  /** V31 — the candidates that delivered no network, and the rule that refused each. */
  verwerpingen: {
    label: string;
    kinds: string[];
    reason: string;
    rejectedTune?: Record<string, number | null>;
  }[];
};

const report = (key: string): EngineV2Report =>
  buildReport({
    manifest,
    files,
    filter: casus1Filter(key, manifest, files, golden),
    geometry,
    settings: {
      /* V50 — the same report settings the generator builds its facts from. */
      ...(CASUS1_CONTINUOUS_POWER_W !== null ? { amplifierPowerW: CASUS1_CONTINUOUS_POWER_W } : {}),
      ...(Object.keys(CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER).length > 0
        ? { maxDriveOnFsDbByDriver: { ...CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER } }
        : {}),
      ...CASUS1_BUILDABILITY,
      /* V51 — the wiring and the level-work requirement, for the same reason. */
      ...CASUS1_LEVEL_WORK_SETTINGS,
      orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
      reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
      targetCurve: CASUS1_TARGET_CURVE,
      /* V49 — the excursion inputs, so the facts this reproduction sends carry
       * the same derived ceilings the generator sent (V32's rule: the facts
       * must be the facts the generator sent). */
      ...CASUS1_EXCURSION,
    },
  });

describe('[live] a wholesale refusal comes back as a refusal', () => {
  /* ---------------------------------------------------------------- *
   * V31/V33 — the candidate a wholesale rule actually refuses
   * ---------------------------------------------------------------- */

  it('a candidate a WHOLESALE rule refuses comes back as a REFUSAL, with no network', () => {
    /* THE EXPENSIVE HALF OF V31, and it has to be this route.
     * `wholesaleRejection.test.ts` proves what the shortlist does with a
     * refusal; only a live run proves that a refusal is what the worker
     * produces, on a candidate that genuinely trips the full-band safety gate.
     * Constructing one synthetically would be constructing the answer.
     *
     * WHICH candidate comes from the provenance block — documentation, used
     * here to pick a subject rather than to assert a value. If a regeneration
     * ever leaves the field with no refusals at all, that is a finding and this
     * test says so instead of quietly passing on nothing. */
    expect(
      HERKOMST.verwerpingen.length,
      'no candidate in the frozen field was refused wholesale, so this test has no subject — ' +
        'if that is genuinely the new state, say so in the case book rather than deleting this',
    ).toBeGreaterThan(0);
    expect(HERKOMST.shortlist.leverde_geen_netwerk).toBe(HERKOMST.verwerpingen.length);

    const recorded = HERKOMST.verwerpingen[0];
    const rep = report('HUIDIG');
    const field = casus1Field(rep);
    const gridded = casus1ChainInput(manifest, files, golden);
    const c = field.field.candidates.find((x) => x.label === recorded.label);
    expect(c, `the field no longer holds ${recorded.label}`).toBeTruthy();

    const input: Chain3Input = {
      grid: [...gridded.grid],
      w: gridded.w,
      m: gridded.m,
      t: gridded.t,
      driverZ: gridded.driverZ,
      tAdjust: { offsetMm: 0, trimDb: 0, inverted: false },
      midAdjust: {},
      xoLow: c!.crossings[0].hz,
      xoHigh: c!.crossings[1].hz,
      xoLowRange: c!.crossings[0].cageHz,
      xoHighRange: c!.crossings[1].cageHz,
      label: c!.label,
      settings: {
        ...CASUS1_V2_SETTINGS,
        safety: gridded.safety,
        structureLow: { kind: c!.crossings[0].alignment.kind, order: c!.crossings[0].alignment.order },
        structureHigh: { kind: c!.crossings[1].alignment.kind, order: c!.crossings[1].alignment.order },
        xoFloorPairs: c!.crossings.map((x) => x.windowHz[0]),
      } as unknown as Chain3Input['settings'],
    };
    const payload: V2Chain3Payload = {
      input,
      v2: {
        ...casus1V2Facts(rep, manifest, files),
        gates: { ...CASUS1_V2_GATES },
        /* V42 — see the note at the payload in `casus1V2Candidates.test.ts`.
         * This is the site that FAILED: the record says this candidate was
         * refused, and a re-run without the armed budget delivered a network
         * instead. */
        budgets: { ...CASUS1_V2_BUDGETS },
        determinism: { seed: CASUS1_V2_SEED },
        targetCurve: CASUS1_TARGET_CURVE,
        judgeBandHz: CASUS1_V2_BAND_HZ,
      },
      candidate: casus1V2Declaration(c!, gridded.safety),
    };
    interface Refused {
      result: Chain3Result;
      rejection: {
        kinds: string[];
        reason: string;
        rejectedTune: Record<string, number | null> | null;
        note: string;
      } | null;
      gates: unknown[];
      measurements: { response: unknown; phaseTracking: unknown[] };
      notes: string[];
    }
    let out: Refused | null = null;
    handleV2Request(
      structuredClone({ id: 1, kind: 'v2Chain3One' as const, payload }),
      (m: V2Response) => {
        if (m.kind === 'error') throw new Error(m.message);
        if (m.kind === 'done') out = m.data as Refused;
      },
    );
    expect(out).toBeTruthy();
    const done = out as unknown as Refused;

    // 1. It comes back AS A REFUSAL, and the reason is the rule that refused it.
    expect(done.rejection, 'the run delivered a network where a refusal was recorded').toBeTruthy();
    expect(done.rejection!.kinds).toEqual(recorded.kinds);
    expect(done.rejection!.kinds.length).toBeGreaterThan(0);
    expect(done.rejection!.reason).toBe(recorded.reason);
    /* The reason is the tuner's own sentence about its own rule, not ours, and
     * the CATEGORY is what a caller may act on (A3g). Since V33 there are two
     * families that can throw a whole tune away — the full-band safety gate and
     * an active gate refusing the value tune — and the shortlist deliberately
     * does not distinguish them, so this asserts the vocabulary rather than one
     * member of it. A category outside the set means someone invented one. */
    /* V45 added `budget` (a stated budget on the offered network) and V51
     * `topology` (level work forbidden on the lowest way, with the gap quoted). */
    const KINDS = ['crossing', 'valley', 'protection', 'load', 'gate', 'budget', 'topology'];
    for (const k of done.rejection!.kinds) {
      expect(KINDS, `unknown refusal category "${k}"`).toContain(k);
    }
    expect(done.rejection!.reason.length).toBeGreaterThan(20);

    // 2. ITS SEED IS IN NO OUTPUT AS A NETWORK. Not in `parts`, not anywhere
    //    under `net` — a serialisation of the whole result may contain no part
    //    list at all.
    expect(done.result.parts).toEqual([]);
    // `net.parts` is the SECOND copy of the same list — the chain hands its own
    // up while the tuner keeps the one it built. The first run of this test
    // found the seed alive there, which is why the assertion below serialises
    // the whole result instead of checking the field one expects.
    expect(done.result.net.parts).toEqual([]);
    expect((done.result.net as { rejectedParts?: unknown }).rejectedParts).toBeUndefined();
    const everything = JSON.stringify(done);
    for (const marker of ['"partId"', '"wires"', '"Capacitor"', '"Inductor"']) {
      expect(everything, `a part list survived: ${marker}`).not.toContain(marker);
    }
    // ...and nothing was measured under this candidate's label either: the
    // numbers would have been the seed's.
    expect(done.measurements.response).toBeNull();
    expect(done.measurements.phaseTracking).toEqual([]);
    expect(done.gates).toEqual([]);

    // 3. What WAS refused is reported, so the cost of the veto is visible.
    const t = done.rejection!.rejectedTune;
    expect(t, 'the refused tune was not measured').toBeTruthy();
    expect(t!.minZOhm).toBeCloseTo(recorded.rejectedTune!.minZOhm as number, 6);
    expect(t!.windowPlusMinusDb).toBeCloseTo(
      recorded.rejectedTune!.windowPlusMinusDb as number,
      6,
    );
    // The note says why nothing is delivered, in the F0 terms this rests on.
    expect(done.rejection!.note).toContain('delivers no network');
    expect(done.notes.join(' ')).toContain('Refusing rule:');
  }, 900_000);
});
