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
 *      NAMED. The ten `KAND-V2-*` netlists were frozen BEFORE the floor was
 *      stated and none of them clears it, so each is listed in
 *      `v2_herkomst.vloeruitzonderingen` with its measured minimum and the
 *      reason. That list is a bookkeeping entry, not a waiver: remove a name
 *      while the netlist still misses the floor and this goes red, which is
 *      exactly what makes it falsifiable. Casebook V30.
 *   3. THE UNARMED GATES REPORT WITHOUT JUDGING, and the still-useful
 *      counter-proof that the harness bites when a limit IS given, with limits
 *      taken from the field's own measured values so no number is written here.
 */

import { describe, expect, it } from 'vitest';
import {
  casus1AmpMinLoadOhm,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
} from './casus1.fixture.ts';
import { buildReport, type ReportSettings } from './report.ts';
import { ctcKey } from './metrics/types.ts';
import { GATE_IDS, type GateVerdict } from './optimizer/gates.ts';

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const geometry = casus1Geometry(golden);

/** Every frozen netlist the case book names — v1 baselines and v2 candidates alike. */
const NETLIST_KEYS = Object.keys(
  (golden.manifest_en_geometrie as { netlists: Record<string, string> }).netlists,
);

/** The floor the DESIGNER stated, read from the reference file (P6, one home). */
const STATED_FLOOR_OHM = casus1AmpMinLoadOhm(golden);

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
const BASE: ReportSettings = {
  amplifierPowerW: 100,
  orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
  ...(STATED_FLOOR_OHM !== null ? { ampMinLoadOhm: STATED_FLOOR_OHM } : {}),
};

const report = (key: string, settings: ReportSettings = BASE) =>
  buildReport({
    manifest,
    files,
    filter: casus1Filter(key, manifest, files, golden),
    geometry,
    settings,
  });

/** Every frozen netlist, judged once, reused by every case below. */
const FIELD: { key: string; verdicts: GateVerdict[]; anyActive: boolean }[] = NETLIST_KEYS.map(
  (key) => {
    const r = report(key);
    return { key, verdicts: r.gates.verdicts, anyActive: r.gates.anyActive };
  },
);

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
      expect(e.reden, `${e.netlist}: an exception without a reason is a waiver`).toMatch(/V30/);
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
      verdict: report(key, { ...BASE, maxDriveOnFsDb: quietest.value }).gates.verdicts.find(
        (v) => v.gate === 'M-C' && v.subject === 'tweeter',
      )!,
    })).filter((j) => j.verdict !== undefined);
    expect(judged.find((j) => j.key === loudest.key)!.verdict.pass).toBe(false);
    expect(judged.find((j) => j.key === quietest.key)!.verdict.pass).toBe(true);
  });
});
