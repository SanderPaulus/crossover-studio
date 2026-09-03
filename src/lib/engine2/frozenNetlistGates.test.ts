/**
 * THE GATES, RUN ON EVERY FROZEN NETLIST IN THE CASE BOOK.
 *
 * F4d-nazorg, controle 2. Until now the gates were exercised on synthetic
 * networks (`gateEnforcement.test.ts`), on one casus-1 filter
 * (`gateReport.test.ts`) and inside optimiser runs. The nine — now fifteen —
 * `KAND-V2-*` netlists arrived as FILES and nothing ever put the whole set in
 * front of the gate machinery. A frozen artefact that no gate ever looks at is
 * an artefact whose defects nobody finds until someone builds it.
 *
 * So: every entry of `manifest_en_geometrie.netlists`, no exceptions and no
 * list of its own. A netlist added to the case book joins this test by being
 * added there; there is no second place to remember.
 *
 * ── THE AMPLIFIER FLOOR IS STATED NOW, AND THAT CHANGES WHAT THIS PROVES ───
 *
 * When this file was written casus 1 stated no limits at all, so every gate was
 * OFF (P4: an absent limit is not a gate that always passes; it is a gate that
 * reports its value and judges nothing). "A frozen netlist that fails a gate
 * breaks the suite" was therefore unfalsifiable here, and the file said so
 * rather than inventing a threshold to make the sentence bite.
 *
 * The designer has since stated one — `manifest_en_geometrie.gestelde_eisen.
 * versterkervloer_ohm` — so M-B/|Z| is ARMED on this casus and the sentence is
 * now a real claim. The floor is read from the reference file, never written
 * here: it is a project number and it has exactly one home (P6).
 *
 * The three remaining gates are still unarmed, and their half of the test is
 * unchanged and still worth having: M-A, M-B/EPDR and M-C must report a VALUE
 * and say "no limit set" beside it.
 *
 * The test is in three parts:
 *
 *   1. EVERY GATE IS EVALUABLE on every frozen netlist. Fails when a metric
 *      returns null.
 *   2. THE ARMED FLOOR JUDGES, AND EVERY FROZEN NETLIST EITHER CLEARS IT OR IS
 *      NAMED. That list is a bookkeeping entry, not a waiver: remove a name
 *      while the netlist still misses the floor and this goes red, which is
 *      exactly what makes it falsifiable. Casebook V30.
 *
 *      IT HAS ALREADY MOVED ONCE, and that is the point of keeping it. When it
 *      was written it held the ten `KAND-V2-*` netlists — frozen before the
 *      floor was stated, none of them clearing it. V30's follow-up made the
 *      floor a SEARCH GOAL on the v2 route and regenerated the corpus, and the
 *      new netlists clear it on their own. So the list now names the ten
 *      `V28_KAND_*` netlists instead: the same files under a dated name, kept
 *      deliberately as the "before" half of that comparison rather than
 *      deleted. A frozen artefact that may not be built is a finding; deleting
 *      it would have made the finding disappear along with the evidence.
 *   3. THE UNARMED GATES REPORT WITHOUT JUDGING, and the still-useful
 *      counter-proof that the harness bites when a limit IS given, with limits
 *      taken from the field's own measured values so no number is written here.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CASUS1_WOOFER_DC_OHM,
  casus1AmpMinLoadOhm,
  casus1LfResonantBudgetDb,
  casus1ExcursionSettings,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  casus1MaxDriveOnFsDb,
  casus1MaxDriveOnFsDbByDriver,
  casus1BuildabilitySettings,
  casus1ContinuousPowerW,
  casus1QesMultiplierMax,
  casus1TargetCurve,
  loadGolden,
} from './casus1.fixture.ts';
import { baffleStepHz } from '../cabinet.ts';
import { isImplemented as isImplementedCurve } from './requirements/targetCurve.ts';
import { deliveredResonantDb } from './optimizer/worker.ts';
import { buildReport, type ReportSettings } from './report.ts';
import { ctcKey } from './metrics/types.ts';
import {
  GATE_IDS,
  evaluateGates,
  freezeGateReference,
  type GateVerdict,
  type MeasuredSweep,
} from './optimizer/gates.ts';
import {
  CASUS1_V2_BAND_HZ,
  CASUS1_V2_GATES,
  CASUS1_V2_GRID,
  casus1ChainInput,
  casus1V2Facts,
} from './casus1V2.fixture.ts';
import { smoothDbGaussian } from '../bandMetrics.ts';
import { applyTransfer, combineN, type GriddedResponse } from '../dsp.ts';
import { solveNetwork } from '../network.ts';
import { crossoverToNetlist } from '../vxpNetwork.ts';
import type { VxpCrossover } from '../parsers/vxp.ts';
import { impedanceReferenceFrom } from './optimizer/impedanceReference.ts';
import { protectionByPair } from './metrics/protection.ts';
import { buildAnalysis } from './metrics/analysis.ts';
import { epdr } from './metrics/electrical.ts';
import { LF_BUMP_VERSION } from './metrics/acoustic.ts';
import { RESISTIVE_EQUIVALENT_VERSION } from './metrics/resistiveEquivalent.ts';
import { DRIVE_EXCURSION_VERSION } from './metrics/driveExcursion.ts';
import { BUILDABILITY_VERSION } from './metrics/buildability.ts';
import { busTopology, systemMinImpedanceOhm } from '../netOptimizer.ts';
import {
  sourceProbeIndex,
  sourceResistanceOhm,
  seriesPathResistanceOhm,
  SOURCE_PROBE_WINDOW_TOP_HZ,
  DEFAULT_R_SOURCE_TIER_OHM,
  DEFAULT_R_SOURCE_DISQUALIFY_OHM,
} from '../partAudit.ts';
import { ampFloorSlackOhm, meetsAmpFloor } from '../impedanceFloor.ts';
import { deserializeFilter } from '../filterFile.ts';
import { CASUS1_DIR } from './casus1.fixture.ts';
import type { VxpPart } from '../parsers/vxp.ts';
import type { Complex } from '../complex.ts';
import { PHASE_INTEGRATION_VERSION } from './metrics/phaseIntegration.ts';
import { PHASE_ADMISSION_VERSION } from '../phaseAdmission.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const NET_OPTIMIZER = join(HERE, '..', 'netOptimizer.ts');
const ELECTRICAL = join(HERE, 'metrics', 'electrical.ts');

const golden = loadGolden();
/** Percent, for the watt tolerance class (a unit conversion, whitelisted). */
const PERCENT_V50 = 100;
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const geometry = casus1Geometry(golden);

/** Every frozen netlist the case book names — v1 baselines and v2 candidates alike. */
const NETLIST_KEYS = Object.keys(
  (golden.manifest_en_geometrie as { netlists: Record<string, string> }).netlists,
);

/** The floor the DESIGNER stated, read from the reference file (P6, one home). */
const STATED_FLOOR_OHM = casus1AmpMinLoadOhm(golden);

/** The three designs that are not a v2 candidate — files, not run outcomes. */
const V1_BASELINES = ['HUIDIG', 'KAND_A', 'KAND_B'];

/**
 * Frozen netlists that are known NOT to clear the stated floor, with the
 * reason — `manifest_en_geometrie.v2_herkomst.vloeruitzonderingen`.
 *
 * Read from the case book rather than listed here, so the test cannot drift
 * from the record a human reads. Empty is the goal state and is legal.
 */
const EXCEPTIONS: { netlist: string; minZ_ohm: number | null; gestelde_vloer_ohm: number; reden: string }[] =
  ((golden.manifest_en_geometrie as unknown as {
    v2_herkomst?: { vloeruitzonderingen?: typeof EXCEPTIONS };
  }).v2_herkomst?.vloeruitzonderingen ?? []);

/**
 * The orders the case book states for casus 1's two handovers, plus whatever
 * limits the project itself states.
 *
 * The orders are needed because M-C's passband is derived from where the
 * branches cross, and the crossover window's floor moves with the order.
 * Stated here for the same reason every other casus-1 test states it: a band
 * without its parameters is not a measurement (V15).
 *
 * The amplifier floor is SPREAD rather than assigned, so a case book that
 * states none arms nothing — which is what casus 1 looked like before the
 * floor was stated, and what this file is still able to describe.
 */
const STATED_DRIVE_MAX_DB = casus1MaxDriveOnFsDb(golden);
/** V50 — the stated figure PER WAY; on casus 1 the tweeter only. */
const STATED_DRIVE_BY_WAY = casus1MaxDriveOnFsDbByDriver(golden);
/** V50 — the continuous power, from its one home; the literal 100 is gone. */
const CONTINUOUS_POWER_W = casus1ContinuousPowerW(golden);
/** V50 — the buildability inputs the manifest states (class, margin; no coil class). */
const BUILDABILITY = casus1BuildabilitySettings(golden);

const BASE: ReportSettings = {
  ...(CONTINUOUS_POWER_W !== null ? { amplifierPowerW: CONTINUOUS_POWER_W } : {}),
  orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
  ...(STATED_FLOOR_OHM !== null ? { ampMinLoadOhm: STATED_FLOOR_OHM } : {}),
  /* V47 — SPREAD, om precies dezelfde reden als de vloer erboven: een casus die
   * niets stelt wapent niets. Hij hoort HIER en niet alleen in de v2-payload,
   * want dit blok is wat het RAPPORT stelt, en een rapport dat de gestelde eis
   * niet meekrijgt drukt `no limit set` af naast een netlist die er wél aan
   * gehouden is. */
  /* V50 — PER WAY since V50: the tweeter carries the −20 dB convention, the
   * mid carries no stated figure and is judged on the derived ceiling alone.
   * The single `maxDriveOnFsDb` is no longer stated on this casus. */
  ...(Object.keys(STATED_DRIVE_BY_WAY).length > 0 ? { maxDriveOnFsDbByDriver: { ...STATED_DRIVE_BY_WAY } } : {}),
  /* V50 — the resistor class and margin, spread for the same reason: the
   * REPORT judges every frozen netlist with them, whatever the search does. */
  ...BUILDABILITY,
  /* V49 — the driver cards, the amplifier peak and the X_max margin, spread for
   * the same reason: with them the report derives an excursion ceiling per
   * driver and M-C is judged on the STRICTER of that and the stated figure.
   * Read from the manifest; a casus without them derives nothing. */
  ...casus1ExcursionSettings(golden),
};

/**
 * The PARTS of a frozen netlist (V34).
 *
 * `casus1Filter` hands over a solved netlist, which is what a gate needs; the
 * source-resistance probe works on the part list, because it has to rebuild the
 * network with one driver replaced by a source. Same file, same reader
 * (`deserializeFilter`), same manifest entry — the path comes from the case
 * book so a new corpus takes part by existing.
 */
const casus1Parts = (key: string): VxpPart[] => {
  const name = (golden.manifest_en_geometrie as { netlists: Record<string, string> }).netlists[key];
  return deserializeFilter(readFileSync(join(CASUS1_DIR, name), 'utf-8')).parts;
};

const report = (key: string, settings: ReportSettings = BASE) =>
  buildReport({
    manifest,
    files,
    filter: casus1Filter(key, manifest, files, golden),
    geometry,
    settings,
  });

/**
 * V47 — `protSqDb` van een bevroren netlist: de maat waarop de
 * volle-band-veiligheidspoort tot V47 tegen het ZAAD vergeleek.
 *
 * De ANALYSE wordt hier opgebouwd zoals `report.ts` haar opbouwt, omdat het
 * rapport zijn takoverdrachten niet doorgeeft; de MAAT komt uit
 * `protectionByPair`, die de regel van de tuner aanroept. Eén implementatie van
 * de grootheid — een controlekolom die haar nábouwt controleert niets.
 */
const protectionOf = (
  key: string,
  rep: ReturnType<typeof report>,
): ReturnType<typeof protectionByPair> => {
  const filter = casus1Filter(key, manifest, files, golden);
  const sweeps: Record<string, MeasuredSweep> = {};
  for (const [driver, z] of Object.entries(filter.driverZ)) {
    sweeps[driver] = {
      grid: z.freq,
      magnitude: z.magnitude,
      phaseDeg: z.phaseDeg,
      validHz: [z.freq[0], z.freq[z.freq.length - 1]],
    };
  }
  const ref = impedanceReferenceFrom(sweeps);
  const empty = { pairs: [], sumSqDb: null };
  if (!ref) return empty;
  try {
    return protectionByPair(buildAnalysis(filter.netlist, ref.grid, ref.driverZ), rep.crossings);
  } catch {
    return empty;
  }
};

/** Every frozen netlist, judged once, reused by every case below. */
const FIELD: {
  key: string;
  verdicts: GateVerdict[];
  anyActive: boolean;
  /** V36 — M-A's own result, kept from the report this pass already built.
   *  Sixty netlists is sixty reports; re-reporting them to read one more field
   *  would have doubled the slowest test file in the suite for a column. */
  dissipationPct: number | null;
  largestResistorW: number | null;
  /** V42 — M-D's extra lift, kept from the same report for the same reason. */
  lfBumpDb: number | null;
  /** V43 — the two halves that lift adds up to, from the same report again. */
  lfLiftDb: number | null;
  lfResonantDb: number | null;
  lfWay: string | null;
  /** V45 — M-E on the LOWEST way, from the same report again. `rsOhm` is the
   *  Thevenin source resistance at f_p and does not depend on which R_e the
   *  pass resolved; the path resistance beside it comes off the file. */
  lowestWay: string | null;
  lowestRsOhm: number | null;
  /** V47 — de maat waarop de zaadvergelijking oordeelde, uit de ENE regel die
   *  de tuner ook aanroept. `null` = het netwerk kon er niet op opgelost
   *  worden; 0 is een MÉTING en betekent "geen tekort" (F0). */
  protectionSqDb: number | null;
  /** V47 — en PER PAAR, want de claim gaat over de tweeter en niet over de som. */
  protectionPairs: { upper: string; xoHz: number; sqDb: number }[];
  /** De akoestische kruispunten van deze netlist — de band van de maat
   *  hierboven hangt eraan, dus zij horen ernaast leesbaar te zijn. */
  crossingsHz: number[];
  /** V44 — M-K per handover, with both control columns, from the same report. */
  phase: {
    pair: string;
    mk: number;
    n: number;
    bandHz: [number, number];
    octaveClipped: number | null;
    overlapWindow: number | null;
    rejected: { validity: number; silence: number; level: number };
    grounds: { validity: boolean; silence: boolean; level: boolean };
  }[];
}[] = NETLIST_KEYS.map((key) => {
  const r = report(key);
  const d = r.metrics.dissipation;
  const largest = d?.elements.find((e) => !e.parasitic) ?? null;
  return {
    key,
    verdicts: r.gates.verdicts,
    anyActive: r.gates.anyActive,
    dissipationPct: d ? d.totalFraction * 100 : null,
    largestResistorW: largest?.watts ?? null,
    lfBumpDb: r.metrics.lfBump[0]?.result.extraDb ?? null,
    lfLiftDb: r.metrics.lfBump[0]?.result.liftDb ?? null,
    lfResonantDb: r.metrics.lfBump[0]?.result.resonantDb ?? null,
    lfWay: r.metrics.lfBump[0]?.driver ?? null,
    lowestWay: r.driversLowToHigh[0] ?? null,
    lowestRsOhm:
      r.metrics.thevenin.find((t) => t.driver === r.driversLowToHigh[0])?.rsOhm ?? null,
    protectionSqDb: protectionOf(key, r).sumSqDb,
    protectionPairs: protectionOf(key, r).pairs,
    crossingsHz: r.crossings.map((c) => c.fHz),
    phase: r.system.phaseTracking.map((p) => ({
      pair: `${p.lower}|${p.upper}`,
      mk: p.meanAbsDeg,
      n: p.n,
      bandHz: p.bandHz,
      octaveClipped: p.control.octaveClipped.meanAbsDeg,
      overlapWindow: p.control.overlapWindow.meanAbsDeg,
      rejected: p.rejected,
      grounds: p.grounds,
    })),
  };
});

describe('every gate runs on every frozen netlist', () => {
  it('the field is not empty, and it contains the v2 candidates as well as the baselines', () => {
    // A scan over an empty list passes silently, which is how a guard comes to
    // be green for a year without ever having run.
    expect(NETLIST_KEYS.length).toBeGreaterThan(0);
    // The three v1 baselines are the floor under this scan: they are files in
    // the repository and no run can remove them. The v2 set is deliberately
    // NOT asserted to be non-empty — a field in which every candidate is
    // refused is a legitimate outcome, and V30 records one.
    for (const key of ['HUIDIG', 'KAND_A', 'KAND_B']) expect(NETLIST_KEYS).toContain(key);
  });

  it('each netlist gets a verdict for every gate id A4 declares', () => {
    for (const { key, verdicts } of FIELD) {
      const ids = new Set(verdicts.map((v) => v.gate));
      for (const id of GATE_IDS) {
        // M-C is per driver and only exists for the ways that HAVE a
        // resonance in play, so its absence is a statement about the design
        // rather than a missing verdict. The three system gates are not
        // optional.
        if (id === 'M-C') continue;
        expect(ids, `${key} has no ${id} verdict`).toContain(id);
      }
    }
  });

  it('every gate produces a VALUE on every frozen netlist — the metric is evaluable', () => {
    for (const { key, verdicts } of FIELD) {
      for (const v of verdicts) {
        /* V50 — M-A/part on a netlist with NO discrete resistor has nothing to
         * rate, and says so; a zero there would read as a measurement (F0).
         * `V28_KAND_1` is that netlist. */
        if (v.gate === 'M-A/part' && v.value === null) {
          expect(v.reason, `${key}: M-A/part is null without saying why`).toMatch(/no discrete resistor/);
          continue;
        }
        expect(v.value, `${key}: ${v.gate} on ${v.subject} produced no value`).not.toBeNull();
      }
    }
  });

  it('the gates casus 1 does NOT state are OFF, and say so rather than passing', () => {
    /* The assertion is on `active` and on the sentence, NOT on `pass` — a
     * reader who sees only a green `pass` column cannot tell a design that
     * cleared a limit from a design nobody measured against one. */
    for (const { key, verdicts } of FIELD) {
      for (const v of verdicts) {
        if (v.gate === 'M-B/|Z|' && STATED_FLOOR_OHM !== null) continue;
        // V47 — en sinds V47 stelt casus 1 er twee. M-A en M-B/EPDR blijven
        // over, en dat is nog steeds een echte claim: zij rapporteren hun
        // waarde en oordelen niets.
        if (v.gate === 'M-C' && (STATED_DRIVE_MAX_DB !== null || Object.keys(STATED_DRIVE_BY_WAY).length > 0)) continue;
        // V50 — and a third: the resistor class with its margin arms M-A/part.
        if (v.gate === 'M-A/part' && BUILDABILITY.resistorClassW !== undefined && BUILDABILITY.resistorPowerMargin !== undefined) continue;
        expect(v.active, `${key}: ${v.gate} is armed and casus 1 states no limit for it`).toBe(
          false,
        );
        expect(v.limit).toBeNull();
        expect(v.reason, `${key}: ${v.gate}`).toContain('no limit set');
      }
    }
  });
});

