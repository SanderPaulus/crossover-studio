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
import { systemMinImpedanceOhm } from '../netOptimizer.ts';
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

const HERE = dirname(fileURLToPath(import.meta.url));
const NET_OPTIMIZER = join(HERE, '..', 'netOptimizer.ts');
const ELECTRICAL = join(HERE, 'metrics', 'electrical.ts');

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
const BASE: ReportSettings = {
  amplifierPowerW: 100,
  orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
  ...(STATED_FLOOR_OHM !== null ? { ampMinLoadOhm: STATED_FLOOR_OHM } : {}),
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
      verdict: report(key, { ...BASE, maxDriveOnFsDb: quietest.value }).gates.verdicts.find(
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
     * De grens komt uit de tuner en niet uit dit bestand; de objectiefwaarde
     * komt uit de kleinste RMS die het casusboek draagt, want `fxOf`'s
     * dominante term is `2(1−p)·rms²` met p = 0,5. Dat is de GUNSTIGSTE
     * vergelijking voor de dissipatieterm: elke term die aan `fx` ontbreekt
     * maakt de noemer alleen groter. */
    const CHALLENGE_FRACTION = 0.01;
    const rmsValues = Object.values(
      golden.kandidaten as unknown as Record<string, { rms_vlakheid_dB?: number }>,
    )
      .map((k) => k.rms_vlakheid_dB)
      .filter((v): v is number => typeof v === 'number');
    expect(rmsValues.length).toBeGreaterThan(0);
    const smallestFx = Math.min(...rmsValues) ** 2;

    const worstPeak = Math.max(
      ...record.per_netlist.map((r) => r.term_veiligheidsraster?.term ?? 0),
    );
    const worstRe = Math.max(...record.per_netlist.map((r) => r.term_op_R_e?.term ?? 0));
    expect(worstPeak).toBeGreaterThan(0);

    // VÓÓR: op geen enkele bevroren netlist haalde de term de drempel.
    expect(
      worstPeak / smallestFx,
      `op de piekhoogte haalt de term ${((worstPeak / smallestFx) * 100).toFixed(2)} % — die ` +
        'zou de uitdagingsdrempel dus wél kunnen halen, en dan is V36\'s bevinding vervallen',
    ).toBeLessThan(CHALLENGE_FRACTION);
    // NÁ: op R_e haalt hij hem, en dus kan hij voor het eerst iets beslissen.
    expect(
      worstRe / smallestFx,
      `op R_e haalt de term maar ${((worstRe / smallestFx) * 100).toFixed(2)} % — dan heeft V37 ` +
        'de term niet groot genoeg gemaakt om te sturen en is de entry niet waar',
    ).toBeGreaterThan(CHALLENGE_FRACTION);

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
