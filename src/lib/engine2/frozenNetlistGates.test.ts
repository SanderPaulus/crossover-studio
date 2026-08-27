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
import {
  GATE_IDS,
  evaluateGates,
  freezeGateReference,
  type GateVerdict,
} from './optimizer/gates.ts';
import { CASUS1_V2_GRID, casus1ChainInput, casus1V2Facts } from './casus1V2.fixture.ts';
import { impedanceReferenceFrom } from './optimizer/impedanceReference.ts';
import { buildAnalysis } from './metrics/analysis.ts';
import { epdr } from './metrics/electrical.ts';
import type { Complex } from '../complex.ts';

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

  const searchVerdicts = (key: string): GateVerdict[] => {
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
      verdict: report(key, { ...BASE, maxDriveOnFsDb: quietest.value }).gates.verdicts.find(
        (v) => v.gate === 'M-C' && v.subject === 'tweeter',
      )!,
    })).filter((j) => j.verdict !== undefined);
    expect(judged.find((j) => j.key === loudest.key)!.verdict.pass).toBe(false);
    expect(judged.find((j) => j.key === quietest.key)!.verdict.pass).toBe(true);
  });
});