describe('the STATED amplifier floor judges every frozen netlist', () => {
  /* The falsifiable half, and the reason this file was worth writing before it
   * could be falsified: the machinery was already in place when the number
   * arrived. Nothing about the gate changed — a project setting did. */

  it('the floor comes from the case book, not from this file', () => {
    expect(STATED_FLOOR_OHM, 'casus 1 no longer states an amplifier floor').not.toBeNull();
    const stated = (golden.manifest_en_geometrie as unknown as {
      gestelde_eisen: { versterkervloer_ohm: number; versterkervloer_motivering: string };
    }).gestelde_eisen;
    expect(STATED_FLOOR_OHM).toBe(stated.versterkervloer_ohm);
    // A stated number without its reason is the thing V15 is about, one layer
    // up: a requirement nobody can attribute is a requirement nobody can argue
    // with.
    expect(stated.versterkervloer_motivering.length).toBeGreaterThan(40);
  });

  it('M-B/|Z| is ARMED on every frozen netlist and delivers a judgement', () => {
    for (const { key, verdicts } of FIELD) {
      const z = verdicts.find((v) => v.gate === 'M-B/|Z|');
      expect(z, `${key} has no M-B/|Z| verdict`).toBeTruthy();
      expect(z!.active, `${key}: the stated floor did not reach the gate`).toBe(true);
      expect(z!.limit).toBe(STATED_FLOOR_OHM);
      expect(z!.value, `${key}: min |Z| was not computed`).not.toBeNull();
    }
  });

  it('every frozen netlist either CLEARS the floor or is NAMED as an exception', () => {
    /* THE CLAIM THIS FILE EXISTS FOR, and it can go red two ways: a netlist
     * that misses the floor without being named, and a name that is still
     * there after its netlist has been fixed. Both are failures of the same
     * bookkeeping, and neither is a waiver — the list is supposed to empty. */
    const missing = FIELD.filter(({ verdicts }) =>
      verdicts.some((v) => v.gate === 'M-B/|Z|' && v.active && !v.pass),
    ).map(({ key }) => key);

    const named = EXCEPTIONS.map((e) => e.netlist).sort();
    expect(missing.sort(), 'a frozen netlist misses the stated floor and is not named in ' +
      'v2_herkomst.vloeruitzonderingen — name it with its reason, or replace the netlist')
      .toEqual(named);

    // The list is a record of a defect, so it has to carry the defect's size
    // and its reason. A bare list of keys would be a waiver.
    for (const e of EXCEPTIONS) {
      expect(NETLIST_KEYS, `${e.netlist} is named but is not a frozen netlist`).toContain(
        e.netlist,
      );
      expect(e.gestelde_vloer_ohm).toBe(STATED_FLOOR_OHM);
      expect(e.minZ_ohm, `${e.netlist}: no measured minimum`).not.toBeNull();
      expect(e.minZ_ohm!).toBeLessThan(STATED_FLOOR_OHM!);
      /* The reason has to POINT SOMEWHERE — at a numbered case-book entry, so
       * a reader can find out what is actually wrong with this netlist. It
       * used to demand the literal "V30", which pinned the entry number rather
       * than the requirement: at V30's follow-up three netlists joined the list
       * for an entirely different reason (V32, the gate reference's 200 Hz
       * floor) and a correct entry made the test fail. Any entry, and a
       * sentence long enough to be one. */
      expect(e.reden, `${e.netlist}: an exception without a reason is a waiver`).toMatch(/\bV\d+\b/);
      expect(e.reden.length, `${e.netlist}: a stub reason is not a reason`).toBeGreaterThan(80);
    }
  });

  it('the three v1 baselines DO clear the stated floor — the floor is not unreachable', () => {
    /* Without this the exception list above would be indistinguishable from a
     * floor nothing can meet. The number the designer stated was chosen with
     * HUIDIG in mind, and HUIDIG has to be able to show it. */
    for (const key of ['HUIDIG', 'KAND_A', 'KAND_B']) {
      const z = FIELD.find((f) => f.key === key)!.verdicts.find((v) => v.gate === 'M-B/|Z|')!;
      expect(z.pass, `${key} does not clear the stated floor`).toBe(true);
      // ...and clears it outright rather than on the measurement tolerance
      // (F3b, deliverable 4a): those are different statements about a design.
      expect(z.withinToleranceOnly, `${key} clears the floor only within tolerance`).toBe(false);
    }
  });
});

/* ------------------------------------------------------------------ *
 * V32 — the gate and the file must say the SAME thing
 * ------------------------------------------------------------------ */

describe('V32 — the search gate and the file measurement agree on every frozen netlist', () => {
  /* THE CONTRADICTION THIS EXISTS FOR. `KAND_V2_1`, `_2` and `_6` passed
   * `M-B/|Z|` inside their own chain run at 2.594–2.606 Ω, and missed the same
   * stated floor when the file was measured here at 2.358–2.447 Ω. Their minima
   * sit at 82.1–83.7 Hz; the chain's analysis grid starts at 200 Hz, because
   * that is where this set's far field begins. Two verdicts about one
   * requirement, on two grids, and the printed one was the kinder.
   *
   * Since V32 both come out of `impedanceReferenceFrom`, so this test is not
   * checking arithmetic — it is checking that nothing has grown a second grid
   * again. It is worth the cost precisely because the previous version of this
   * disagreement was invisible for a whole delivery.
   *
   * NO CHAIN RUN HERE, and that is not a shortcut. What the search is held to
   * is `evaluateGates` on a reference frozen from the same measurements the
   * worker freezes from — the worker's own two lines, without the forty seconds
   * of tuning that sit between them and change nothing about the comparison. */
  const gridded = casus1ChainInput(manifest, files, golden);
  const facts = casus1V2Facts(report('HUIDIG'), manifest, files);

  /** The reference the WORKER freezes, for this netlist. */
  const searchRef = (key: string) => {
    const filter = casus1Filter(key, manifest, files, golden);
    const ref = freezeGateReference({
      netlist: filter.netlist,
      grid: [...gridded.grid],
      driverZ: gridded.driverZ,
      branchDb: { woofer: gridded.w.spl, mid: gridded.m.spl, tweeter: gridded.t.spl },
      fsHz: facts.fundamentalHzByModel ?? {},
      validHz: facts.validHzByModel ?? {},
      sweeps: Object.fromEntries(
        Object.entries(facts.impedanceByModel ?? {}).map(([m, z]) => [
          m,
          { grid: z.grid, magnitude: z.magnitude, phaseDeg: z.phaseDeg, validHz: z.validHz },
        ]),
      ),
    });
    return { filter, ref };
  };

  const searchVerdicts = (key: string): GateVerdict[] => {
    const { filter, ref } = searchRef(key);
    return evaluateGates(
      filter.netlist,
      STATED_FLOOR_OHM !== null ? { ampMinLoadOhm: STATED_FLOOR_OHM } : {},
      ref,
      'frozen',
    ).verdicts;
  };

  it('the two routes are genuinely different grids, so agreeing means something', () => {
    // The premise: the chain grid really does start above the frequencies where
    // the disagreement lived. Without this the whole describe could pass because
    // the two routes were handed the same grid by accident.
    expect(CASUS1_V2_GRID[0]).toBeGreaterThan(
      Math.min(
        ...Object.values(facts.impedanceByModel ?? {}).map((z) => z.validHz[0]),
      ),
    );
  });

  it('min |Z| and its verdict are identical, netlist by netlist', () => {
    expect(STATED_FLOOR_OHM).not.toBeNull();
    const tol = (golden.toleranties as { ohm: number }).ohm;
    for (const key of NETLIST_KEYS) {
      const fromFile = FIELD.find((f) => f.key === key)!.verdicts.find(
        (v) => v.gate === 'M-B/|Z|',
      )!;
      const fromSearch = searchVerdicts(key).find((v) => v.gate === 'M-B/|Z|')!;
      expect(fromSearch.value, `${key}: the search route produced no |Z|`).not.toBeNull();
      expect(fromSearch.value!, `${key}: gate ${fromSearch.value} vs file ${fromFile.value}`)
        .toBeCloseTo(fromFile.value!, Math.max(0, -Math.log10(tol)));
      // The verdict, not only the number: a 0.001 Ω difference either side of
      // the floor would be a disagreement about whether this may be built.
      expect(fromSearch.pass, `${key}: gate says ${fromSearch.pass}, file says ${fromFile.pass}`)
        .toBe(fromFile.pass);
      expect(fromSearch.withinToleranceOnly).toBe(fromFile.withinToleranceOnly);
    }
  });

  it('the ONE soft spot of V32 is measured, not argued: the extrapolated branch', () => {
    /* THE HONEST WEAKNESS, AND ITS MEASUREMENT.
     *
     * The judgement grid is the UNION of the drivers' sweeps, because the
     * intersection on this set is 200 Hz and up — the blindness V32 is about,
     * reached from the other side. The price is that the tweeter, whose sweep
     * starts at 199.95 Hz, is READ below that, held flat at its lowest measured
     * value. Every verdict at 82 Hz therefore rests partly on an extrapolation.
     *
     * The physical answer is that a series capacitor has already taken the
     * tweeter branch out of the picture two octaves below its crossover, so its
     * impedance there cannot matter. That is an argument. This is the
     * measurement: multiply the extrapolated region by ten and by a tenth — a
     * factor of a hundred across — and the system minimum may not move.
     *
     * If a design ever DOES depend on it, this goes red, and the right response
     * is a tweeter sweep that reaches lower, not a looser test. */
    const lo = Math.min(
      ...Object.values(facts.impedanceByModel ?? {}).map((z) => z.validHz[0]),
    );
    const extrapolated = Object.entries(facts.impedanceByModel ?? {}).filter(
      ([, z]) => z.validHz[0] > lo,
    );
    // The premise: there IS an extrapolated branch. Without one this test would
    // pass by having nothing to perturb.
    expect(extrapolated.length).toBeGreaterThan(0);

    for (const key of NETLIST_KEYS) {
      const filter = casus1Filter(key, manifest, files, golden);
      const readWith = (mult: number): number => {
        const sweeps = Object.fromEntries(
          Object.entries(facts.impedanceByModel ?? {}).map(([m, z]) => [
            m,
            { grid: z.grid, magnitude: z.magnitude, phaseDeg: z.phaseDeg, validHz: z.validHz },
          ]),
        );
        const ref = impedanceReferenceFrom(sweeps)!;
        const driverZ: Record<string, readonly Complex[]> = { ...ref.driverZ };
        for (const [m, z] of extrapolated) {
          driverZ[m] = ref.driverZ[m].map((c, i) =>
            ref.grid[i] < z.validHz[0] ? { re: c.re * mult, im: c.im * mult } : c,
          );
        }
        return epdr(buildAnalysis(filter.netlist, ref.grid, driverZ)).minZOhm;
      };
      const asMeasured = readWith(1);
      // A factor of a hundred across, and the tolerance is the reference
      // file's own ohm class rather than a number written here.
      expect(readWith(10), `${key}: a x10 extrapolation moved min |Z|`).toBeCloseTo(
        asMeasured,
        Math.max(0, -Math.log10((golden.toleranties as { ohm: number }).ohm)),
      );
      expect(readWith(0.1), `${key}: a x0.1 extrapolation moved min |Z|`).toBeCloseTo(
        asMeasured,
        Math.max(0, -Math.log10((golden.toleranties as { ohm: number }).ohm)),
      );
    }
  });

  /* ------------------------------------------------------------------ *
   * V33 — and the OBJECTIVE reads the same number as the gate
   * ------------------------------------------------------------------ */

  it('V33 — the barrier reads exactly the gate value, netlist by netlist, bit for bit', () => {
    /* THE CLAIM. V32 put the gate on the measured sweep and left the amp-load
     * barrier — the term that steers the search toward that same floor — on
     * the evaluation grid. So the search aimed at one band and the gate
     * enforced another, and on casus 1 that cost five of fifteen candidates
     * their whole value tune (casebook V33).
     *
     * `systemMinImpedanceOhm` is what the objective reads its shortfall
     * through; `M-B/|Z|`'s value comes out of `epdr`. Since V33 both take the
     * minimum through `minImpedanceAt`, on the same grid and the same driver
     * impedances, so this is `toBe` and not `toBeCloseTo`. A tolerance here
     * would be the mistake itself in miniature: two implementations that agree
     * to three decimals is exactly the state V32 found. */
    expect(STATED_FLOOR_OHM).not.toBeNull();
    for (const key of NETLIST_KEYS) {
      const { filter, ref } = searchRef(key);
      expect(ref.impedance, `${key}: no impedance reference was frozen`).not.toBeNull();
      const fromGate = searchVerdicts(key).find((v) => v.gate === 'M-B/|Z|')!.value;
      const fromBarrier = systemMinImpedanceOhm(
        filter.netlist,
        ref.impedance!.grid,
        ref.impedance!.driverZ,
      );
      expect(fromBarrier, `${key}: the objective could not read the load`).not.toBeNull();
      expect(fromBarrier, `${key}: barrier ${fromBarrier} vs gate ${fromGate}`).toBe(fromGate);
    }
  });

  it('V33 — and that identity is about the GRID, not about arithmetic', () => {
    /* The counter-proof, and without it the test above is equally true of a
     * barrier still reading the chain grid: two functions can agree because
     * they were handed the same data by accident. Read the SAME netlist on the
     * chain's analysis grid and at least one frozen netlist must disagree with
     * its gate — that disagreement is the whole of V32 and V33. */
    const differs = NETLIST_KEYS.filter((key) => {
      const { filter, ref } = searchRef(key);
      const onGate = systemMinImpedanceOhm(filter.netlist, ref.impedance!.grid, ref.impedance!.driverZ);
      const onChainGrid = systemMinImpedanceOhm(filter.netlist, gridded.grid, gridded.driverZ);
      return onGate !== onChainGrid;
    });
    expect(
      differs.length,
      'no frozen netlist reads differently on the chain grid than on the measured sweep, so ' +
        '"the barrier reads the gate\'s grid" cannot be distinguished from "it reads any grid"',
    ).toBeGreaterThan(0);
  });

  it('V33 — the barrier grid sits INSIDE the gate\'s, and the resolution gap is under the floor slack', () => {
    /* THE MEASUREMENT THAT JUSTIFIES `'safety'` AS THE v2 DEFAULT.
     *
     * The barrier could read the gate's own reference and then goal and limit
     * would be one number by construction — which is true, and which costs a
     * casus-1 chain run eleven minutes instead of one, because that grid is the
     * analysis resolution and the barrier runs inside the objective. So the v2
     * route aims at the tuner's own full-band safety grid instead: the same
     * reader, the same extent, 240 points against 1600.
     *
     * That is a defensible substitution only if it is MEASURED, and this is the
     * measurement. Two claims, and the first is what makes the second mean
     * anything:
     *
     *  1. CONTAINMENT. The safety grid lies inside the extent the gate judges
     *     on. If it did not, the barrier could be blind somewhere the gate
     *     looks — which is V33 itself, restated one grid over.
     *  2. THE GAP IS SMALLER THAN THE SLACK. Not "approximately equal": the
     *     difference between the two readings is held against
     *     `ampFloorSlackOhm`, the tolerance the tuner ALREADY treats as
     *     indistinguishable from meeting the floor. A search aiming within the
     *     slack of the enforced number is aiming at it in the only sense this
     *     app has ever used.
     *
     * The largest gap travels in the failure message, so a run that widens it
     * says by how much rather than only that it did. */
    expect(STATED_FLOOR_OHM).not.toBeNull();
    const slack = ampFloorSlackOhm(STATED_FLOOR_OHM!);
    const safety = gridded.safety;

    // 1. Containment, once — the grids do not vary per netlist.
    const anyRef = searchRef(NETLIST_KEYS[0]).ref.impedance!;
    expect(safety.freqs[0], 'the safety grid starts below the gate\'s extent').toBeGreaterThanOrEqual(
      anyRef.grid[0],
    );
    expect(
      safety.freqs[safety.freqs.length - 1],
      'the safety grid ends above the gate\'s extent',
    ).toBeLessThanOrEqual(anyRef.grid[anyRef.grid.length - 1]);
    // ...and it really is the coarser of the two, or there is no gap to measure.
    expect(safety.freqs.length).toBeLessThan(anyRef.grid.length);

    // 2. The gap, netlist by netlist, over the designs that are in play.
    const live = NETLIST_KEYS.filter((k) => /^KAND_V2_\d+$/.test(k) || V1_BASELINES.includes(k));
    expect(live.length, 'no live design to measure the gap on').toBeGreaterThan(0);
    let worst = { key: '', gap: 0, onSafety: 0, onSweep: 0 };
    for (const key of live) {
      const { filter, ref } = searchRef(key);
      const onSweep = systemMinImpedanceOhm(filter.netlist, ref.impedance!.grid, ref.impedance!.driverZ);
      const onSafety = systemMinImpedanceOhm(filter.netlist, safety.freqs, safety.z);
      expect(onSweep, `${key}: the gate grid produced no reading`).not.toBeNull();
      expect(onSafety, `${key}: the safety grid produced no reading`).not.toBeNull();
      const gap = Math.abs(onSafety! - onSweep!);
      if (gap > worst.gap) worst = { key, gap, onSafety: onSafety!, onSweep: onSweep! };
    }
    expect(
      worst.gap,
      `the coarser barrier grid reads ${worst.gap.toFixed(4)} Ω away from the grid the gate ` +
        `enforces on, worst at ${worst.key} (${worst.onSafety.toFixed(4)} against ` +
        `${worst.onSweep.toFixed(4)} Ω), against a floor slack of ${slack.toFixed(4)} Ω. Either ` +
        'the safety grid needs more points or the v2 route needs the expensive source',
    ).toBeLessThan(slack);
    /* And the gap is not ZERO either, or the two grids would be the same grid
     * and this whole measurement would be describing nothing. */
    expect(worst.gap).toBeGreaterThan(0);

    /* ---- WHERE THE APPROXIMATION BREAKS DOWN, AND WHY IT DOES NOT MATTER ----
     *
     * Measured over the WHOLE case book, dated corpora included, exactly one
     * netlist reads further apart than the slack: `V28_KAND_2`, at 0.073 Ω —
     * and it is a design whose minimum is 0.006 Ω, a dead short with a dip so
     * narrow that 240 points land beside it. That is the honest boundary of a
     * coarser grid and it is worth stating rather than scoping away.
     *
     * What makes it survivable is the claim below, which is the one that
     * actually matters: on every frozen netlist the two readings reach the SAME
     * VERDICT about the stated floor. A barrier aiming with the coarse reading
     * is never aiming at a network the gate would refuse for the fine one — not
     * on this case book — and where the numbers diverge most, both of them
     * condemn. */
    const disagree: string[] = [];
    for (const key of NETLIST_KEYS) {
      const { filter, ref } = searchRef(key);
      const onSweep = systemMinImpedanceOhm(filter.netlist, ref.impedance!.grid, ref.impedance!.driverZ);
      const onSafety = systemMinImpedanceOhm(filter.netlist, safety.freqs, safety.z);
      if (meetsAmpFloor(onSweep, STATED_FLOOR_OHM) !== meetsAmpFloor(onSafety, STATED_FLOOR_OHM)) {
        disagree.push(
          `${key}: sweep ${onSweep?.toFixed(4)} Ω, safety ${onSafety?.toFixed(4)} Ω`,
        );
      }
    }
    expect(
      disagree,
      'the barrier grid and the gate grid disagree about whether the stated floor is met:\n' +
        `${disagree.join('\n')}\nA search aiming at one and judged on the other is V33 all over ` +
        'again, one grid further in',
    ).toEqual([]);
  });

  it('V33 — the objective really goes through that function, and not through a copy', () => {
    /* A scan, for the same reason `floorAsGoal.test.ts` scans: this is a claim
     * about WHICH expression the barrier term contains, and no delivered value
     * shows it. A second loop over `inputZ` written beside it would pass every
     * assertion above and still be the defect. */
    const src = readFileSync(NET_OPTIMIZER, 'utf-8');
    const barrier = src
      .split('\n')
      .find((l) => /barr \+= AMP_FLOOR_BARRIER_WEIGHT/.test(l));
    expect(barrier, 'the amp-load barrier term has moved or been renamed').toBeDefined();
    expect(barrier).toMatch(/barrierShortOhm\(/);
    const reader = src.split('\n').find((l) => /const ohm = systemMinImpedanceOhm\(/.test(l));
    expect(reader, 'the barrier no longer reads through the shared function').toBeDefined();
    // ...and `epdr` takes its minimum through the shared reader as well, or the
    // two sides are one edit away from disagreeing again.
    const electrical = readFileSync(ELECTRICAL, 'utf-8');
    expect(electrical).toContain('minImpedanceAt(inputZ)');
  });

  it('V34 — the source-resistance probe: the chain grid answers with the DC limit, the safety grid with a measurement', () => {
    /* THE FINDING, ON THE REAL CORPUS. Without a stated box tuning the probe
     * takes the low driver's impedance peak over the bottom of the grid. On the
     * chain grid that peak lands on grid[24] = 640.2 Hz, which is the TOP of
     * the probe's own search window rather than a resonance: this woofer pair
     * is ported and its peaks sit at 17 and 51 Hz, both below a grid that
     * starts at 200. The guard that existed refused only grid[0].
     *
     * Two claims, and the first is the premise of the second:
     *
     *  1. On the CHAIN grid the strict rule refuses the landing, so every
     *     netlist falls back to the series-path DC limit — a lower bound, which
     *     may condemn but never exonerate. That is what the disqualification was
     *     comparing against.
     *  2. On the SAFETY grid the probe finds a real interior peak below 200 Hz,
     *     and the reading is a Thevenin measurement rather than the DC limit.
     *
     * And the consequence, which is why V34 withdraws the 2.0 Ω default in the
     * same entry: read at the real peak the three v1 baselines carry far more
     * source resistance than read at 640 Hz. A limit nobody stated, applied to
     * a number finally taken where the physics is, would throw away the
     * designer's own reference design. */
    const safety = gridded.safety;
    const lowZ = gridded.driverZ.woofer;
    const chain = sourceProbeIndex(gridded.grid, lowZ, undefined, 'first');
    expect(chain, 'the chain grid produced no probe at all').not.toBeNull();
    // The landing IS the window top — measured, and the whole reason V34 exists.
    expect(chain!.inBand, 'the historical rule accepted this landing').toBe(true);
    expect(sourceProbeIndex(gridded.grid, lowZ, undefined, 'both')!.inBand).toBe(false);
    expect(gridded.grid[chain!.idx]).toBeGreaterThan(SOURCE_PROBE_WINDOW_TOP_HZ);

    const onSafety = sourceProbeIndex(safety.freqs, safety.z.woofer, undefined, 'both');
    expect(onSafety!.inBand, 'the safety grid cannot probe the low driver either').toBe(true);
    expect(safety.freqs[onSafety!.idx]).toBeLessThan(gridded.grid[0]);

    const rows: string[] = [];
    for (const key of NETLIST_KEYS) {
      const parts = casus1Parts(key);
      const dc = seriesPathResistanceOhm(parts);
      const onGrid = sourceResistanceOhm(parts, {
        grid: gridded.grid,
        driverZ: gridded.driverZ,
        edgeRule: 'both',
      });
      const measured = sourceResistanceOhm(parts, {
        grid: safety.freqs,
        driverZ: safety.z,
        edgeRule: 'both',
      });
      expect(onGrid, `${key}: the chain grid answered something other than the DC limit`).toBe(dc);
      expect(measured, `${key}: the safety grid produced no reading`).not.toBeNull();
      rows.push(`${key}: DC ${dc?.toFixed(3)} Ω, measured ${measured!.toFixed(3)} Ω`);
    }
    // ...and the two are not the same number everywhere, or "measured" would be
    // a word for the same fallback under another name.
    const differing = rows.filter((r) => {
      const [, a, b] = r.match(/DC ([\d.]+) Ω, measured ([\d.]+)/) ?? [];
      return a !== undefined && Math.abs(Number(a) - Number(b)) > 0.01;
    });
    expect(differing.length, `every netlist read identically:\n${rows.join('\n')}`).toBeGreaterThan(0);
  });

  it('V34 — the safety grid and the gate\'s own sweep probe the same resonance, and reach the same tiers', () => {
    /* THE MEASUREMENT THAT JUSTIFIES `'safety'` FOR THE PROBE, and it is the
     * V33 argument one quantity along. The gate's 1600-point reference is the
     * finest grid this route holds; the safety grid is 240 points over the same
     * extent and is the one the objective can afford. So the substitution has to
     * be measured rather than argued.
     *
     * TWO CLAIMS. The two grids find the peak at the same PLACE (within the
     * coarse grid's own step, since a peak cannot be located finer than that),
     * and — the one that decides anything — on every frozen netlist they land
     * on the same side of both source-resistance tiers. A limit that two
     * readings of one quantity disagree about is a limit nobody can state.
     *
     * Unlike V33's floor there is no `ampFloorSlackOhm` here, because there is
     * no stated requirement to have a slack ON: casus 1 states no
     * source-resistance limit at all. So the tolerance IS the tiers, and the
     * assertion is about verdicts rather than about ohms. The largest gap
     * travels in the message anyway, so a run that widens it says by how
     * much. */
    const safety = gridded.safety;
    const anyRef = searchRef(NETLIST_KEYS[0]).ref.impedance!;

    const pSafety = sourceProbeIndex(safety.freqs, safety.z.woofer, undefined, 'both')!;
    const pSweep = sourceProbeIndex(anyRef.grid, anyRef.driverZ.woofer, undefined, 'both')!;
    const fSafety = safety.freqs[pSafety.idx];
    const fSweep = anyRef.grid[pSweep.idx];
    const step = safety.freqs[1] / safety.freqs[0];
    expect(
      Math.max(fSafety / fSweep, fSweep / fSafety),
      `the two grids find the low driver's peak at ${fSafety.toFixed(1)} and ` +
        `${fSweep.toFixed(1)} Hz — further apart than the coarse grid's own step`,
    ).toBeLessThanOrEqual(step);

    const disagree: string[] = [];
    let worst = { key: '', gap: 0 };
    for (const key of NETLIST_KEYS) {
      const parts = casus1Parts(key);
      const onSafety = sourceResistanceOhm(parts, {
        grid: safety.freqs,
        driverZ: safety.z,
        edgeRule: 'both',
      });
      const onSweep = sourceResistanceOhm(parts, {
        grid: anyRef.grid,
        driverZ: anyRef.driverZ,
        edgeRule: 'both',
      });
      expect(onSafety, `${key}: no safety reading`).not.toBeNull();
      expect(onSweep, `${key}: no sweep reading`).not.toBeNull();
      const gap = Math.abs(onSafety! - onSweep!);
      if (gap > worst.gap) worst = { key, gap };
      for (const tier of [DEFAULT_R_SOURCE_TIER_OHM, DEFAULT_R_SOURCE_DISQUALIFY_OHM]) {
        if (onSafety! >= tier !== (onSweep! >= tier)) {
          disagree.push(
            `${key} at the ${tier} Ω tier: safety ${onSafety!.toFixed(4)} Ω, ` +
              `sweep ${onSweep!.toFixed(4)} Ω`,
          );
        }
      }
    }
    expect(
      disagree,
      `the coarse probe grid and the fine one reach different verdicts (worst gap ` +
        `${worst.gap.toFixed(4)} Ω at ${worst.key}):\n${disagree.join('\n')}\nEither the safety ` +
        'grid needs more points or the v2 route needs the expensive source',
    ).toEqual([]);
    // ...and they are not the same grid, or the comparison describes nothing.
    expect(safety.freqs.length).toBeLessThan(anyRef.grid.length);
    expect(worst.gap).toBeGreaterThan(0);
  });

  it('and they name the same span — one rule, not two that happen to agree', () => {
    for (const key of NETLIST_KEYS) {
      const fromFile = FIELD.find((f) => f.key === key)!.verdicts.find(
        (v) => v.gate === 'M-B/|Z|',
      )!;
      const fromSearch = searchVerdicts(key).find((v) => v.gate === 'M-B/|Z|')!;
      expect(fromSearch.parameters?.judged_on, `${key}`).toBe(fromFile.parameters?.judged_on);
      expect(String(fromSearch.parameters?.judged_on)).toContain('impedance');
    }
  });
});

/* ------------------------------------------------------------------ *
 * The proof that the harness bites — thresholds from the field itself
 * ------------------------------------------------------------------ */

/** One gate's reading across the whole frozen field. */
const readings = (gate: string, subject?: string): { key: string; value: number }[] =>
  FIELD.flatMap(({ key, verdicts }) =>
    verdicts
      .filter((v) => v.gate === gate && (subject === undefined || v.subject === subject))
      .filter((v) => v.value !== null)
      .map((v) => ({ key, value: v.value as number })),
  );

/**
 * Arm one gate at a limit taken from the field, and report who fails.
 *
 * The limit is a MEASURED value of one of these very netlists, so no number
 * appears in this file and none is invented: the gate still judges out of the
 * measurements, exactly as it does in the app. What is being demonstrated is
 * the machinery, not a project policy.
 */
const judgeWith = (settings: ReportSettings, gate: string) =>
  NETLIST_KEYS.map((key) => ({
    key,
    verdict: report(key, { ...BASE, ...settings }).gates.verdicts.find((v) => v.gate === gate)!,
  }));

describe('a stated limit DOES judge these files — the counter-proof', () => {
  it('M-A: armed at the least dissipative netlist, the most dissipative one fails', () => {
    const vals = readings('M-A');
    expect(vals.length).toBe(NETLIST_KEYS.length);
    const lowest = vals.reduce((a, b) => (b.value < a.value ? b : a));
    const highest = vals.reduce((a, b) => (b.value > a.value ? b : a));
    // Without a spread there is nothing to separate, and "everything passes"
    // would be true for a gate that never compared anything.
    expect(highest.value).toBeGreaterThan(lowest.value);

    const judged = judgeWith({ maxDissipationFraction: lowest.value }, 'M-A');
    for (const { key, verdict } of judged) expect(verdict.active, key).toBe(true);
    expect(judged.find((j) => j.key === highest.key)!.verdict.pass).toBe(false);
    expect(judged.find((j) => j.key === lowest.key)!.verdict.pass).toBe(true);
    // ...and the suite would have broken on it: the violation sentence names it.
    const rep = report(highest.key, { ...BASE, maxDissipationFraction: lowest.value });
    expect(rep.gates.violation).not.toBeNull();
    expect(rep.gates.violation).toContain('M-A');
  });

  it('M-B/EPDR: armed at the highest EPDR in the field, the lowest one fails', () => {
    const vals = readings('M-B/EPDR');
    const lowest = vals.reduce((a, b) => (b.value < a.value ? b : a));
    const highest = vals.reduce((a, b) => (b.value > a.value ? b : a));
    expect(highest.value).toBeGreaterThan(lowest.value);

    const judged = judgeWith({ minEpdrOhm: highest.value }, 'M-B/EPDR');
    expect(judged.find((j) => j.key === lowest.key)!.verdict.pass).toBe(false);
    expect(judged.find((j) => j.key === highest.key)!.verdict.pass).toBe(true);
  });

  it('M-B/|Z|: armed at the strongest load in the field, the weakest one fails', () => {
    const vals = readings('M-B/|Z|');
    const lowest = vals.reduce((a, b) => (b.value < a.value ? b : a));
    const highest = vals.reduce((a, b) => (b.value > a.value ? b : a));
    expect(highest.value).toBeGreaterThan(lowest.value);

    const judged = judgeWith({ ampMinLoadOhm: highest.value }, 'M-B/|Z|');
    const worst = judged.find((j) => j.key === lowest.key)!.verdict;
    expect(worst.pass).toBe(false);
    // The |Z| floor is the one gate with a tolerance, and the failure has to
    // be a real one rather than a rounding: the strongest load in the field
    // passes on the same limit.
    expect(judged.find((j) => j.key === highest.key)!.verdict.pass).toBe(true);
  });

  it('M-C: armed at the quietest drive on the tweeter resonance, the loudest one fails', () => {
    const vals = readings('M-C', 'tweeter');
    expect(vals.length).toBeGreaterThan(0);
    const quietest = vals.reduce((a, b) => (b.value < a.value ? b : a));
    const loudest = vals.reduce((a, b) => (b.value > a.value ? b : a));
    expect(loudest.value).toBeGreaterThan(quietest.value);

    const judged = NETLIST_KEYS.map((key) => ({
      key,
      /* V50 — the per-way map is CLEARED so the single figure judges every
       * way here, as the counter-proof always read it; with the map in place
       * the tweeter's own entry would outrank the figure under test. */
      verdict: report(key, {
        ...BASE,
        maxDriveOnFsDbByDriver: {},
        maxDriveOnFsDb: quietest.value,
      }).gates.verdicts.find(
        (v) => v.gate === 'M-C' && v.subject === 'tweeter',
      )!,
    })).filter((j) => j.verdict !== undefined);
    expect(judged.find((j) => j.key === loudest.key)!.verdict.pass).toBe(false);
    expect(judged.find((j) => j.key === quietest.key)!.verdict.pass).toBe(true);
  });
});


/* ================================================================== *
 * V36 — wat het corpus verstookt, en waar de doelfunctie dat afleest
 * ================================================================== */

describe('V36 — de dissipatie van élke bevroren netlist, en de noemer van de term', () => {
  /** De tolerantieklassen komen uit het referentiebestand, nooit uit deze test
   *  — een tolerantie hoort bij de referentie (goldenCasus1.test.ts). */
  const TOLERANCES = (golden as unknown as {
    toleranties: { procentpunten: number; watt_pct: number; exponent_pct: number };
  }).toleranties;

  type TermArm = {
    hz: number;
    r_source_ohm: number | null;
    noemer_ohm: number | null;
    ratio: number | null;
    term: number;
  };
  const record = (
    golden.manifest_en_geometrie as unknown as {
      v36_dissipatie: {
        aangenomen_vermogen_W: number;
        dissipationWeight: number;
        R_e_woofer_ohm: number;
        /** V37 — de OPGELOSTE R_e die de worker meedraagt, en waar hij vandaan
         *  komt. Twee velden, want zij vallen op casus 1 samen en dat is een
         *  assert en geen aanname. */
        R_e_woofer_opgelost_ohm: number | null;
        noemer_default: string;
        noemer_v2_route: string;
        per_netlist: {
          netlist: string;
          dissipatie_pct: number | null;
          grootste_R_W_bij_100W: number | null;
          term_ketenraster: TermArm | null;
          term_veiligheidsraster: TermArm | null;
          /** V37 — dezelfde probe, dezelfde teller, de GESTELDE noemer. */
          term_op_R_e: TermArm | null;
        }[];
      };
    }
  ).v36_dissipatie;

  /**
   * De klasse-B-referentie die bij één bevroren netlist hoort.
   *
   * AFGELEID en niet uitgeschreven: de drie v1-baselines dragen een sessiesuffix
   * (`HUIDIG_2e`, `KAND_B_3e`) en de rest niet. Een met de hand bijgehouden
   * lijst is precies wat `goldenClassification.test.ts` bij V33 heeft moeten
   * opgeven nadat er bij V32 een corpus bijkwam en niemand terugkwam.
   */
  const KANDIDATEN = golden.kandidaten as unknown as Record<string, { Qes_mult?: number }>;
  const refOf = (netlist: string): { Qes_mult?: number } | null => {
    if (KANDIDATEN[netlist]) return KANDIDATEN[netlist];
    const hits = Object.keys(KANDIDATEN).filter((k) => k.startsWith(`${netlist}_`));
    return hits.length === 1 ? KANDIDATEN[hits[0]] : null;
  };

  it('het blok dekt élke bevroren netlist — een lege of gekrompen lijst faalt', () => {
    /* Dezelfde regel als de vloerwandeling erboven: het blok is afgeleid, dus
     * het hoort mee te bewegen met het manifest. Een blok dat de helft van de
     * netlists noemt zou stil groen blijven. */
    expect(record.per_netlist.map((r) => r.netlist).sort()).toEqual([...NETLIST_KEYS].sort());
    expect(record.aangenomen_vermogen_W).toBe(BASE.amplifierPowerW);
  });

  it('elke opgeschreven dissipatie reproduceert uit de metriek zelf', () => {
    for (const row of record.per_netlist) {
      const got = FIELD.find((f) => f.key === row.netlist)!;
      expect(got.dissipationPct, `${row.netlist}: geen dissipatie gemeten`).not.toBeNull();
      expect(Math.abs(got.dissipationPct! - row.dissipatie_pct!)).toBeLessThanOrEqual(
        TOLERANCES.procentpunten,
      );
      /* NULL AAN BEIDE KANTEN IS EEN GELDIGE UITKOMST, en zij komt voor:
       * `V28_KAND_1` heeft geen enkele DISCRETE weerstand, alleen parasieten.
       * Een netwerk zonder weerstand heeft geen grootste weerstand, en een 0
       * daar zou lezen als "gemeten, en het is nul". Wat NIET mag is dat de twee
       * kanten van elkaar verschillen. */
      expect(
        got.largestResistorW === null,
        `${row.netlist}: het blok en de metriek zijn het oneens over of er een weerstand IS`,
      ).toBe(row.grootste_R_W_bij_100W === null);
      if (got.largestResistorW !== null) {
        expect(
          (Math.abs(got.largestResistorW - row.grootste_R_W_bij_100W!) /
            Math.max(row.grootste_R_W_bij_100W!, 1e-9)) *
            100,
        ).toBeLessThanOrEqual(TOLERANCES.watt_pct);
      }
    }
  });

  it('de doelfunctieterm deelt sinds V37 door de OPGELOSTE R_e, en dat is dezelfde R_e als M-E', () => {
    /* WAT V37 VERPLAATSTE, ALS ASSERT OP HET ECHTE CORPUS.
     *
     * `dissipationWeight · (R_source/x)²` bestaat om de serie-R-route naar
     * niveauregeling af te remmen, en de schade die zij aanricht is
     * Q_es-vermenigvuldiging: `1 + R_source/R_e`, met R_e de DC-weerstand (A3j
     * rij 23, A4 M-E). Tot V37 was `x` de reële impedantie BIJ de probe, en
     * sinds V34 zit die probe op de impedantiepiek van de woofer — de plek waar
     * de twee grootheden het verst uit elkaar liggen.
     *
     * De v2-route deelt sinds V37 door de opgeloste R_e. De DEFAULT is
     * onveranderd, en dat staat er even hard bij: een v1-run leest nog steeds
     * de piekhoogte, byte voor byte. */
    expect(record.noemer_default).toMatch(/probe/);
    expect(record.noemer_v2_route).toMatch(/R_e/);

    /* ÉÉN R_e, ÉÉN HERKOMST, SINDS V37 DRIE LEZERS. De opgeloste R_e die de
     * worker meedraagt, het getal waarop de `Qes_mult`-referenties berekend
     * zijn, en de constante van de fixture zijn hetzelfde getal — en dat is
     * hier een assert, want als zij ooit uiteenlopen weet niemand meer welke
     * van de drie de doelfunctie gebruikt (F4b lek 1, V21). */
    expect(record.R_e_woofer_ohm).toBe(CASUS1_WOOFER_DC_OHM);
    expect(record.R_e_woofer_opgelost_ohm).toBeCloseTo(CASUS1_WOOFER_DC_OHM, 6);
    const mE = (golden.kandidaten as unknown as { _M_E_parameters: { R_e_ohm: number } })
      ._M_E_parameters;
    expect(mE.R_e_ohm).toBe(CASUS1_WOOFER_DC_OHM);

    /* De facts ZOALS DE RUN ZE BOUWT, en dat detail is de helft van de claim.
     * De A5c.1-hiërarchie zet een INGEVOERDE meterlezing boven elke afleiding
     * uit de sweep, en de generator voert er een in — het is het getal waarop
     * de `Qes_mult`-referenties berekend zijn. Wat de worker meedraagt is
     * daarmee precies wat M-E publiceert. */
    const runFacts = casus1V2Facts(
      report('HUIDIG', { ...BASE, reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM } }),
      manifest,
      files,
    );
    expect(runFacts.reOhmByModel?.woofer).toBeCloseTo(CASUS1_WOOFER_DC_OHM, 6);
    expect(runFacts.reSourceByModel?.woofer).toMatch(/meter/);

    /* ...en de tegenproef dat de hiërarchie ECHT loopt: zonder die ingevoerde
     * lezing komt er een ander getal uit (de motionele fit), en dan draagt de
     * term dat. Zonder deze assert zou "de opgeloste R_e" niet te onderscheiden
     * zijn van "een constante die toevallig 3,05 is". */
    const fitFacts = casus1V2Facts(report('HUIDIG'), manifest, files);
    expect(
      Math.abs((fitFacts.reOhmByModel?.woofer ?? 0) - CASUS1_WOOFER_DC_OHM),
      'zonder ingevoerde DC levert de hiërarchie hetzelfde getal — dan meet zij niets',
    ).toBeGreaterThan(0.05);

    const rows = record.per_netlist.filter((r) => r.term_veiligheidsraster !== null);
    expect(rows.length, 'geen enkele netlist probet nog op het veiligheidsraster').toBe(
      NETLIST_KEYS.length,
    );
    expect(
      record.per_netlist.filter((r) => r.term_op_R_e !== null).length,
      'niet elke netlist draagt de V37-arm',
    ).toBe(NETLIST_KEYS.length);
    for (const row of rows) {
      /* De probe hangt aan het RASTER en aan de impedantie van de laagste weg,
       * niet aan het netwerk — dus élke netlist landt op dezelfde frequentie
       * met dezelfde noemer. Zou dat ooit niet meer zo zijn, dan is de aanname
       * onder deze hele entry weg en hoort dat hier te blijken. */
      expect(row.term_veiligheidsraster!.hz).toBe(rows[0].term_veiligheidsraster!.hz);
      expect(row.term_veiligheidsraster!.noemer_ohm).toBe(
        rows[0].term_veiligheidsraster!.noemer_ohm,
      );
      // ...en de V37-arm leest dezelfde probe met een ANDERE noemer: de teller
      // is niet verplaatst, alleen datgene waardoor hij gedeeld wordt.
      expect(row.term_op_R_e!.hz).toBe(row.term_veiligheidsraster!.hz);
      expect(row.term_op_R_e!.r_source_ohm).toBe(row.term_veiligheidsraster!.r_source_ohm);
      expect(row.term_op_R_e!.noemer_ohm).toBeCloseTo(CASUS1_WOOFER_DC_OHM, 2);
    }

    /* DE FACTOR DIE V37 WEGHAALT, uit de meting zelf en nooit ingetypt. De
     * piekhoogte ligt meetbaar boven R_e, en de term kwadrateert dat verschil.
     * Zakt deze verhouding ooit naar 1, dan is de vóór/ná van deze entry
     * betekenisloos geworden en hoort dat hier te breken. */
    const denom = rows[0].term_veiligheidsraster!.noemer_ohm!;
    expect(
      denom / CASUS1_WOOFER_DC_OHM,
      `de piekhoogte (${denom} Ω) ligt niet meer meetbaar boven R_e`,
    ).toBeGreaterThan(2);
  });

  it('V37 — de verhouding op R_e REPRODUCEERT de Qes_mult-referenties, en die op de piek niet', () => {
    /* DE REFERENTIE IS DE DEFINITIE, en dat is de hele controle onder V37.
     * M-E rekent `Q_es_mult = (R_e + R_s)/R_e = 1 + R_s/R_e` op precies de R_e
     * hierboven; de dissipatieterm rekent `R_source/x`. Zijn beide dezelfde
     * grootheid, dan is `1 + verhouding` per definitie gelijk aan de
     * `Qes_mult`-referentie van dezelfde netlist — binnen de tolerantieklasse
     * die bij die referentie hoort, want de twee lezen bij een iets andere
     * frequentie (M-E bij f_s op het rapportraster, de term bij de probe op het
     * veiligheidsraster).
     *
     * De TEGENPROEF draagt de claim (V23): op de piekhoogte reproduceert
     * dezelfde som juist NIET, en dat moet zichtbaar zijn op élke netlist die
     * werkelijk serieweerstand draagt. Zonder die helft zou "hij deelt door
     * R_e" niet te onderscheiden zijn van "hij deelt door iets wat er toevallig
     * op lijkt". */
    const tol = TOLERANCES.exponent_pct;
    const pct = (got: number, want: number) => (Math.abs(got - want) / Math.abs(want)) * 100;
    let checked = 0;
    let counterProved = 0;
    for (const row of record.per_netlist) {
      const ref = refOf(row.netlist);
      const q = ref?.Qes_mult;
      expect(q, `${row.netlist}: geen Qes_mult-referentie om tegen te controleren`).toBeTypeOf(
        'number',
      );
      const onRe = row.term_op_R_e!;
      expect(onRe.ratio, `${row.netlist}: de V37-arm draagt geen verhouding`).toBeTypeOf('number');
      expect(
        pct(1 + onRe.ratio!, q!),
        `${row.netlist}: 1 + R_source/R_e = ${(1 + onRe.ratio!).toFixed(4)} tegen een ` +
          `Qes_mult-referentie van ${q}`,
      ).toBeLessThanOrEqual(tol);
      checked++;

      /* De tegenproef, alleen waar zij iets kan betekenen: een netlist met
       * vrijwel geen serieweerstand heeft `Qes_mult ≈ 1` en dan liggen beide
       * noemers even dicht bij de referentie. Dat is geen ontsnapping maar een
       * eigenschap van zo'n netwerk, en het aantal dat WEL meedoet wordt
       * geteld zodat een corpus waarin niemand meer meedoet niet stil groen
       * blijft. */
      if (q! > 1 + tol / 100) {
        expect(
          pct(1 + row.term_veiligheidsraster!.ratio!, q!),
          `${row.netlist}: de PIEKHOOGTE reproduceert de Qes_mult-referentie ook — dan is de ` +
            'claim "de term deelt door R_e" niet te onderscheiden van de toestand ervóór',
        ).toBeGreaterThan(tol);
        counterProved++;
      }
    }
    expect(checked).toBe(NETLIST_KEYS.length);
    expect(counterProved, 'geen enkele bevroren netlist draagt genoeg serieweerstand voor de tegenproef')
      .toBeGreaterThan(0);
  });

  it('V37 — op de PIEK haalde die term de uitdagingsdrempel nooit; op R_e haalt hij hem wel', () => {
    /* WAAROM V37 EEN EIGEN SESSIE WAARD WAS, in één vergelijking.
     *
     * De tuner beslist met PROCENTUELE poorten: een uitdaging wordt aangenomen
     * bij 1 % verbetering, een tak gesnoeid bij 10 %. Een term die onder die
     * 1 % blijft kan geen enkele van die beslissingen omdraaien — hij is dan
     * gewapend, hij kost rekentijd, en hij bewaakt niets. Dat was de bevinding
     * van V36 en zij is hier de "vóór"-helft.
     *
     * De grens komt uit de tuner en niet uit dit bestand; de objectiefwaarde is
     * `rms²`, want `fxOf`'s dominante term is `2(1−p)·rms²` met p = 0,5. Elke
     * term die aan `fx` ontbreekt maakt de noemer alleen groter, dus dit blijft
     * de gunstigste vergelijking voor de dissipatieterm.
     *
     * ELKE NETLIST TEGEN ZIJN EIGEN OBJECTIEF, EN DAT IS SINDS V41 EEN
     * CORRECTIE. Hier stond de kleinste RMS die het HELE casusboek draagt, als
     * bewust conservatieve keuze — verdedigbaar zolang alle netlists in een
     * smalle band lagen (1,68–2,08 bij V38-fix). V41 maakte het veld vlakker
     * (0,48–1,86), en toen brak de "vóór"-helft: 1,22 % tegen een drempel van
     * 1 %. NIET doordat de term groeide — de grootste piek-term ging van
     * 0,002819 naar 0,002067 — maar doordat de noemer kromp. De vergelijking
     * legde de term van de ENE netlist naast het objectief van een ANDERE, en
     * dat is nergens een grootheid: de tuner telt de term op bij het objectief
     * van het netwerk dat hij op dat moment evalueert. Per netlist tegen zijn
     * eigen objectief is dus niet de zwakkere maar de JUISTE vergelijking, en
     * zij houdt V37's bevinding overeind: grootste piek-aandeel 0,74 %,
     * grootste R_e-aandeel 29,5 %. De drempel is niet aangeraakt.
     *
     * De drie v1-baselines dragen geen `rms_vlakheid_dB` in `kandidaten` en
     * vallen daarom buiten deze vergelijking; het AANTAL dat meedoet wordt
     * geassert, zodat een gekrompen verzameling faalt in plaats van stil groen
     * te blijven. */
    const CHALLENGE_FRACTION = 0.01;
    const rmsOf = (netlist: string): number | null => {
      const block = (golden.kandidaten as unknown as Record<string, { rms_vlakheid_dB?: number }>)[
        netlist
      ];
      const v = block?.rms_vlakheid_dB;
      return typeof v === 'number' && v > 0 ? v : null;
    };
    const shares: { netlist: string; peak: number; re: number }[] = [];
    for (const r of record.per_netlist) {
      const rms = rmsOf(r.netlist);
      if (rms === null) continue;
      const fx = rms ** 2;
      shares.push({
        netlist: r.netlist,
        peak: (r.term_veiligheidsraster?.term ?? 0) / fx,
        re: (r.term_op_R_e?.term ?? 0) / fx,
      });
    }
    expect(
      shares.length,
      'geen enkele bevroren netlist draagt zowel een dissipatieterm als een eigen RMS-referentie',
    ).toBeGreaterThan(record.per_netlist.length - 5);

    const worstPeak = Math.max(
      ...record.per_netlist.map((r) => r.term_veiligheidsraster?.term ?? 0),
    );
    const worstRe = Math.max(...record.per_netlist.map((r) => r.term_op_R_e?.term ?? 0));
    expect(worstPeak).toBeGreaterThan(0);

    /* VÓÓR: op geen enkele netlist HAALDE de term de drempel — en sinds V47 is
     * dat een claim over het corpus waarop V36 en V37 hem gemeten hebben, niet
     * over het levende veld.
     *
     * DIT IS DE DERDE KEER DAT DEZELFDE VAL TOESLAAT en daarom staat zij hier
     * uitgeschreven. De term wordt gedeeld door het OBJECTIEF van de netlist,
     * en dat objectief krimpt naarmate het veld vlakker wordt. V41 mat het voor
     * het eerst: de assert deelde toen door de kleinste RMS van het HELE
     * casusboek en sloeg om toen V41 het veld vlakker maakte — niet doordat de
     * term groeide maar doordat de noemer kromp. De reparatie (elke netlist
     * tegen zijn EIGEN objectief) was juist en heeft het mechanisme niet
     * weggenomen: bij V47 kromp het objectief opnieuw, want de gewapende
     * M-C-poort liet alleen de vlakste ontwerpen door. `KAND_V2_1` draagt RMS
     * 0,48 — het vlakste ontwerp van het boek — en komt daarmee op 1,05 %.
     *
     * DE DREMPEL WORDT NIET OPGEREKT, want dan zou zij precies zo ver
     * meebewegen als nodig is om groen te blijven, en dat is geen bewaker meer.
     * In plaats daarvan wordt de strikte claim geANKERD op de netlists waarop
     * V36 en V37 hem deden, waar hij ONVERANDERD staat (grootste piek-aandeel
     * 0,736 %), en het levende veld krijgt de claim die V37 werkelijk draagt en
     * die hieronder los geassert wordt: de twee noemers liggen een orde van
     * grootte uit elkaar.
     *
     * DE VIERDE KEER, BIJ V48, EN NU LAG HET AAN DE ANKERING ZELF. V47 ankerde
     * met een COMPLEMENT — "alles wat niet `KAND_V2_n` heet" — en dat is geen
     * anker maar een verzameling die met elk corpus meegroeit. De netlist die
     * hem bij V47 brak (`KAND_V2_1`, RMS 0,48, 1,053 %) is bij V48 BEVROREN als
     * `V47_KAND_1`, en daarmee stapte precies het geval dat uitgesloten was
     * weer binnen. Dat was geen ongeluk maar een zekerheid: élke sessie
     * bevriest het levende corpus vóór zij regenereert, dus een complementfilter
     * op "levend" laat het uitgesloten geval er bij de eerstvolgende
     * regeneratie weer in.
     *
     * EEN ANKER NOEMT ZIJN VERZAMELING. Hieronder staan de families die
     * BESTONDEN toen V36 en V37 gemeten werden, uitgeschreven, en die lijst kan
     * per definitie niet groeien — een corpus dat later bevroren wordt hoort er
     * niet bij, want V36 en V37 hebben het nooit gezien. Dezelfde herankering
     * die V43 op `v42_bult_bevinding` toepaste, nu in de vorm die haar eigen
     * groei overleeft. */
    const V36_V37_FAMILIES = [
      'HUIDIG',
      'KAND_A',
      'KAND_B',
      'V28_KAND_',
      'V30_KAND_',
      'V32_KAND_',
      'V33_KAND_',
      'V33_SWEEP_KAND_',
      'V34_KAND_',
      'V37_KAND_',
    ];
    const dated = shares.filter((x) => V36_V37_FAMILIES.some((f) => x.netlist.startsWith(f)));
    expect(dated.length, 'geen enkel gedateerd corpus draagt deze meting meer').toBeGreaterThan(50);
    /* En de verzameling is aantoonbaar KLEINER dan "alles wat niet levend is" —
     * zonder deze tegenproef zou het anker stil weer een complement kunnen
     * worden zodra iemand de lijst aanvult met wat er toevallig bestaat. */
    expect(dated.length).toBeLessThan(shares.filter((x) => !/^KAND_V2_\d+$/.test(x.netlist)).length);
    const worstPeakShare = Math.max(...dated.map((x) => x.peak));
    const worstPeakAt = dated.find((x) => x.peak === worstPeakShare)!.netlist;
    expect(
      worstPeakShare,
      `op de piekhoogte haalt de term ${(worstPeakShare * 100).toFixed(2)} % van het eigen ` +
        `objectief van ${worstPeakAt} — die zou de uitdagingsdrempel dus wél kunnen halen, en ` +
        'dan is V36\'s bevinding vervallen op het corpus waarop zij gedaan is',
    ).toBeLessThan(CHALLENGE_FRACTION);
    // NÁ: op R_e haalt hij hem, en dus kan hij voor het eerst iets beslissen.
    const bestReShare = Math.max(...shares.map((x) => x.re));
    expect(
      bestReShare,
      `op R_e haalt de term maar ${(bestReShare * 100).toFixed(2)} % — dan heeft V37 ` +
        'de term niet groot genoeg gemaakt om te sturen en is de entry niet waar',
    ).toBeGreaterThan(CHALLENGE_FRACTION);

    /* EN DE CLAIM DIE V37 WERKELIJK DRAAGT, op ÉLKE netlist en dus ook op het
     * levende veld: welke noemer je ook kiest, zij liggen een orde van grootte
     * uit elkaar. Dat is wat "de term is op de piek te klein om te sturen"
     * betekent zodra het objectief zelf een bewegend doel blijkt, en het is de
     * vorm die niet stil kan verouderen wanneer het veld vlakker wordt. */
    for (const x of shares) {
      if (x.peak <= 0) continue;
      expect(
        x.re / x.peak,
        `${x.netlist}: R_e-aandeel ${(x.re * 100).toFixed(2)} % tegen piek-aandeel ` +
          `${(x.peak * 100).toFixed(2)} % — geen orde van grootte ertussen, en dan is het ` +
          'verschil tussen de twee noemers geen verschil meer dat iets beslist',
      ).toBeGreaterThan(10);
    }

    /* ...en het verschil tussen die twee is precies het KWADRAAT van de factor
     * tussen de twee noemers. Afgeleid uit de opgeschreven noemers zelf, zodat
     * de bewering niet op een ingetypt getal rust. */
    const peakOhm = record.per_netlist.find((r) => r.term_veiligheidsraster)!
      .term_veiligheidsraster!.noemer_ohm!;
    const expected = (peakOhm / CASUS1_WOOFER_DC_OHM) ** 2;
    expect(
      Math.abs(worstRe / worstPeak - expected) / expected,
      `de twee armen verschillen een factor ${(worstRe / worstPeak).toFixed(2)}, en de noemers ` +
        `een factor ${(peakOhm / CASUS1_WOOFER_DC_OHM).toFixed(2)} — dat kwadrateert niet tot ` +
        'hetzelfde, dus de twee armen meten niet dezelfde teller',
    ).toBeLessThan(0.01);
  });
});

/* ================================================================== *
 * V38-fix — WAT DE ZOEKTOCHT MEET, OP ELKE BEVROREN NETLIST
 * ================================================================== */

/**
 * DE VONDST, EN ZIJ CORRIGEERT DE MECHANISME-ZIN VAN V38.
 *
 * V38 mat dat de zoektocht op deze casus een som met een kenmerk van 43-47 dB
 * ziet waar de echte som 4,4-6,4 dB rimpelpiek heeft, en schreef die 43 dB toe
 * aan de ontkoppeling van magnitude en fase: `smoothMag` gladt de MAGNITUDE
 * van elke driver, laat zijn FASE staan, en sommeert daarna complex. Die
 * ontkoppeling bestaat, maar zij is niet wat de 43 dB maakt — nagemeten door
 * de gladding ook NA de sommatie uit te rekenen, waar geen enkele ontkoppeling
 * bestaat, en hetzelfde getal te krijgen.
 *
 * WAT HET WEL IS. Het ketenraster loopt tot 20 000 Hz en de gemeten
 * uitgestrektheid van alle drie de wegen houdt op bij 19 053,6 Hz. Het
 * rasterpunt daarboven is de STILLE GEEST: -400 dB, de conventie van de app
 * voor "hier is niet gemeten" (A5b/`designSolve`). Dat punt ligt BUITEN de
 * beoordeelde band, dus geen enkel oordeel raakt het aan. Maar een
 * gladdingskern van 1/12 octaaf reikt eroverheen, en zij trekt het laatste
 * punt BINNEN de band van 130,95 dB naar 43,67 dB. Eén rasterpunt, en het
 * draagt de hele 43 dB.
 *
 * WAAROM DAT DE REPARATIE KIEST. De opdracht was: 0, of gladden-ná-sommatie —
 * beantwoord met een meting. Het antwoord staat hieronder en het is
 * ondubbelzinnig: ná de sommatie gladden verandert er niets aan, want de geest
 * zit ook in de som. Alleen NIET gladden haalt hem weg. Elke breedte boven nul
 * reikt over dezelfde rand.
 *
 * WAT DAARMEE NIET GEREPAREERD IS, en het staat hier omdat het anders
 * onzichtbaar zou zijn: dit is een eigenschap van `smoothDbGaussian` op een
 * raster met dode punten, en de v1-route leest die maat nog steeds. V38-fix
 * verandert wat de v2-route MEET; het repareert de gladding niet (opdracht:
 * geen wijziging aan `smoothMag` of enige andere gladding). Zie casusboek
 * V38-fix, open punt.
 */

/** De historische zoekgladding van de tuner — de breedte die tot V38-fix gold. */
const LEGACY_SMOOTH_OCT = 1 / 12;

/** De band waarop de v2-route casus 1 beoordeelt — uit de fixture, niet hier. */
const JUDGED_BAND = CASUS1_V2_BAND_HZ;

const v38fixChain = casus1ChainInput(manifest, files, golden);

/** De takken zoals de keten ze aan de tuner geeft. */
const V38FIX_BRANCHES: { model: string; response: GriddedResponse }[] = [
  { model: 'woofer', response: v38fixChain.w },
  { model: 'mid', response: v38fixChain.m },
  { model: 'tweeter', response: v38fixChain.t },
];

/** De complexe som van een netwerk uit de gegeven takresponsies. */
function v38fixSum(
  parts: readonly VxpPart[],
  branches: typeof V38FIX_BRANCHES,
): GriddedResponse {
  const netlist = crossoverToNetlist({ name: 'v38fix', parts: [...parts] } as VxpCrossover).netlist;
  const sol = solveNetwork(netlist, v38fixChain.grid, v38fixChain.driverZ);
  const filtered: { response: GriddedResponse }[] = [];
  for (const b of branches) {
    const d = sol.drivers.find((x) => x.model === b.model);
    const h = d ? sol.transfers[d.id] : null;
    if (h) filtered.push({ response: applyTransfer(b.response, h) });
  }
  const c = combineN(filtered);
  return { freq: c.freq, spl: c.combinedSpl, phaseDeg: c.combinedPhaseDeg };
}

/** Indices van het raster die binnen de beoordeelde band vallen. */
const IN_BAND = v38fixChain.grid
  .map((f, i) => ({ f, i }))
  .filter((x) => x.f >= JUDGED_BAND[0] && x.f <= JUDGED_BAND[1])
  .map((x) => x.i);

const bandStats = (spl: readonly number[]) => {
  let lo = Infinity;
  let hi = -Infinity;
  let loAt = -1;
  let sum = 0;
  let sq = 0;
  for (const i of IN_BAND) {
    if (spl[i] < lo) {
      lo = spl[i];
      loAt = i;
    }
    if (spl[i] > hi) hi = spl[i];
    sum += spl[i];
    sq += spl[i] * spl[i];
  }
  const mean = sum / IN_BAND.length;
  return {
    min: lo,
    minAt: loAt,
    max: hi,
    peak: (hi - lo) / 2,
    /** De AMPLITUDETERM zelf: de spreiding om het bandgemiddelde, dezelfde
     *  statistiek als `bandStd` in de tuner en als `rmsDeviationDb` bij de
     *  acceptatie. De piek hierboven is wat de tuner rapporteert; dit is
     *  waarop hij zoekt. */
    std: Math.sqrt(Math.max(0, sq / IN_BAND.length - mean * mean)),
  };
};

/**
 * De drie zoekmaten per bevroren netlist, één keer uitgerekend.
 *
 * Geen enkele tune: dit zijn oplossingen van een gegeven netwerk, en de vraag
 * is welke KROMME eruit volgt — niet welk netwerk een zoektocht zou vinden.
 */
const V38FIX: {
  key: string;
  raw: ReturnType<typeof bandStats>;
  afterSum: ReturnType<typeof bandStats>;
  beforeSum: ReturnType<typeof bandStats>;
}[] = NETLIST_KEYS.map((key) => {
  const parts = casus1Parts(key);
  const raw = v38fixSum(parts, V38FIX_BRANCHES);
  const beforeSum = v38fixSum(
    parts,
    V38FIX_BRANCHES.map((b) => ({
      model: b.model,
      response: { ...b.response, spl: smoothDbGaussian(b.response.freq, b.response.spl, LEGACY_SMOOTH_OCT) },
    })),
  );
  return {
    key,
    raw: bandStats(raw.spl),
    afterSum: bandStats(smoothDbGaussian(raw.freq, raw.spl, LEGACY_SMOOTH_OCT)),
    beforeSum: bandStats(beforeSum.spl),
  };
});

describe('V38-fix — de zoekmaat op elke bevroren netlist', () => {
  it('de premisse: er staat een STILLE GEEST net buiten de band, en de band zelf is heel', () => {
    /* Zonder deze assert is alles hieronder een uitspraak over een raster
     * waarvan niemand heeft gecontroleerd hoe het eruitziet. Twee helften:
     * binnen de band leeft élk punt (anders zou het oordeel zelf al een dood
     * punt lezen), en het eerste punt erboven is dood. */
    const dead = (v: number) => v < -300;
    for (const b of V38FIX_BRANCHES) {
      for (const i of IN_BAND) {
        expect(dead(b.response.spl[i]), `${b.model} is dood binnen de band`).toBe(false);
      }
    }
    const above = v38fixChain.grid.findIndex((f) => f > JUDGED_BAND[1]);
    expect(above, 'het raster houdt op bij de band — dan is er geen geest om over te reiken').toBeGreaterThan(0);
    for (const b of V38FIX_BRANCHES) {
      expect(dead(b.response.spl[above]), `${b.model} leeft nog boven de band`).toBe(true);
    }
  });

  it('de gegladde zoekmaat leest een minimum dat groter is dan de hele echte variatie — op ELKE netlist', () => {
    /* De bevinding, falsifieerbaar gemaakt zonder één ingetypt getal: het gat
     * dat de gladding in de band trekt is groter dan het VOLLEDIGE
     * piek-tot-dal-bereik van de echte som. Een zoekmaat waarvan het
     * artefact groter is dan het verschijnsel dat zij gladstrijkt, meet niet
     * datzelfde verschijnsel.
     *
     * En hij landt op het LAATSTE punt in de band, wat het mechanisme is: de
     * kern reikt over de bandrand heen naar de stille geest. */
    const last = IN_BAND[IN_BAND.length - 1];
    let worst = 0;
    for (const r of V38FIX) {
      const drop = r.raw.min - r.beforeSum.min;
      expect(drop, `${r.key}: de gladding trekt niets naar beneden`).toBeGreaterThan(2 * r.raw.peak);
      expect(r.beforeSum.minAt, `${r.key}: het minimum ligt niet op de bandrand`).toBe(last);
      worst = Math.max(worst, drop);
    }
    expect(worst).toBeGreaterThan(0);
  });

  it('GLADDEN-NA-SOMMATIE repareert het niet — de twee volgorden zijn niet te onderscheiden', () => {
    /* DE METING DIE DE REPARATIE KOOS. De ongebouwde variant (eerst sommeren,
     * dan gladden) kent geen ontkoppeling van magnitude en fase, dus als die
     * ontkoppeling het probleem was zou zij het wegnemen. Zij neemt niets weg:
     * de twee volgorden verschillen minder dan de ECHTE rimpel van dezelfde
     * netlist, terwijl beide daar veelvouden boven zitten. De geest zit ook in
     * de som.
     *
     * Daarom is de reparatie 0 en is de variant een genoteerde mogelijkheid
     * gebleven in plaats van een bouwopdracht. */
    for (const r of V38FIX) {
      const dAfter = Math.abs(r.afterSum.peak - r.raw.peak);
      const dBefore = Math.abs(r.beforeSum.peak - r.raw.peak);
      expect(dAfter, `${r.key}: ná sommatie gladden laat de echte som staan`).toBeGreaterThan(
        2 * r.raw.peak,
      );
      expect(
        Math.abs(dAfter - dBefore),
        `${r.key}: de twee gladdingsvolgorden zijn wél te onderscheiden`,
      ).toBeLessThan(2 * r.raw.peak);
    }
  });

  it('DE ZOEKMAAT RANGSCHIKT HET CORPUS ANDERS DAN DE MAAT DIE HET BEOORDEELT', () => {
    /* DE SCHERPSTE VORM VAN DE BEVINDING, en de reden dat een offset hier geen
     * onschuldige offset is.
     *
     * De amplitudeterm van de zoektocht is de SPREIDING van de som over de
     * band (`bandStd`), en de acceptatie leest dezelfde statistiek ongegladd
     * (`rmsDeviationDb`). Trok de gladding er alleen een constante bij op, dan
     * zou de zoektocht nog steeds de goede kant op lopen. Zij doet iets anders:
     * zij COMPRIMEERT. De echte spreiding loopt over dit corpus van 0,60 tot
     * 3,81 dB — een factor 6,4 — en de zoekmaat leest 9,60 tot 10,93, een
     * factor 1,14, want in beide gevallen is het gat naar de stille geest de
     * dominante term.
     *
     * Gevolg, en dat is de assert: het ontwerp dat het OORDEEL het slechtste
     * van dit corpus vindt, komt op de zoekmaat in de BETERE HELFT terecht.
     * Geen ingetypt getal — de vergelijking is die van de twee rangordes met
     * elkaar. */
    const byJudged = [...V38FIX].sort((a, b) => a.raw.std - b.raw.std);
    const bySearch = [...V38FIX].sort((a, b) => a.beforeSum.std - b.beforeSum.std);
    const worstJudged = byJudged[byJudged.length - 1];
    const whereOnSearch = bySearch.findIndex((r) => r.key === worstJudged.key);
    expect(
      whereOnSearch,
      `${worstJudged.key} is het slechtste ontwerp op de beoordeelde maat en de zoekmaat zet ` +
        'het niet meer in de betere helft — is de zoekmaat veranderd?',
    ).toBeLessThan(V38FIX.length / 2);

    /* ...en de compressie zelf, in dezelfde constant-vrije vorm: de spreiding
     * die het oordeel ziet is een veelvoud van de spreiding die de zoektocht
     * ziet. Zonder deze helft zou de rangorde-assert ook waar kunnen zijn bij
     * een maat die simpelweg ruis toevoegt. */
    const span = (xs: number[]) => Math.max(...xs) / Math.min(...xs);
    expect(span(V38FIX.map((r) => r.raw.std))).toBeGreaterThan(
      2 * span(V38FIX.map((r) => r.beforeSum.std)),
    );
  });

  it('...en de ontkoppeling van magnitude en fase is er wél, maar zij is het niet', () => {
    /* De correctie op V38's mechanisme-zin, als eigen claim: het verschil
     * tussen vóór en ná sommatie is het effect van de ontkoppeling, en dat is
     * op élke netlist kleiner dan een tiende van de echte rimpelpiek. Het
     * bestaat; het draagt de bevinding niet. */
    for (const r of V38FIX) {
      const decoupling = Math.abs(r.beforeSum.peak - r.afterSum.peak);
      expect(decoupling, `${r.key}: de ontkoppeling draagt hier wél gewicht`).toBeLessThan(
        r.raw.peak / 10,
      );
    }
  });
});

/* ================================================================== *
 * V42 — het gestelde LF-bult-budget
 * ================================================================== */

describe('V42 (herankerd bij V43) — what the budget on the SUM did, on the corpus it did it to', () => {
  /** The dB tolerance class, from the reference file — never written here. */
  const TOL_DB = (golden as unknown as { toleranties: { dB: number } }).toleranties.dB;

  /**
   * WHY THIS BLOCK STILL EXISTS AND WHY IT NO LONGER READS THE LIVE CORPUS.
   *
   * V42 stated 2.5 dB on `extraDb` — lift and amplification together — and the
   * measurement refused the claim the session set out to write. That negative
   * result is the reason V43 happened, so it is kept as an assert rather than
   * as prose. What changed is only WHERE it points: it used to say "the live
   * corpus", and the live corpus was regenerated on a different quantity, so
   * the sentence would have become false without anything failing. It now names
   * the FROZEN `V42_KAND_*` netlists, which are byte-identical copies of what
   * was live then and can never move again.
   *
   * THE CLAIM THE SESSION COULD NOT WRITE, and it is worth repeating here
   * because it is why there is still no "every netlist is under budget" assert
   * anywhere in this file: asserting that would have meant an exception list
   * containing the entire corpus, which is the waiver this file exists to
   * prevent.
   */
  const FINDING = (golden.manifest_en_geometrie as unknown as {
    v42_bult_bevinding?: {
      gesteld_budget_dB: number;
      netlists: number;
      eroverheen: number;
      per_netlist: { netlist: string; bult_dB: number }[];
      lf_bult_budget_werkingsgebied: string;
    };
  }).v42_bult_bevinding;

  it('the V42 corpus still measures what the finding says it measured', () => {
    expect(FINDING, 'the case book records no V42 finding').toBeTruthy();
    const frozen = FIELD.filter((f) => /^V42_KAND_\d+$/.test(f.key));
    expect(frozen.length, 'the frozen V42 corpus is gone').toBe(FINDING!.netlists);
    expect(FINDING!.per_netlist.map((r) => r.netlist).sort()).toEqual(
      frozen.map((f) => f.key).sort(),
    );

    const over = frozen.filter((f) => f.lfBumpDb !== null && f.lfBumpDb > FINDING!.gesteld_budget_dB);
    expect(
      over.length,
      `the finding records ${FINDING!.eroverheen} of them over the budget it was stated at, and ` +
        `the metric now counts ${over.length}`,
    ).toBe(FINDING!.eroverheen);

    for (const row of FINDING!.per_netlist) {
      const f = frozen.find((x) => x.key === row.netlist)!;
      expect(
        Math.abs(f.lfBumpDb! - row.bult_dB),
        `${row.netlist}: the finding records ${row.bult_dB} dB and the metric reads ` +
          `${f.lfBumpDb!.toFixed(2)}`,
      ).toBeLessThanOrEqual(TOL_DB);
    }
    // The reason has to be a reason, not a shrug.
    expect(FINDING!.lf_bult_budget_werkingsgebied.length).toBeGreaterThan(200);
    expect(FINDING!.lf_bult_budget_werkingsgebied).toMatch(/\bV\d+\b/);
  });

  it('the withdrawn requirement condemned every one of the reference filters', () => {
    /* The other half of V42's negative result, and the sentence V43 turned
     * around: on the SUM the designer's own three filters all exceeded the
     * stated 2.5 dB, so the requirement had no "HUIDIG proves it buildable"
     * counter-proof at all. The block below shows what the same three do on the
     * quantity that replaced it. */
    const stated = (golden.manifest_en_geometrie as unknown as {
      gestelde_eisen?: { gemeten_bult_referentiefilters_dB?: Record<string, number> };
    }).gestelde_eisen?.gemeten_bult_referentiefilters_dB;
    expect(stated, 'the manifest does not record what the reference filters measure').toBeTruthy();
    for (const key of V1_BASELINES) {
      const f = FIELD.find((x) => x.key === key)!;
      expect(
        Math.abs(f.lfBumpDb! - stated![key]),
        `${key}: the manifest records ${stated![key]} dB and the metric now reads ` +
          `${f.lfBumpDb!.toFixed(2)}`,
      ).toBeLessThanOrEqual(TOL_DB);
      expect(f.lfBumpDb!).toBeGreaterThan(FINDING!.gesteld_budget_dB);
    }
  });
});

/* ================================================================== *
 * V43 — het GEHERIJKTE budget, op de resonante component
 * ================================================================== */

describe('V43 — the stated budget is on the resonant half, and it is 1.4 dB', () => {
  const BUDGET_DB = casus1LfResonantBudgetDb(golden);
  const TOL_DB = (golden as unknown as { toleranties: { dB: number } }).toleranties.dB;
  const LIVE = FIELD.filter((f) => /^KAND_V2_\d+$/.test(f.key));

  const RECORD = (golden.manifest_en_geometrie as unknown as {
    v43_budget_bevinding?: {
      gesteld_budget_dB: number;
      grootheid: string;
      levend_corpus: number;
      eroverheen: number;
      per_netlist: { netlist: string; opslingering_dB: number | null }[];
      referentiefilters: { netlist: string; opslingering_dB: number | null }[];
    };
  }).v43_budget_bevinding;

  it('the budget is stated on the resonant half, and every netlist carries one', () => {
    expect(BUDGET_DB, 'casus 1 states no LF budget — V43 assumes it does').not.toBeNull();
    for (const f of FIELD) {
      expect(f.lfResonantDb, `${f.key}: M-D produced no resonant figure`).not.toBeNull();
    }
  });

  it('it is REACHABLE, and this time the designer\'s own filter is the proof', () => {
    /* THE MIRROR OF THE AMPLIFIER FLOOR, RESTORED. Under V42's 2.5 dB on the
     * sum this proof was missing: all three reference filters exceeded the
     * requirement, so the evidence that it excluded no buildable design had to
     * be borrowed from the V28 corpus. On the resonant half all three clear it
     * with room — their coils add nothing at all — which is what a stated
     * requirement is supposed to look like beside the design it came from. */
    for (const key of V1_BASELINES) {
      const f = FIELD.find((x) => x.key === key)!;
      expect(
        f.lfResonantDb!,
        `${key} no longer clears the stated budget — then the requirement has lost the proof ` +
          'that it excludes no buildable design',
      ).toBeLessThanOrEqual(BUDGET_DB!);
    }
  });

  it('and it is NOT vacuous: netlists in this case book exceed it', () => {
    /* The other half, and without it "everything passes" and "the requirement
     * binds" are the same observation. It is deliberately NOT asserted on the
     * live corpus alone: a regeneration that happened to satisfy the budget
     * everywhere would be a good outcome, not a broken test. */
    const over = FIELD.filter((f) => f.lfResonantDb! > BUDGET_DB!);
    expect(
      over.length,
      'no frozen netlist anywhere in the case book exceeds the stated budget — then it bounds ' +
        'nothing and it is the requirement that is wrong',
    ).toBeGreaterThan(0);
  });

  it('the recorded live finding still matches a fresh measurement, per netlist', () => {
    expect(RECORD, 'the case book records no V43 budget finding').toBeTruthy();
    expect(RECORD!.gesteld_budget_dB).toBe(BUDGET_DB);
    expect(RECORD!.grootheid).toContain('resonantDb');
    expect(RECORD!.levend_corpus).toBe(LIVE.length);
    expect(RECORD!.per_netlist.map((r) => r.netlist).sort()).toEqual(LIVE.map((f) => f.key).sort());

    const over = LIVE.filter((f) => f.lfResonantDb! > BUDGET_DB!).length;
    expect(
      over,
      `the record says ${RECORD!.eroverheen} live netlists over the budget and the metric counts ` +
        `${over}`,
    ).toBe(RECORD!.eroverheen);

    for (const row of [...RECORD!.per_netlist, ...RECORD!.referentiefilters]) {
      const f = FIELD.find((x) => x.key === row.netlist)!;
      expect(row.opslingering_dB, `${row.netlist}: no recorded figure`).not.toBeNull();
      expect(
        Math.abs(f.lfResonantDb! - row.opslingering_dB!),
        `${row.netlist}: the record says ${row.opslingering_dB} dB and the metric reads ` +
          `${f.lfResonantDb!.toFixed(2)}`,
      ).toBeLessThanOrEqual(TOL_DB);
    }
  });

  it('the number came from the coil rule, and the manifest can still show its work', () => {
    /* The requirement is a STATED one, so nothing here re-derives it. What can
     * be checked is that the derivation it records still reproduces: the class-A
     * inversion at the recorded path resistance lands on the recorded ceiling,
     * and that ceiling is the designer's coil rule for this pair rather than a
     * number picked to fit the field. */
    const p = (golden as unknown as {
      grens_inversies: { parameters: { maxL_bult: { budget_dB: number; decompositie: { som_bij_de_grens_dB: number; lift_bij_L0_dB: number } } } };
    }).grens_inversies.parameters.maxL_bult;
    expect(p.budget_dB).toBe(BUDGET_DB);
    // The recorded sum at the bound is the two halves added — the bridge back
    // to every extraDb reference in this file.
    expect(p.decompositie.som_bij_de_grens_dB).toBeCloseTo(
      p.decompositie.lift_bij_L0_dB + p.budget_dB,
      3,
    );
  });
});

/* ================================================================== *
 * V43 — de LF-bult ontleed, op élke bevroren netlist
 * ================================================================== */

describe('V43 — the lift splits into a resistive and a resonant half', () => {
  const TOL_DB = (golden as unknown as { toleranties: { dB: number } }).toleranties.dB;

  /** What the recorder wrote, over the WHOLE case book — see `v43_ontleding`. */
  const RECORD = (golden.manifest_en_geometrie as unknown as {
    v43_ontleding?: {
      metriek_versie: string;
      transform_versie: string;
      per_netlist: {
        netlist: string;
        weg: string | null;
        extra_dB: number | null;
        lift_dB: number | null;
        opslingering_dB: number | null;
      }[];
    };
  }).v43_ontleding;

  it('every frozen netlist carries both halves, and they ADD UP to the lift', () => {
    /* THE DECOMPOSITION ASSERT, and it is what makes every standing
     * `lf_bult_extra_dB` reference the bridge to the two new ones. The three
     * maxima are taken over one band in one pass, so this cannot drift by a
     * rounding error — it can only break if the split stops being a split. */
    for (const f of FIELD) {
      expect(f.lfBumpDb, `${f.key}: M-D produced no lift figure`).not.toBeNull();
      expect(
        f.lfLiftDb,
        `${f.key}: no resistive half — the resistive equivalent of this netlist carries nothing`,
      ).not.toBeNull();
      expect(f.lfResonantDb, `${f.key}: no resonant half`).not.toBeNull();
      expect(
        f.lfLiftDb! + f.lfResonantDb! - f.lfBumpDb!,
        `${f.key}: ${f.lfLiftDb} + ${f.lfResonantDb} does not reproduce ${f.lfBumpDb}`,
      ).toBeCloseTo(0, 9);
    }
  });

  it('the two halves are DIFFERENT quantities, and the corpus proves it', () => {
    /* Without this the assert above is equally true of a "split" that puts
     * everything in one half and zero in the other (V23). On this case book
     * both halves carry the whole lift somewhere, and on at least one netlist
     * they have OPPOSITE signs — which no single quantity under two names can
     * do. */
    const liftLed = FIELD.filter((f) => f.lfLiftDb! > f.lfResonantDb!);
    const resonantLed = FIELD.filter((f) => f.lfResonantDb! > f.lfLiftDb!);
    expect(liftLed.length, 'no netlist is dominated by its resistive half').toBeGreaterThan(0);
    expect(resonantLed.length, 'no netlist is dominated by its resonant half').toBeGreaterThan(0);
    const opposed = FIELD.filter((f) => f.lfLiftDb! > 0 && f.lfResonantDb! < 0);
    expect(
      opposed.length,
      'nowhere in the case book do the two halves point in opposite directions — then they ' +
        'are not two mechanisms, and the split describes nothing',
    ).toBeGreaterThan(0);
  });

  it('the recorded decomposition still matches a fresh measurement, per netlist', () => {
    /* Same shape as the V42 finding assert, and the same reason: a recorded
     * table that nothing re-measures becomes false in silence. Per netlist, so
     * a corpus that changed shape cannot average its way to agreement. */
    expect(RECORD, 'the case book records no V43 decomposition').toBeTruthy();
    expect(RECORD!.metriek_versie).toBe(LF_BUMP_VERSION);
    expect(RECORD!.transform_versie).toBe(RESISTIVE_EQUIVALENT_VERSION);
    expect(RECORD!.per_netlist.map((r) => r.netlist).sort()).toEqual([...NETLIST_KEYS].sort());
    for (const row of RECORD!.per_netlist) {
      const f = FIELD.find((x) => x.key === row.netlist)!;
      expect(row.weg).toBe(f.lfWay);
      for (const [label, recorded, measured] of [
        ['extra', row.extra_dB, f.lfBumpDb],
        ['lift', row.lift_dB, f.lfLiftDb],
        ['opslingering', row.opslingering_dB, f.lfResonantDb],
      ] as const) {
        expect(recorded, `${row.netlist}: no recorded ${label}`).not.toBeNull();
        expect(
          Math.abs(measured! - recorded!),
          `${row.netlist}: the record says ${recorded} dB for ${label} and the metric reads ` +
            `${measured!.toFixed(3)}`,
        ).toBeLessThanOrEqual(TOL_DB);
      }
    }
  });

  it("what the stated budget condemns on the designer's own filters is the RESISTIVE half", () => {
    /* THE FINDING OF V43, as a claim that can fail. The stated budget is on
     * `extraDb`, and V42 recorded that all three reference filters exceed it.
     * Split, the picture inverts: their coils add nothing at all — the resonant
     * half is at or below zero on all three — and the whole transgression is
     * level work in the series resistance. That is the anchor decision's
     * business (A5e.2) and not the coil rule's, and it is why the requirement
     * is being reformulated rather than relaxed. */
    const withdrawn = (golden.manifest_en_geometrie as unknown as {
      v42_bult_bevinding?: { gesteld_budget_dB: number };
    }).v42_bult_bevinding!.gesteld_budget_dB;
    for (const key of V1_BASELINES) {
      const f = FIELD.find((x) => x.key === key)!;
      expect(
        f.lfBumpDb!,
        `${key} no longer exceeds the WITHDRAWN budget on the SUM — then V42's finding has moved`,
      ).toBeGreaterThan(withdrawn);
      expect(
        f.lfResonantDb!,
        `${key}: the resonant half is ${f.lfResonantDb!.toFixed(2)} dB, which is no longer at or ` +
          'below zero — then the transgression is no longer purely resistive and the V43 ' +
          'reformulation rests on something that has changed',
      ).toBeLessThanOrEqual(0);
    }
  });
});

/* ------------------------------------------------------------------ *
 * V44 — M-K op het echte corpus, met beide vervangen maten ernaast
 * ------------------------------------------------------------------ */

describe('V44 — welke punten een fase-oordeel dragen, over het hele casusboek', () => {
  /** Wat de recorder schreef — zie `v44_fasematen`, dezelfde vorm als V43. */
  const RECORD = (golden.manifest_en_geometrie as unknown as {
    v44_fasematen?: {
      metriek_versie: string;
      toelating_versie: string;
      per_netlist: {
        netlist: string;
        paar: string;
        mk_graden: number | null;
        punten: number;
        octaafgeknipt_graden: number | null;
        overlapvenster_graden: number | null;
      }[];
    };
  }).v44_fasematen;

  it('elke bevroren netlist levert M-K, en zij staat binnen de meetgeldigheid', () => {
    /* DE PREMISSE, en zij is wat de rest draagt. Grond (a) is op deze casus
     * gewapend voor élke netlist — de meetbestanden geven hun venster in de
     * KOP op — dus de band waarop M-K gelezen wordt kan de geldigheidsvloer
     * niet onderschrijden. Zou dat ooit wél zo zijn, dan leest de maat weer
     * data die de meting zelf niet draagt, en dat is precies wat V44 sloot. */
    let judged = 0;
    for (const f of FIELD) {
      for (const p of f.phase) {
        judged++;
        expect(p.n, `${f.key} ${p.pair}: no admitted point at all`).toBeGreaterThan(0);
        expect(p.grounds.validity, `${f.key} ${p.pair}: validity ground not armed`).toBe(true);
        expect(p.grounds.level).toBe(true);
        expect(Number.isFinite(p.mk)).toBe(true);
        expect(p.bandHz[1]).toBeGreaterThan(p.bandHz[0]);
      }
    }
    // A scan over an empty field is green for the wrong reason.
    expect(judged).toBeGreaterThan(NETLIST_KEYS.length);
  });

  it('de dekking zegt hoeveel van het OVERNAMEGEBIED de meetgeldigheid overliet', () => {
    /* De transpositie van V15's dekkingsgetal op de band die V44 ervoor in de
     * plaats zette. Zij hoort niet altijd 100 te zijn — dan zou zij niets
     * zeggen — en zij hoort ook niet altijd onder de 100 te liggen, want dan
     * zou zij een constante zijn. Op deze meetset is precies één handover
     * afgeknepen, en dat is de laagste: zijn overnamegebied reikt onder de
     * 397 Hz-vloer die de meetbestanden opgeven. */
    const full: string[] = [];
    const clipped: string[] = [];
    for (const f of FIELD) {
      for (const p of f.phase) {
        const rep = report(f.key).system.phaseTracking.find(
          (x) => `${x.lower}|${x.upper}` === p.pair,
        )!;
        expect(rep.coverage.fraction).toBeGreaterThan(0);
        expect(rep.coverage.fraction).toBeLessThanOrEqual(1);
        (rep.coverage.fraction >= 1 ? full : clipped).push(`${f.key} ${p.pair}`);
      }
    }
    expect(full.length, 'no handover anywhere is fully covered').toBeGreaterThan(0);
    expect(clipped.length, 'no handover anywhere is clipped — then coverage says nothing')
      .toBeGreaterThan(0);
  });

  it('de toegelaten verzameling is een DEELVERZAMELING van het overlapvenster, en ergens strikt', () => {
    /* Ground (c) IS the overlap test, so M-K can never admit a point the
     * historic tuner set refused: `n` may only shrink. And it must shrink
     * SOMEWHERE, or the two are the same set under two names and the whole
     * change is a rename (V23). */
    let strict = 0;
    for (const f of FIELD) {
      for (const p of f.phase) {
        if (p.overlapWindow === null) continue;
        expect(
          p.rejected.validity + p.rejected.silence,
          `${f.key} ${p.pair}: nothing was refused on validity or silence`,
        ).toBeGreaterThanOrEqual(0);
        if (p.rejected.validity > 0 || p.rejected.silence > 0) strict++;
      }
    }
    expect(strict, 'no handover anywhere refuses a point on validity or silence').toBeGreaterThan(0);
  });

  it('de drie maten zijn drie GROOTHEDEN — zij lopen op het corpus beide kanten op uiteen', () => {
    /* De tegenproef die de controlekolommen iets waard maakt. Eén getal onder
     * drie namen zou elke assert hierboven halen; drie grootheden doen dat niet
     * op dezelfde manier. Er moeten netlists zijn waar het octaafvenster HOGER
     * leest dan M-K en netlists waar het LAGER leest, en hetzelfde voor het
     * kale overlapvenster — anders is het verschil een systematische offset en
     * geen andere vraag. */
    let octHigher = 0;
    let octLower = 0;
    let ovlHigher = 0;
    let ovlLower = 0;
    let opposite = 0;
    for (const f of FIELD) {
      for (const p of f.phase) {
        if (p.octaveClipped === null || p.overlapWindow === null) continue;
        if (p.octaveClipped > p.mk) octHigher++;
        if (p.octaveClipped < p.mk) octLower++;
        if (p.overlapWindow > p.mk) ovlHigher++;
        if (p.overlapWindow < p.mk) ovlLower++;
        if ((p.octaveClipped - p.mk) * (p.overlapWindow - p.mk) < 0) opposite++;
      }
    }
    expect(octHigher).toBeGreaterThan(0);
    expect(octLower).toBeGreaterThan(0);
    expect(ovlHigher).toBeGreaterThan(0);
    expect(ovlLower).toBeGreaterThan(0);
    /* En de scherpste: handovers waar de twee oude maten aan WEERSZIJDEN van
     * M-K vallen. Dat kan geen enkele monotone herschaling van één getal. */
    expect(opposite, 'the two control columns never straddle M-K').toBeGreaterThan(0);
  });

  it('de bevinding van V40 staat nog: de twee oude maten zijn het aantoonbaar oneens', () => {
    /* V40's meting, als claim die kan falen. De twee vervangen maten lopen op
     * dit corpus tot tientallen graden uiteen over ÉÉN netwerk, en dat is de
     * reden dat er een derde maat is. Wordt dit ooit klein, dan is er iets aan
     * een van beide veranderd zonder dat iemand het besloot — en dat is precies
     * wat deze kolommen moeten laten zien. */
    let worst = 0;
    let worstAt = '';
    for (const f of FIELD) {
      for (const p of f.phase) {
        if (p.octaveClipped === null || p.overlapWindow === null) continue;
        const gap = Math.abs(p.octaveClipped - p.overlapWindow);
        if (gap > worst) {
          worst = gap;
          worstAt = `${f.key} ${p.pair}`;
        }
      }
    }
    expect(worst, `the widest disagreement is only ${worst.toFixed(2)} deg at ${worstAt}`)
      .toBeGreaterThan(10);
  });

  it('de opgeschreven ontleding klopt nog met een verse meting, per netlist', () => {
    /* Dezelfde vorm en dezelfde reden als V43's: een blok dat de recorder
     * schrijft en dat niemand herrekent, veroudert stil. Per netlist en per
     * paar, niet als gemiddelde. */
    expect(RECORD, 'the case book records no V44 phase decomposition').toBeTruthy();
    expect(RECORD!.metriek_versie).toBe(PHASE_INTEGRATION_VERSION);
    expect(RECORD!.toelating_versie).toBe(PHASE_ADMISSION_VERSION);
    const rows = RECORD!.per_netlist;
    expect(rows.length).toBeGreaterThan(0);
    let checked = 0;
    for (const row of rows) {
      const f = FIELD.find((x) => x.key === row.netlist);
      expect(f, `${row.netlist} is recorded but not in the manifest`).toBeTruthy();
      const p = f!.phase.find((x) => x.pair === row.paar);
      expect(p, `${row.netlist} ${row.paar} is recorded but not measured`).toBeTruthy();
      expect(p!.mk).toBeCloseTo(row.mk_graden!, 1);
      expect(p!.n).toBe(row.punten);
      expect(p!.octaveClipped!).toBeCloseTo(row.octaafgeknipt_graden!, 1);
      expect(p!.overlapWindow!).toBeCloseTo(row.overlapvenster_graden!, 1);
      checked++;
    }
    // A shrunken record must fail rather than pass on the rows it still has.
    const measured = FIELD.reduce((a, f) => a + f.phase.length, 0);
    expect(checked).toBe(measured);
  });
});

/* ================================================================== *
 * V45 (A5e.2) — de gestelde Q_es-grens, en het niveau-anker na baffle step
 * ================================================================== */

describe('V45 — the stated Q_es ceiling, on every frozen netlist', () => {
  const CEILING = casus1QesMultiplierMax(golden);
  const TOL_OHM = (golden as unknown as { toleranties: { ohm: number } }).toleranties.ohm;

  const RECORD = (golden.manifest_en_geometrie as unknown as {
    v45_qes?: {
      gestelde_grens: number | null;
      per_netlist: {
        netlist: string;
        weg: string;
        R_e_ohm: number | null;
        R_s_ohm: number | null;
        padweerstand_ohm: number | null;
        q_M_E: number | null;
        q_padweerstand: number | null;
        plafond_ohm: number | null;
        haalt_de_eis: boolean | null;
      }[];
    };
  }).v45_qes;

  /** The DC series resistance of one way, off the FILE — what the inversion
   *  bounds, and what `searchBoxFor` sums. No report needed. */
  const pathROhm = (key: string, driver: string): number => {
    const bus = busTopology(casus1Parts(key));
    let total = 0;
    for (const p of casus1Parts(key)) {
      if (p.partId === undefined || p.open || p.shorted) continue;
      if (!bus.driversOf(p.partId).includes(driver)) continue;
      if (p.type === 'Resistor') total += p.params.find((q) => q.name === 'R')?.value ?? 0;
      if (p.type === 'Inductor') total += p.params.find((q) => q.name === 'DCR')?.value ?? 0;
    }
    return total;
  };

  it('the ceiling is stated, and every netlist carries an M-E reading to judge', () => {
    expect(CEILING, 'casus 1 states no Q_es ceiling — V45 assumes it does').not.toBeNull();
    expect(CEILING!).toBeGreaterThan(1);
    for (const f of FIELD) {
      expect(f.lowestWay, `${f.key}: no lowest way`).not.toBeNull();
      expect(f.lowestRsOhm, `${f.key}: M-E produced no source resistance`).not.toBeNull();
    }
  });

  it('it is REACHABLE, and the designer\'s own filter is the proof', () => {
    /* THE SAME PAIR OF FACTS the amplifier floor and the LF budget each carry.
     * HUIDIG is the approved design and it has to fit, or the requirement rules
     * out the loudspeaker it was written for — the V42 mistake, which cost a
     * whole session to undo. */
    const huidig = RECORD!.per_netlist.find((r) => r.netlist === 'HUIDIG')!;
    expect(huidig.haalt_de_eis).toBe(true);
    expect(huidig.padweerstand_ohm!).toBeLessThanOrEqual(huidig.plafond_ohm!);
  });

  it('it is NOT VACUOUS: netlists in the casebook exceed it', () => {
    /* A requirement nothing can fail is a requirement that describes rather
     * than binds. The failures are named so a reader can check them by hand
     * instead of trusting a count. */
    const over = RECORD!.per_netlist.filter((r) => r.haalt_de_eis === false);
    expect(over.length).toBeGreaterThan(0);
    // The resistance flight V43 measured is exactly what it cuts: the netlists
    // that exceed it are the ones carrying the biggest pads.
    const worst = Math.max(...RECORD!.per_netlist.map((r) => r.padweerstand_ohm ?? 0));
    expect(over.some((r) => r.padweerstand_ohm === worst)).toBe(true);
  });

  it('the recorded block reproduces from a fresh measurement, per netlist', () => {
    /* Same discipline as `v36_dissipatie`, `v43_ontleding` and
     * `v44_fasematen`: the derived block is re-measured rather than trusted, so
     * a later corpus cannot make the entry quietly untrue. */
    expect(RECORD, 'the recorder wrote no v45_qes block').toBeDefined();
    expect(RECORD!.gestelde_grens).toBe(CEILING);
    expect(RECORD!.per_netlist.length).toBe(FIELD.length);
    for (const row of RECORD!.per_netlist) {
      const f = FIELD.find((x) => x.key === row.netlist);
      expect(f, `${row.netlist} is recorded but not in the field`).toBeDefined();
      expect(row.weg).toBe(f!.lowestWay);
      // R_s comes from M-E and does not depend on which R_e the pass resolved,
      // so it is comparable across the two settings the two passes used.
      expect(
        Math.abs(row.R_s_ohm! - f!.lowestRsOhm!),
        `${row.netlist}: recorded R_s ${row.R_s_ohm} against a fresh ${f!.lowestRsOhm}`,
      ).toBeLessThanOrEqual(TOL_OHM);
      expect(
        Math.abs(row.padweerstand_ohm! - pathROhm(row.netlist, row.weg)),
        `${row.netlist}: recorded path resistance`,
      ).toBeLessThanOrEqual(TOL_OHM);
      /* THE R_e THE RECORD DIVIDED BY IS THE CASEBOOK'S METER READING, not a
       * fit — V16's two readings of one quantity, and a q without its R_e is
       * not a number. The v2 route enters the same value, so the ceiling this
       * block reports IS the ceiling those runs searched under. */
      expect(row.R_e_ohm).toBeCloseTo(CASUS1_WOOFER_DC_OHM, 6);
      expect(row.q_M_E!).toBeCloseTo(1 + row.R_s_ohm! / row.R_e_ohm!, 1);
      expect(row.plafond_ohm!).toBeCloseTo(row.R_e_ohm! * (CEILING! - 1), 1);
      expect(row.haalt_de_eis).toBe(row.padweerstand_ohm! <= row.plafond_ohm!);
    }
  });

  it('the two q columns are two quantities, and the inversion binds the second', () => {
    /* Not pedantry: `q_M_E` is what the metric reports (Thevenin R_s at f_p,
     * which carries the network's reactance) and `q_padweerstand` is what the
     * A5d.6 inversion can actually bound (DC series resistance, the only thing
     * a search box holds). They differ on real netlists, and a reader who took
     * one for the other would mis-read every margin in this block. */
    const rows = RECORD!.per_netlist.filter(
      (r) => r.q_M_E !== null && r.q_padweerstand !== null,
    );
    expect(rows.length).toBeGreaterThan(0);
    /* THEY SEPARATE IN BOTH DIRECTIONS, and that is the strongest form the
     * claim can take: no monotone rescaling of one gives the other, so they are
     * two quantities and not one under two names (V23).
     *
     * The two directions have two different mechanisms and both are real.
     * · M-E HIGHER — reactance in the way's own path adds to what its DC
     *   resistance presents at f_p. HUIDIG is the clean case (+0.08).
     * · M-E LOWER — a SHUNT across the driver lowers the source impedance it
     *   actually sees, below the DC series resistance in the path. On
     *   `V43_KAND_1` that is 2.17 Ω against 4.46 Ω of path resistance: q reads
     *   1.71 where the inversion bounds 2.46.
     *
     * THE SECOND CASE IS A LIMITATION OF THE REQUIREMENT AS ENFORCED, not a
     * bug in this test, and it is written down rather than smoothed over: on a
     * netlist with a shunt the inversion is STRICTER than the metric it comes
     * from, so it can refuse a design M-E would pass. It errs towards caution,
     * which is the safe direction — but only measurement can say that, so it is
     * measured here and recorded as an open point in the casebook. */
    const gap = rows.map((r) => r.q_M_E! - r.q_padweerstand!);
    expect(Math.max(...gap)).toBeGreaterThan(0.05);
    expect(Math.min(...gap)).toBeLessThan(-0.05);
    // Both named, so each direction is checkable against one row by hand
    // instead of trusted as an aggregate.
    const huidig = rows.find((r) => r.netlist === 'HUIDIG')!;
    expect(huidig.q_M_E!).toBeGreaterThan(huidig.q_padweerstand!);
    const shunted = rows.find((r) => r.netlist === 'V43_KAND_1')!;
    expect(shunted.q_M_E!).toBeLessThan(shunted.q_padweerstand!);
    expect(shunted.R_s_ohm!).toBeLessThan(shunted.padweerstand_ohm!);
  });
});

describe('V45 — the delivered network is tested against the stated LF budget', () => {
  const BUDGET_DB = casus1LfResonantBudgetDb(golden)!;
  const TOL_DB_V45 = (golden as unknown as { toleranties: { dB: number } }).toleranties.dB;
  const factsAll = casus1V2Facts(report('HUIDIG'), manifest, files);
  /** The grid and impedances every electrical verdict is taken on (V32). */
  const REF = impedanceReferenceFrom(
    Object.fromEntries(
      Object.entries(factsAll.impedanceByModel ?? {}).map(([m, z]) => [
        m,
        { grid: z.grid, magnitude: z.magnitude, phaseDeg: z.phaseDeg, validHz: z.validHz },
      ]),
    ),
  )!;
  const checked = (key: string, model: string): number | null =>
    deliveredResonantDb(casus1Parts(key), model, {
      nearField: factsAll.nearFieldByModel![model],
      fPeakHz: factsAll.fundamentalHzByModel![model],
      impedance: { grid: REF.grid, driverZ: REF.driverZ },
    });

  it('the check reads the SAME number the panel reads — one implementation, two readers', () => {
    /* THE CLAIM THE WHOLE MECHANISM RESTS ON. The worker withdraws a delivered
     * network on this number, and the panel prints M-D beside it; if the two
     * could disagree, a design would read acceptable in one place and be
     * refused in the other — the exact split V32 found in the gates and V45
     * must not reintroduce one metric later. They agree by construction (same
     * `lfBump`, same grid, same measured impedances) and this asserts it on
     * every frozen netlist rather than on the one that was tried by hand. */
    let compared = 0;
    for (const f of FIELD) {
      if (f.lfResonantDb === null || f.lfWay === null) continue;
      const got = checked(f.key, f.lfWay);
      expect(got, `${f.key}: the delivered-network check produced nothing`).not.toBeNull();
      expect(
        Math.abs(got! - f.lfResonantDb),
        `${f.key}: the check reads ${got} where M-D reads ${f.lfResonantDb}`,
      ).toBeLessThanOrEqual(TOL_DB_V45);
      compared++;
    }
    // A loop over an empty list passes silently, which is how a guard rots.
    expect(compared).toBe(FIELD.filter((f) => f.lfResonantDb !== null).length);
    expect(compared).toBeGreaterThan(0);
  });

  it('it CAN refuse: the casebook holds networks that exceed the stated budget', () => {
    /* The counter-proof. A check that no netlist in the casebook could ever
     * fail is a check nobody can tell from a no-op, so the dated corpora are
     * asked whether they contain one — and they do, which is precisely what
     * they were frozen for. */
    const over = FIELD.filter((f) => f.lfResonantDb !== null && f.lfResonantDb > BUDGET_DB);
    expect(over.length, 'no frozen netlist exceeds the budget — the check is untestable').toBeGreaterThan(0);
    for (const f of over) expect(checked(f.key, f.lfWay!)!).toBeGreaterThan(BUDGET_DB);
  });

  it('and it does NOT refuse the live corpus — which is the measurement, not an absence', () => {
    /* The other half, and it is a RESULT rather than a passing test: the search
     * box already keeps the live corpus under the budget, so the delivered
     * check never fires there. That is what says the stale ceiling costs
     * nothing on this casus today (V45, open point) — and the moment it stops
     * being true, this assertion is where it shows. */
    const live = FIELD.filter((f) => /^KAND_V2_\d+$/.test(f.key));
    expect(live.length).toBeGreaterThan(0);
    for (const f of live) {
      expect(f.lfResonantDb, `${f.key}: no resonant figure`).not.toBeNull();
      expect(
        f.lfResonantDb!,
        `${f.key} exceeds the stated budget on the DELIVERED network — the A5d.6 ceiling was ` +
          'solved at the seed\'s path resistance and no longer describes what was built',
      ).toBeLessThanOrEqual(BUDGET_DB);
    }
  });
});

describe('V47 — the stated drive limit on a driver\'s own resonance', () => {
  const CEILING_DB = STATED_DRIVE_MAX_DB;
  /* V50 — the ways that carry a STATED figure, by name, and the figure. On
   * casus 1 that is the tweeter at the −20 dB convention; the mid carries
   * none and is the V50 block's business. */
  const STATED_WAYS = Object.keys(STATED_DRIVE_BY_WAY);
  const statedOf = (driver: string): number | undefined => STATED_DRIVE_BY_WAY[driver];
  const TOL_DB_V47 = (golden as unknown as { toleranties: { dB: number } }).toleranties.dB;

  const RECORD = (golden.manifest_en_geometrie as unknown as {
    v47_bescherming?: {
      gestelde_grens_dB: number | null;
      per_weg: {
        netlist: string;
        weg: string;
        f_s_hz: number | null;
        doorlaatband_hz: string | null;
        M_C_dB: number | null;
        haalt_de_eis: boolean | null;
      }[];
    };
  }).v47_bescherming;

  /** Every M-C verdict on the whole casebook — one row per protected way. */
  const DRIVE = FIELD.flatMap((f) =>
    f.verdicts
      .filter((v) => v.gate === 'M-C' && v.value !== null)
      .map((v) => ({ key: f.key, driver: v.subject, db: v.value as number, limit: v.limit })),
  );

  it('the limit comes from the case book, not from this file', () => {
    expect(CEILING_DB, 'casus 1 no longer states a drive limit').not.toBeNull();
    const stated = (golden.manifest_en_geometrie as unknown as {
      gestelde_eisen: {
        tweeter_drive_op_fs_max_dB: number;
        tweeter_drive_op_fs_max_motivering: string;
        drive_op_fs_max_dB_per_weg: Record<string, number | null>;
        drive_op_fs_max_per_weg_motivering: string;
      };
    }).gestelde_eisen;
    expect(CEILING_DB).toBe(stated.tweeter_drive_op_fs_max_dB);
    // A stated number without its reason is V15 one layer up.
    expect(stated.tweeter_drive_op_fs_max_motivering.length).toBeGreaterThan(40);
    /* V50 — and the per-way block: the tweeter carries THAT figure, the mid
     * is listed with `null` — deliberately without one — and the reason is
     * written down. A way absent from the map is a way with no stated half. */
    expect(STATED_WAYS.length).toBeGreaterThan(0);
    expect(stated.drive_op_fs_max_dB_per_weg.tweeter).toBe(CEILING_DB);
    expect(stated.drive_op_fs_max_dB_per_weg.mid).toBeNull();
    expect(STATED_DRIVE_BY_WAY.mid).toBeUndefined();
    expect(stated.drive_op_fs_max_per_weg_motivering.length).toBeGreaterThan(80);
  });

  it('M-C is ARMED on every protected way of every frozen netlist', () => {
    expect(DRIVE.length).toBeGreaterThan(0);
    /* SINCE V49 THE LIMIT ON A VERDICT IS THE STRICTER OF THE STATED FIGURE AND
     * THE EXCURSION-DERIVED CEILING, so what this block pins is that the stated
     * figure REACHED every verdict (`stated_limit_dB`) and that the limit
     * judged is never looser than it. Which of the two bit, per way, is the
     * V49 block's claim. */
    const stated = FIELD.flatMap((f) =>
      f.verdicts
        .filter((v) => v.gate === 'M-C' && v.value !== null)
        .map((v) => ({ key: f.key, driver: v.subject, stated: v.parameters?.stated_limit_dB })),
    );
    /* V50 — PER WAY: the stated figure reaches every verdict of a way that
     * HAS one, and no verdict of a way that has none. */
    for (const d of stated) {
      const want = statedOf(d.driver);
      if (want !== undefined) {
        expect(d.stated, `${d.key}/${d.driver}: the stated limit did not reach the gate`).toBe(want);
      } else {
        expect(d.stated, `${d.key}/${d.driver}: a stated figure reached a way that states none`).toBeUndefined();
      }
    }
    for (const d of DRIVE) {
      expect(d.limit, `${d.key}/${d.driver}: no limit on the verdict`).not.toBeNull();
      const want = statedOf(d.driver);
      if (want !== undefined) expect(d.limit!).toBeLessThanOrEqual(want);
    }
    // Every way the casus states a figure for is judged somewhere in the field.
    for (const w of STATED_WAYS) expect(DRIVE.some((d) => d.driver === w), `${w}: stated but never judged`).toBe(true);
    /* And it really is per WAY rather than per netlist: on this casus the mid
     * is high-pass protected as well, so the requirement — derived from a
     * tweeter measurement — judges a second driver. A block that only looked at
     * the tweeter would hide that. */
    expect(new Set(DRIVE.map((d) => d.driver)).size).toBeGreaterThan(1);
  });

  it("it is REACHABLE, and the designer's own filter is the proof", () => {
    /* THE SAME PAIR OF FACTS the amplifier floor, the LF budget and the Q_es
     * ceiling each carry, and the V42 mistake is why it comes first: HUIDIG is
     * the approved design and the requirement is derived FROM it, so if it
     * failed here the number would have been mis-rounded. */
    for (const key of V1_BASELINES) {
      const rows = DRIVE.filter((d) => d.key === key);
      expect(rows.length, `${key} has no M-C verdict at all`).toBeGreaterThan(0);
      for (const d of rows) {
        // V50 — each way against ITS limit (stated where stated, derived elsewhere).
        expect(d.db, `${key}/${d.driver} exceeds its limit`).toBeLessThanOrEqual(d.limit!);
      }
    }
    /* HUIDIG IS NO LONGER THE MEASURE (V47b). Until V47b the limit was HUIDIG's
     * own reading rounded to one decimal, and this block asserted that one
     * tenth stricter would condemn it — which is exactly what made the
     * requirement brittle: a re-measurement of the reference filter after
     * break-in that moved f_s or the passband level by a tenth of a dB would
     * have condemned the design the requirement was derived from. Since V47b
     * the number is a RULE (18 dB below passband on f_s, plus 2 dB for f_s
     * drift; provisional until M-C is excursion-based, V49) and HUIDIG merely
     * proves the rule excludes no buildable design. So the assertion is the
     * inverse of the old one: HUIDIG clears the limit by MORE than a rounding
     * step. If it ever sits within a dB of it, either the number has quietly
     * become HUIDIG's again (the V47 form) or HUIDIG has drifted onto the
     * rule, and both are findings rather than green. */
    /* V50 — on the ways that carry the stated figure (the tweeter). */
    const huidig = Math.max(
      ...DRIVE.filter((d) => d.key === 'HUIDIG' && statedOf(d.driver) !== undefined).map((d) => d.db),
    );
    expect(huidig).toBeLessThanOrEqual(CEILING_DB!);
    expect(
      CEILING_DB! - huidig,
      'HUIDIG sits within a dB of the stated limit — the limit reads as its rounded value again',
    ).toBeGreaterThan(1);
  });

  it('it is NOT VACUOUS: netlists in the casebook exceed it', () => {
    /* A requirement nothing can fail describes rather than binds. The dated
     * corpora were frozen before it existed and are exactly where the evidence
     * lives — the same role they play for the floor and the LF budget. */
    const over = DRIVE.filter((d) => statedOf(d.driver) !== undefined && d.db > statedOf(d.driver)!);
    expect(over.length, 'no frozen netlist exceeds the limit — it is untestable').toBeGreaterThan(0);
  });

  it('the recorded block reproduces from a fresh measurement, per way', () => {
    /* Same discipline as `v36_dissipatie`, `v43_ontleding`, `v44_fasematen` and
     * `v45_qes`: the derived block is re-measured rather than trusted. */
    expect(RECORD, 'the recorder wrote no v47_bescherming block').toBeDefined();
    expect(RECORD!.gestelde_grens_dB).toBe(CEILING_DB);
    expect(RECORD!.per_weg.length).toBe(DRIVE.length);
    for (const row of RECORD!.per_weg) {
      const d = DRIVE.find((x) => x.key === row.netlist && x.driver === row.weg);
      expect(d, `${row.netlist}/${row.weg} is recorded but not in the field`).toBeDefined();
      expect(
        Math.abs(row.M_C_dB! - d!.db),
        `${row.netlist}/${row.weg}: recorded ${row.M_C_dB} against a fresh ${d!.db}`,
      ).toBeLessThanOrEqual(TOL_DB_V47);
      // V50 — judged against the way's OWN limit (the recorder reads the verdict).
      expect(row.haalt_de_eis).toBe(d!.db <= d!.limit!);
      // A band without its parameters is not a measurement (V15).
      expect(row.doorlaatband_hz, `${row.netlist}/${row.weg}: no passband recorded`).toBeTruthy();
    }
  });

  it('the two netlists it condemns are NAMED in the dated block — bookkeeping, not a waiver', () => {
    /* THE V30 FLAG PATTERN, on this requirement instead of on the floor. These
     * two were DELIVERED by a v2 run and they miss the requirement by ten dB;
     * a corpus that carries such a thing has to say so with name, value and
     * limit. Read from the case book rather than listed here, so the test
     * cannot drift from the record a human reads — and asserted against a FRESH
     * measurement, so the entry cannot quietly become untrue. */
    const flagged = (golden.manifest_en_geometrie as unknown as {
      v45_corpus?: {
        aandrijfuitzonderingen?: { netlist: string; M_C_dB: number; gestelde_grens_dB: number }[];
      };
    }).v45_corpus?.aandrijfuitzonderingen ?? [];
    expect(flagged.length, 'the dated V45 block names no drive exception').toBeGreaterThan(0);
    for (const f of flagged) {
      expect(f.gestelde_grens_dB).toBe(CEILING_DB);
      /* V50 — the flags are about the TWEETER (the way the convention belongs
       * to); on the mid the stated figure no longer exists. */
      const rows = DRIVE.filter((d) => d.key === f.netlist && statedOf(d.driver) !== undefined);
      expect(rows.length, `${f.netlist} is flagged but carries no M-C verdict`).toBeGreaterThan(0);
      const worst = Math.max(...rows.map((d) => d.db));
      expect(
        Math.abs(worst - f.M_C_dB),
        `${f.netlist}: recorded ${f.M_C_dB} against a fresh ${worst}`,
      ).toBeLessThanOrEqual(TOL_DB_V47);
      // ...and it really does miss, or the flag is describing something else.
      expect(worst).toBeGreaterThan(CEILING_DB!);
    }
    /* AND EVERY DATED NETLIST THAT MISSES IT IS EITHER FLAGGED OR PREDATES THE
     * CORPUS THAT FLAGS IT. The claim is narrow on purpose: the older corpora
     * were frozen long before this requirement existed and carry no such list,
     * so demanding one there would be a waiver list the size of the casebook —
     * the very thing this project refuses. What must hold is that the corpus
     * this requirement was measured AGAINST accounts for its own failures. */
    const v45Missing = DRIVE.filter(
      (d) => /^V45_KAND_\d+$/.test(d.key) && statedOf(d.driver) !== undefined && d.db > statedOf(d.driver)!,
    );
    for (const d of v45Missing) {
      expect(
        flagged.map((f) => f.netlist),
        `${d.key} misses the requirement and is not named in the dated block`,
      ).toContain(d.key);
    }
  });

  it('the relative rule it replaces never once saw a TWEETER resonance problem', () => {
    /* THE COVERAGE QUESTION, as a measurement rather than an assumption, and it
     * is the reason `protectionDeficit.ts` has a second reader.
     *
     * The seed comparison read `protSqDb`: the mean squared deficit above the
     * protection floor, integrated over the band BELOW `xoF/3`, summed over the
     * pairs. M-C reads one point — the driver's own resonance. Whether the
     * requirement covers what the rule covered is therefore a MEASUREMENT, and
     * this is it.
     *
     * TWO EARLIER VERSIONS OF THIS BLOCK WERE TOO BROAD AND THE DATA KILLED
     * BOTH, which is why the claim below is the narrow one it is. The first
     * said no netlist in the casebook crosses above `3·f_s` (three do). The
     * second said no netlist that MISSES the requirement crosses that high (two
     * do: `V28_KAND_1` at 3818 Hz and `V28_KAND_2` at 3949). What survived both
     * is stronger than either, because it needs no band arithmetic at all: on
     * the TWEETER pair the deficit is zero on every frozen netlist in the book
     * — including those two, whose band does reach the resonance, and including
     * the pair that misses the requirement by ten dB. */
    const tweeterPairs = FIELD.flatMap((f) =>
      f.protectionPairs.filter((p) => p.upper === 'tweeter').map((p) => ({ key: f.key, ...p })),
    );
    expect(tweeterPairs.length, 'no frozen netlist yields a tweeter pair at all').toBeGreaterThan(50);
    for (const p of tweeterPairs) {
      expect(
        p.sqDb,
        `${p.key}: the relative rule reads ${p.sqDb} on the tweeter pair — if that is no longer ` +
          'zero it has started to see something there, and V47\'s finding needs remeasuring',
      ).toBe(0);
    }

    /* AND IT IS NOT INERT EVERYWHERE, which is what makes the line above a
     * finding rather than a broken reader: elsewhere in the casebook it DOES
     * read above zero. Those readings come from a pair whose upper way is not
     * the tweeter — the mid, whose own resonance at 88.8 Hz falls inside every
     * W-M band this field carries. That is what the rule was actually measuring
     * when it refused four candidates with a sentence about the tweeter. */
    const nonZero = FIELD.flatMap((f) =>
      f.protectionPairs.filter((p) => p.sqDb > 0).map((p) => ({ key: f.key, ...p })),
    );
    expect(
      nonZero.length,
      'the relative rule reads zero on EVERY pair of every netlist — then this test cannot tell a ' +
        'blind measure from a broken reader',
    ).toBeGreaterThan(0);
    for (const p of nonZero) expect(p.upper).not.toBe('tweeter');

    /* THE TWO THE REQUIREMENT CONDEMNS ARE INSIDE THE ZERO, spelled out by name
     * so the finding can be checked against one row by hand. */
    for (const key of ['V45_KAND_5', 'V45_KAND_6']) {
      const f = FIELD.find((x) => x.key === key);
      expect(f?.protectionSqDb, `${key} carries no protection reading`).toBe(0);
    }
  });

  it('the LIVE corpus clears it — which is the armed gate, not a coincidence', () => {
    /* The measurement this session was for. The gate judges the DELIVERED
     * network, so every candidate the field shipped had to clear it; a failure
     * here would mean a netlist reached the shortlist that the gate should have
     * refused, which is a defect in the route rather than in the corpus. */
    const live = DRIVE.filter((d) => /^KAND_V2_\d+$/.test(d.key));
    expect(live.length).toBeGreaterThan(0);
    for (const d of live) {
      expect(
        d.db,
        `${d.key}/${d.driver} was delivered above its limit — the gate did not judge it`,
      ).toBeLessThanOrEqual(d.limit!);
    }
  });
});

describe('V49 — M-C v2.0: the excursion-derived ceiling beside the stated figure', () => {
  const EXC = casus1ExcursionSettings(golden);
  /** The −20 dB convention itself, whichever ways state it (V50). */
  const CEILING_DB_V49 = STATED_DRIVE_MAX_DB;
  const RECORD = (golden.manifest_en_geometrie as unknown as {
    v49_excursie?: {
      schatter: string;
      gestelde_grens_dB: number | null;
      per_weg: {
        netlist: string;
        weg: string;
        doorlaatband_gem_dB: number | null;
        afgeleide_grens_dB: number | null;
        effectieve_grens_dB: number | null;
        bron: string;
        M_C_dB: number | null;
        haalt_de_eis: boolean | null;
      }[];
      zwakste_schakel: { netlist: string; weg: string; x_op_f0_mm: number | null; fractie_van_limiet: number | null }[];
    };
  }).v49_excursie;
  const TOL_DB_V49 = (golden as unknown as { toleranties: { dB: number } }).toleranties.dB;
  const CEILING_BY_DRIVER: Record<string, number> = {};
  for (const x of report('HUIDIG').metrics.driveExcursion) CEILING_BY_DRIVER[x.driver] = x.ceiling.ceilingDbReInput;
  /** Every M-C verdict with the halves the derived limit is made of. */
  const DRIVE = FIELD.flatMap((f) =>
    f.verdicts
      .filter((v) => v.gate === 'M-C' && v.value !== null)
      .map((v) => ({
        key: f.key,
        driver: v.subject,
        db: v.value as number,
        limit: v.limit,
        source: String(v.parameters?.limit_source ?? ''),
        derived: v.parameters?.derived_limit_dB as number | undefined,
        stated: v.parameters?.stated_limit_dB as number | undefined,
      })),
  );

  it('the inputs come from the case book and arm the derivation on every high-passed driver', () => {
    expect(EXC.driverCardByDriver, 'casus 1 states no driver cards').toBeDefined();
    expect(EXC.amplifierPeakPowerW).toBeGreaterThan(0);
    expect(EXC.xmaxMarginFraction).toBeGreaterThan(0);
    expect(Object.keys(CEILING_BY_DRIVER).length).toBeGreaterThan(1);
    // ...and the ceiling is a PROPERTY OF THE DRIVER: identical on all three reference filters (class A).
    for (const key of ['KAND_A', 'KAND_B']) {
      for (const x of report(key).metrics.driveExcursion) {
        expect(x.ceiling.ceilingDbReInput).toBeCloseTo(CEILING_BY_DRIVER[x.driver], 9);
      }
    }
  });

  it('every M-C verdict carries BOTH halves and judged on the stricter — on the LIVE corpus and the reference filters that is the stated figure, everywhere', () => {
    expect(DRIVE.length).toBeGreaterThan(0);
    for (const d of DRIVE) {
      expect(d.derived, `${d.key}/${d.driver}: no derived limit on the verdict`).toBeTypeOf('number');
      /* V50 — the stated half exists on the ways that state one and on no
       * other; the limit is the stricter of the two, or the derived one alone. */
      const want = STATED_DRIVE_BY_WAY[d.driver];
      expect(d.stated, `${d.key}/${d.driver}: stated half`).toBe(want);
      // The parameters are rounded to two decimals for a reader; the limit is not.
      expect(d.limit!).toBeCloseTo(want === undefined ? d.derived! : Math.min(want, d.derived!), 2);
    }
    /* THE FINDING OF V49 ON THIS CASUS: on the live corpus and on the three
     * reference filters the excursion-derived limit is LOOSER than the stated
     * −20 on every way, so the stated figure bites and the effective gate did
     * not move — which is why the corpus did not have to be regenerated. If a
     * LIVE netlist ever appears where the derived limit is the stricter one,
     * that is a design whose passband sits so high that the amplifier's peak
     * reaches X_max on f_s, and it is a finding to write up rather than a
     * green to keep. */
    const judgedField = DRIVE.filter((d) => /^KAND_V2_\d+$/.test(d.key) || V1_BASELINES.includes(d.key));
    expect(judgedField.length).toBeGreaterThan(0);
    for (const d of judgedField) {
      if (d.stated === undefined) {
        // V50 — a way with no stated figure: the derived ceiling judges ALONE, and says so.
        expect(d.source).toMatch(/^excursion-derived ceiling \(no stated dB figure/);
        continue;
      }
      expect(d.derived!, `${d.key}/${d.driver}: the derived limit is stricter than the stated one`).toBeGreaterThan(d.stated!);
      expect(d.source).toMatch(/^stated dB figure \(stricter/);
    }
    /* AND OVER THE WHOLE CASEBOOK IT IS NOT VACUOUS: the derived ceiling IS the
     * stricter one somewhere — measured at V49 on seven mids of the V28 corpus,
     * whose passbands sit ABOVE the input (a resonant lift the pre-floor search
     * bought), by 0.05 to 0.6 dB. Named in the recorded block, and the fresh
     * set has to be exactly that set: a ceiling that never bites anywhere
     * would be indistinguishable from one that was never read. */
    /* V50 — "the derived ceiling is the STRICTER one" now means: stricter than
     * a stated figure that EXISTS. A way with no stated half reads the derived
     * ceiling alone, which is not the ceiling biting but the only limit there
     * is; those are counted in the V50 block. */
    /* So the non-vacuity is measured against the CONVENTION (the −20 dB
     * figure) on every way, whether or not that way states it: where the
     * derived ceiling is stricter than −20, a single figure for all ways
     * would have been the looser rule. Seven V28 mids at V49; the recorder
     * writes the same set. */
    const fresh = DRIVE.filter((d) => d.derived! < CEILING_DB_V49!).map((d) => `${d.key}/${d.driver}`).sort();
    expect(fresh.length, 'the derived ceiling bites nowhere in the casebook — untestable').toBeGreaterThan(0);
    const recorded = ((RECORD as unknown as {
      casusboek_wegen_waar_de_afgeleide_grens_strenger_is?: { netlist: string; weg: string }[];
    })?.casusboek_wegen_waar_de_afgeleide_grens_strenger_is ?? []).map((r) => `${r.netlist}/${r.weg}`).sort();
    expect(fresh).toEqual(recorded);
  });

  it('the derived limit sits BELOW the V47b mid refusal: −7.3 dB on the mid was dangerous, not conservative', () => {
    /* The question V47b left open, answered per netlist: on the mid the
     * derived limit lies between roughly −11 and −14.5 dB on this casus, so the
     * candidate V47b refused at −7.3 dB on the mid would have exceeded 0.8·X_max
     * at the amplifier's peak. Asserted as a property of the whole field rather
     * than as one number: every mid limit is stricter than that refusal. */
    const V47B_MID_REFUSAL_DB = -7.3;
    /* On the field V47b judged: the live corpus and the reference filters. Two
     * dated V28 mids sit 23–25 dB BELOW the input (a mid padded to near
     * silence) and read a derived limit above zero — a mid that quiet may take
     * the full peak on f_s — so the claim is about the judged field, not the
     * whole book. */
    const midWay = report('HUIDIG').driversLowToHigh[1];
    const mids = DRIVE.filter((d) => d.driver === midWay && d.derived !== undefined)
      .filter((d) => /^KAND_V2_\d+$/.test(d.key) || V1_BASELINES.includes(d.key));
    expect(mids.length).toBeGreaterThan(0);
    for (const d of mids) expect(d.derived!, `${d.key}/${d.driver}`).toBeLessThan(V47B_MID_REFUSAL_DB);
  });

  it('the recorded block reproduces from a fresh measurement, per way', () => {
    expect(RECORD, 'the recorder wrote no v49_excursie block').toBeDefined();
    expect(RECORD!.schatter).toBe(DRIVE_EXCURSION_VERSION);
    // V50 — the recorded block carries the figure per WAY; the tweeter's is the convention.
    expect(RECORD!.gestelde_grens_dB).toBe(STATED_DRIVE_MAX_DB);
    expect((RECORD as unknown as { gestelde_grens_dB_per_weg?: Record<string, number | null> }).gestelde_grens_dB_per_weg?.tweeter).toBe(STATED_DRIVE_MAX_DB);
    expect(RECORD!.per_weg.length).toBe(DRIVE.length);
    for (const row of RECORD!.per_weg) {
      const d = DRIVE.find((x) => x.key === row.netlist && x.driver === row.weg);
      expect(d, `${row.netlist}/${row.weg} is recorded but not in the field`).toBeDefined();
      expect(Math.abs(row.M_C_dB! - d!.db)).toBeLessThanOrEqual(TOL_DB_V49);
      expect(Math.abs(row.afgeleide_grens_dB! - d!.derived!)).toBeLessThanOrEqual(TOL_DB_V49);
      /* Within the dB class, NOT `toBe`: where the derived ceiling is the
       * limit (the seven V28 mids) it is a float, and linux/Node 22 lands on
       * −20.05402383546058 where darwin/Node 26 records −20.054023835475075
       * (V46's A5e.4 precision rule — CI caught the exact comparison). */
      expect(Math.abs(row.effectieve_grens_dB! - d!.limit!)).toBeLessThanOrEqual(TOL_DB_V49);
      expect(row.haalt_de_eis).toBe(d!.db <= d!.limit!);
    }
    /* And the weakest-link rows: every netlist with an unprotected way carries
     * one, and its reading reproduces — ON THE R_e READING THE RECORD NAMES.
     * Small's Q_ms reads the half-power level at √(Z_max·R_e), so the woofer's
     * x/V moves with which R_e the pass resolved (V16): the recorder uses the
     * entered meter reading of the pair, this file's BASE lets the fit stand,
     * and the two differ by 0.2 mm on f0. The reference says which
     * (`_excursie_parameters.R_e_lezing`), so this reads the same one. */
    for (const row of RECORD!.zwakste_schakel) {
      const w = report(row.netlist, { ...BASE, reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM } })
        .metrics.weakestLink.find((x) => x.driver === row.weg);
      expect(w, `${row.netlist}/${row.weg}: no weakest-link reading`).toBeDefined();
      expect(Math.abs(w!.xAtF0Mm - row.x_op_f0_mm!)).toBeLessThanOrEqual(0.01);
    }
  });

  it('the acoustic route is OFF on this casus with the missing input NAMED — never an assumed voltage', () => {
    for (const x of report('HUIDIG').metrics.driveExcursion) {
      expect('off' in x.acoustic).toBe(true);
      if ('off' in x.acoustic) expect(x.acoustic.off).toMatch(/drive voltage/);
      expect(x.route).toBe('electromechanical');
    }
  });

  it('P2: without the excursion inputs the report is what it was — the stated figure alone judges', () => {
    const { driverCardByDriver: _c, amplifierPeakPowerW: _p, amplifierNominalLoadOhm: _r, xmaxMarginFraction: _m, ...rest } = BASE;
    void _c; void _p; void _r; void _m;
    const bare = report('HUIDIG', rest);
    expect(bare.metrics.driveExcursion).toHaveLength(0);
    expect(bare.metrics.driveExcursionOff.length).toBeGreaterThan(0);
    for (const v of bare.gates.verdicts.filter((x) => x.gate === 'M-C')) {
      /* V50 — the stated figure alone where one is stated; NOTHING where none
       * is, and the gate is then off for that way with the value shown. */
      const want = STATED_DRIVE_BY_WAY[v.subject];
      if (want === undefined) {
        expect(v.active).toBe(false);
        expect(v.reason).toContain('no limit set');
      } else {
        expect(v.limit).toBe(want);
        expect(String(v.parameters?.limit_source)).toMatch(/no excursion-derived ceiling/);
      }
      // The VALUE is untouched: the same number under both settings.
      const withCeiling = report('HUIDIG').gates.verdicts.find((x) => x.gate === 'M-C' && x.subject === v.subject)!;
      expect(withCeiling.value).toBe(v.value);
    }
  });
});

describe('V50 — buildability: the watts in every resistor and the current through every coil', () => {
  const RECORD = (golden.manifest_en_geometrie as unknown as {
    v50_bouwbaarheid?: {
      schatter: string;
      weerstandsklasse_W: number | null;
      weerstandsmarge: number | null;
      toegestaan_W: number | null;
      continu_vermogen_W: number | null;
      spoelklasse_A: number | null;
      V_piek_V: number | null;
      gewapend_op_de_zoektocht: boolean;
      per_netlist: {
        netlist: string;
        heetste_R: string | null;
        heetste_R_ohm: number | null;
        heetste_R_W: number | null;
        toegestaan_W: number | null;
        haalt_de_eis: boolean | null;
        drukste_spoel: string | null;
        drukste_spoel_piek_A: number | null;
        drukste_spoel_bij_hz: number | null;
      }[];
    };
  }).v50_bouwbaarheid;
  const STATED = (golden.manifest_en_geometrie as unknown as {
    gestelde_eisen: {
      weerstandsklasse_W: number;
      weerstandsmarge: number;
      weerstandsklasse_motivering: string;
      weerstandsklasse_sanity_HUIDIG: string;
      spoelklasse_A: number | null;
      spoelklasse_motivering: string;
      versterker_continu_vermogen_W: number;
      bouwbaarheid_op_de_zoektocht: { gewapend: boolean; waarom: string };
    };
  }).gestelde_eisen;
  const TOL_W_PCT = (golden as unknown as { toleranties: { watt_pct: number } }).toleranties.watt_pct;
  const ALLOWED_W = STATED.weerstandsklasse_W * STATED.weerstandsmarge;

  /** Every M-A/part and M-L verdict on the whole casebook, one row per netlist. */
  const ROWS = FIELD.map((f) => ({
    key: f.key,
    r: f.verdicts.find((v) => v.gate === 'M-A/part')!,
    l: f.verdicts.find((v) => v.gate === 'M-L')!,
  }));

  it('the inputs come from the case book, with the reason and the sanity beside them', () => {
    expect(BUILDABILITY.resistorClassW).toBe(STATED.weerstandsklasse_W);
    expect(BUILDABILITY.resistorPowerMargin).toBe(STATED.weerstandsmarge);
    expect(CONTINUOUS_POWER_W).toBe(STATED.versterker_continu_vermogen_W);
    expect(STATED.weerstandsklasse_motivering.length).toBeGreaterThan(80);
    expect(STATED.weerstandsklasse_sanity_HUIDIG).toMatch(/HUIDIG/);
    /* The coil class is EMPTY, and the manifest says why: the C-Coil
     * documentation publishes no saturation current. A stated null with a
     * reason, not a missing field. */
    expect(STATED.spoelklasse_A).toBeNull();
    expect(BUILDABILITY.coilClassA).toBeUndefined();
    expect(STATED.spoelklasse_motivering).toMatch(/verzadigingsstroom/);
    /* And the DECISION whether the requirement arms the SEARCH is recorded
     * with its reason; the run fixture follows it, this file does not. */
    expect(typeof STATED.bouwbaarheid_op_de_zoektocht.gewapend).toBe('boolean');
    expect(STATED.bouwbaarheid_op_de_zoektocht.waarom.length).toBeGreaterThan(80);
  });

  it('every frozen netlist carries both verdicts: M-A/part ARMED at class × margin, M-L OFF with the current shown', () => {
    for (const { key, r, l } of ROWS) {
      expect(r, `${key}: no M-A/part verdict`).toBeDefined();
      expect(l, `${key}: no M-L verdict`).toBeDefined();
      expect(r.active, `${key}: M-A/part is not armed`).toBe(true);
      expect(r.limit).toBe(ALLOWED_W);
      // The value is the watts in the hottest resistor, or null on the one netlist without any.
      if (r.value !== null) expect(r.value).toBeGreaterThan(0);
      else expect(r.reason).toMatch(/no discrete resistor/);
      // M-L: no class stated → off, but a current in amperes at the stated peak (P4's visible half).
      expect(l.active, `${key}: M-L armed without a coil class`).toBe(false);
      expect(l.value, `${key}: M-L reports no current`).toBeGreaterThan(0);
      expect(l.reason).toContain('no limit set');
      expect(String(l.parameters?.rating)).toMatch(/air-cored/);
    }
  });

  it('THE FINDING: at the stated class no reference filter and no live netlist clears M-A/part — HUIDIG by a factor five', () => {
    /* This is the sanity the session was told to take BEFORE regenerating, and
     * it is asserted so the day it stops being true is visible: the woofer
     * pays 4.6–8.5 dB of attenuation to the anchor (V45), and at 100 W
     * continuous that attenuation IS tens of watts in a series resistor. Not
     * a reason to relax the requirement (the number is the physics of a
     * 10 W part at 100 W); a reason for the decision the manifest records. */
    const judged = ROWS.filter((x) => /^KAND_V2_\d+$/.test(x.key) || V1_BASELINES.includes(x.key));
    expect(judged.length).toBeGreaterThan(3);
    for (const { key, r } of judged) {
      expect(r.value, `${key}: no watts`).not.toBeNull();
      expect(r.pass, `${key}: clears ${ALLOWED_W} W — the finding no longer holds, remeasure V50`).toBe(false);
      expect(r.reason).toMatch(/exceeds the stated ceiling/);
      expect(String(r.parameters?.remedy)).toMatch(/generator does not make/);
    }
    const huidig = ROWS.find((x) => x.key === 'HUIDIG')!.r;
    expect(huidig.parameters?.element).toBe('R8');
    expect(huidig.value! / ALLOWED_W).toBeGreaterThan(4);
    // ...and the requirement is not unreachable in PRINCIPLE: the casebook holds at least one netlist that clears it
    // (a network with no discrete resistor is not judged and does not count).
    const clears = ROWS.filter((x) => x.r.value !== null && x.r.pass);
    expect(clears.length, 'no netlist in the whole casebook clears the class — then the class describes nothing buildable').toBeGreaterThan(0);
  });

  it('the recorded block reproduces from a fresh measurement, per netlist', () => {
    expect(RECORD, 'the recorder wrote no v50_bouwbaarheid block').toBeDefined();
    expect(RECORD!.schatter).toBe(BUILDABILITY_VERSION);
    expect(RECORD!.weerstandsklasse_W).toBe(STATED.weerstandsklasse_W);
    expect(RECORD!.weerstandsmarge).toBe(STATED.weerstandsmarge);
    expect(RECORD!.toegestaan_W).toBe(ALLOWED_W);
    expect(RECORD!.continu_vermogen_W).toBe(CONTINUOUS_POWER_W);
    expect(RECORD!.spoelklasse_A).toBeNull();
    expect(RECORD!.gewapend_op_de_zoektocht).toBe(STATED.bouwbaarheid_op_de_zoektocht.gewapend);
    expect(RECORD!.per_netlist.length).toBe(ROWS.length);
    for (const row of RECORD!.per_netlist) {
      const x = ROWS.find((y) => y.key === row.netlist);
      expect(x, `${row.netlist} is recorded but not in the field`).toBeDefined();
      if (row.heetste_R_W === null) {
        expect(x!.r.value).toBeNull();
      } else {
        expect(row.heetste_R).toBe(x!.r.parameters?.element);
        expect((Math.abs(row.heetste_R_W - x!.r.value!) / x!.r.value!) * PERCENT_V50).toBeLessThanOrEqual(TOL_W_PCT);
        expect(row.haalt_de_eis).toBe(x!.r.pass);
      }
      expect(row.drukste_spoel).toBe(x!.l.parameters?.element);
      expect(Math.abs(row.drukste_spoel_piek_A! - x!.l.value!)).toBeLessThanOrEqual(0.01);
    }
  });

  it('P2: without the class and the margin M-A/part is OFF with the SAME watts, and every other verdict is byte-identical', () => {
    const { resistorClassW: _c, resistorPowerMargin: _m, ...rest } = BASE;
    void _c; void _m;
    const bare = report('HUIDIG', rest);
    const armed = ROWS.find((x) => x.key === 'HUIDIG')!;
    const r = bare.gates.verdicts.find((v) => v.gate === 'M-A/part')!;
    expect(r.active).toBe(false);
    expect(r.value).toBe(armed.r.value);
    expect(r.reason).toContain('no limit set');
    const others = (vs: GateVerdict[]) => JSON.stringify(vs.filter((v) => v.gate !== 'M-A/part'));
    expect(others(bare.gates.verdicts)).toBe(others(FIELD.find((f) => f.key === 'HUIDIG')!.verdicts));
  });

  it('the coil currents are PEAK amplitudes at the stated peak input, and scale with it', () => {
    const half = report('HUIDIG', { ...BASE, amplifierPeakPowerW: BASE.amplifierPeakPowerW! / 4 });
    const l1 = ROWS.find((x) => x.key === 'HUIDIG')!.l;
    const l2 = half.gates.verdicts.find((v) => v.gate === 'M-L')!;
    // A quarter of the peak POWER is half the peak VOLTAGE, so half the current — same coil, same frequency.
    expect(l2.value!).toBeCloseTo(l1.value! / 2, 6);
    expect(l2.parameters?.element).toBe(l1.parameters?.element);
    expect(l2.parameters?.at).toBe(l1.parameters?.at);
  });

  it('the run fixture follows the manifest\'s decision: armed on the search only when it says so', () => {
    const armedOnSearch = STATED.bouwbaarheid_op_de_zoektocht.gewapend;
    expect(CASUS1_V2_GATES.resistorClassW !== undefined).toBe(armedOnSearch);
    expect(CASUS1_V2_GATES.resistorPowerMargin !== undefined).toBe(armedOnSearch);
    // Whatever the decision, the peak input reaches the run so M-L can read a current.
    expect(CASUS1_V2_GATES.peakInputVolts).toBeGreaterThan(0);
    // And the per-way figure travels to the run exactly as the report reads it.
    expect(CASUS1_V2_GATES.maxDriveOnFsDbByDriver).toEqual(STATED_DRIVE_BY_WAY);
    expect(CASUS1_V2_GATES.maxDriveOnFsDb).toBeUndefined();
  });
});

describe('V45 — the anchor is taken AFTER baffle step, and the bridge holds', () => {
  const CURVE = casus1TargetCurve(golden);

  it('the target curve is evaluable, and its step frequency is DERIVED', () => {
    /* P6, as a test. The depth is stated and the frequency is not: it is
     * `baffleStepHz` of the cabinet's measured front width, and it appears
     * nowhere in the reference file as a constant. */
    expect(CURVE.type).toBe('bass-plateau');
    expect(isImplementedCurve(CURVE)).toBe(true);
    const width = golden.manifest_en_geometrie.geometrie.baffle_mm!.breedte;
    expect(CURVE.stepHz).toBeCloseTo(baffleStepHz(width)!, 12);
    expect(CURVE.plateauDepthDb).toBe(
      (golden.manifest_en_geometrie as unknown as {
        gestelde_eisen: { basplateau_offset_dB: number };
      }).gestelde_eisen.basplateau_offset_dB,
    );
  });

  it('it moves the anchored gaps, and it moves them in OPPOSITE directions', () => {
    /* THE CLAIM THAT MAKES IT A VOICING RATHER THAN A LEVEL SHIFT. Only
     * differences between ways move an anchor, so a curve that shifted every
     * way alike would change nothing at all. The woofer's band sits deepest in
     * the transition and is credited most; the tweeter's sits above it and is
     * credited least — so the woofer's budget must GROW and the tweeter's must
     * SHRINK. One number under two names cannot do that (V23). */
    const bare = report('HUIDIG').predesign.gaps!;
    const voiced = report('HUIDIG', { ...BASE, targetCurve: CURVE }).predesign.gaps!;
    expect(voiced.anchor).toBe(bare.anchor);
    const w = (g: typeof bare, d: string): number =>
      g.ways.find((x) => x.driver === d)!.budgetDb;
    expect(w(voiced, 'woofer')).toBeGreaterThan(w(bare, 'woofer'));
    expect(w(voiced, 'tweeter')).toBeLessThan(w(bare, 'tweeter'));
    expect(voiced.notes.join(' ')).toContain('AFTER the target curve');
  });

  it('it is a PRE-design analysis still: no netlist moves it (class A)', () => {
    /* The property F4a established and V45 must not have broken. The voicing
     * is a property of the DESIGN, not of a filter, so all three reference
     * filters have to produce the same block — otherwise `verankerde_gaps_dB`
     * would have quietly become class B. */
    const blocks = ['HUIDIG', 'KAND_A', 'KAND_B'].map((k) =>
      JSON.stringify(report(k, { ...BASE, targetCurve: CURVE }).predesign.gaps),
    );
    expect(new Set(blocks).size).toBe(1);
  });
});
