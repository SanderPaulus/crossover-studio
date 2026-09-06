/**
 * A5e.3c — A DELIVERED NETWORK THAT FAILS A GATE ON ITS OWN CROSSINGS IS REFUSED.
 *
 * THE FINDING THIS EXISTS FOR (05-09-2026). The search is held to the passbands
 * FROZEN from the seed (`gates.ts`, rule 4: re-derive them every step and the
 * optimiser satisfies M-C by moving the crossing), and the worker judges the
 * delivered network AGAIN on the passbands its own crossings imply. Until
 * A5e.3c that second verdict was computed (`gatesDerived`, the combined
 * `violation`) and read by NOBODY on the v2 route: the shortlist judges the
 * frozen half and delivers. On the A5e.3c field the tuner moved the
 * mid→tweeter crossing down from its stated position (1948 → 1720 Hz), the
 * tweeter's passband widened onto its own falling flank, its passband mean
 * dropped, and M-C on the tweeter read 0.2–0.6 dB LESS protective on the
 * network's own crossings than on the seed's. Three of fourteen delivered
 * networks passed the stated −20 dB on the seed's passbands by 0.10–0.19 dB
 * and missed it on their own by 0.10–0.39 dB. The file measurement — the
 * report, `frozenNetlistGates`, every class-B reference — reads the own
 * crossings, so the case book would have carried three netlists it condemns:
 * two verdicts about one requirement, and the printed one was the kinder (the
 * V32 shape). A verdict that is only computed is no verdict (V31), so the
 * worker refuses since A5e.3c, `by: 'derived-gate'`, `kinds: ['gate']`.
 *
 * FOUR CLAIMS. (1) The decision as a pure function: the derived violation is
 * returned only when the frozen evaluation carries none, the frozen half is
 * asked first, and a frozen failure is left to its own refusal. (2) On the
 * real files: a reference frozen from a DIFFERENT design (HUIDIG stands in for
 * a seed) and a file evaluated on it read the tweeter's M-C differently on the
 * two conventions, and a limit between the two readings is passed on one and
 * failed on the other — the exact geometry of the finding, on a dated corpus
 * that cannot be regenerated away. (3) The V32 shape for M-C: the gate route
 * on the file's own crossings and the report agree on every frozen netlist,
 * so "own crossings" is one convention and not two grids. (4) The acceptance:
 * every LIVE netlist passes M-C on its own crossings — the corpus the refusal
 * exists to keep honest.
 *
 * NO CHAIN RUN: what the refusal reads is `evaluateGates` on a reference
 * frozen from the same measurements the worker freezes from (the V32
 * construction in `frozenNetlistGates.test.ts`).
 */

import { describe, expect, it } from 'vitest';
import {
  casus1Filter,
  casus1MaxDriveOnFsDbByDriver,
  loadGolden,
} from '../casus1.fixture.ts';
import { casus1ChainInput, casus1V2Facts, CASUS1_V2_GATES } from '../casus1V2.fixture.ts';
import { corpusBank, corpusOf } from '../casus1Corpora.fixture.ts';
import { evaluateGates, freezeGateReference, type GateEvaluation, type GateReference, type GateSettings } from './gates.ts';
import { derivedGateViolation } from './worker.ts';

const golden = loadGolden();
const bank = corpusBank(golden, 'merged');
const { manifest, files } = bank;
const gridded = casus1ChainInput(manifest, files, golden);
const facts = casus1V2Facts(bank.report('HUIDIG'), manifest, files);
/** The gates the generator arms, plus the excursion ceilings the facts carry — what the worker judges with. */
const GATES: GateSettings = {
  ...CASUS1_V2_GATES,
  ...(facts.driveCeilingDbByModel ? { driveCeilingDbByDriver: { ...facts.driveCeilingDbByModel } } : {}),
};
const STATED = casus1MaxDriveOnFsDbByDriver(golden);
/** The dB tolerance class of the case book — the margin a reproduction of a class-B figure is held to. */
const DB_CLASS = (golden.toleranties as { dB: number }).dB;

/** The worker's own reference, frozen from `seedKey`'s network (V32 construction). */
function referenceFrom(seedKey: string): GateReference {
  const filter = casus1Filter(seedKey, manifest, files, golden);
  return freezeGateReference({
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
}
const mcOf = (e: GateEvaluation, way: string): number | null =>
  e.verdicts.find((v) => v.gate === 'M-C' && v.subject === way)?.value ?? null;

describe('A5e.3c — the derived-gate refusal as a decision', () => {
  const ok: GateEvaluation = { verdicts: [], failures: [], violation: null, metrics: { dissipation: null, epdr: null, driveVoltage: [], resistorLoads: null, coilLoads: null }, crossings: [] };
  const bad = (why: string): GateEvaluation => ({ ...ok, violation: why });

  it('returns the derived violation only when the frozen evaluation carries none', () => {
    expect(derivedGateViolation((m) => (m === 'frozen' ? ok : bad('M-C (tweeter): -19.9 dB exceeds the stated ceiling of -20.0 dB')))).toMatch(/M-C \(tweeter\)/);
    expect(derivedGateViolation(() => ok)).toBeNull();
  });

  it('a frozen failure is left to its own refusal: null, and the derived half is not even asked', () => {
    const asked: string[] = [];
    const out = derivedGateViolation((m) => {
      asked.push(m);
      return bad(`${m} fails`);
    });
    expect(out).toBeNull();
    expect(asked).toEqual(['frozen']);
  });

  it('the frozen half is asked FIRST — the reference the search was held to decides whether this refusal has a subject', () => {
    const asked: string[] = [];
    derivedGateViolation((m) => {
      asked.push(m);
      return ok;
    });
    expect(asked).toEqual(['frozen', 'derived']);
  });
});

describe('A5e.3c — the two conventions read M-C differently on the real files, and a limit between them splits the verdict', () => {
  /* HUIDIG stands in for the seed: a reference frozen from ITS crossings
   * (360 · 2250 Hz) judges a dated netlist on passbands that are not the
   * netlist's own. The dated A5e.3-veld corpus is the subject because it cannot
   * be regenerated away (the UI-2 lesson); the file with the LARGEST gap in the
   * direction of the finding — own crossings LESS protective than the frozen
   * reference — is chosen, and the gap is asserted before it is used. */
  const ref = referenceFrom('HUIDIG');
  const dated = corpusOf('a5e3veld', golden);
  const readings = [...dated.byCandidate.values()].map((key) => {
    const netlist = casus1Filter(key, manifest, files, golden).netlist;
    const frozen = mcOf(evaluateGates(netlist, GATES, ref, 'frozen'), 'tweeter');
    const derived = mcOf(evaluateGates(netlist, GATES, ref, 'derived'), 'tweeter');
    return { key, frozen, derived };
  });
  const subject = readings
    .filter((r) => r.frozen !== null && r.derived !== null)
    .sort((a, b) => b.derived! - b.frozen! - (a.derived! - a.frozen!))[0];

  it('on the file with the largest gap, the own-crossings reading is less protective than the frozen one by a measurable margin', () => {
    expect(subject, 'no dated netlist carries a tweeter M-C on both conventions').toBeDefined();
    // P6-OK: a test resolution — a gap a reader can see on one decimal, and the class the case book reproduces to.
    expect(subject.derived! - subject.frozen!).toBeGreaterThan(DB_CLASS / 3);
  });

  it('a limit between the two readings is PASSED on the frozen passbands and FAILED on the own crossings — and the refusal helper says so', () => {
    const netlist = casus1Filter(subject.key, manifest, files, golden).netlist;
    const limit = (subject.frozen! + subject.derived!) / 2;
    const gates: GateSettings = { ...GATES, maxDriveOnFsDbByDriver: { ...(GATES.maxDriveOnFsDbByDriver ?? {}), tweeter: limit } };
    const frozen = evaluateGates(netlist, gates, ref, 'frozen');
    const derived = evaluateGates(netlist, gates, ref, 'derived');
    expect(frozen.verdicts.find((v) => v.gate === 'M-C' && v.subject === 'tweeter')!.pass).toBe(true);
    expect(derived.verdicts.find((v) => v.gate === 'M-C' && v.subject === 'tweeter')!.pass).toBe(false);
    expect(frozen.violation).toBeNull();
    expect(derived.violation).toMatch(/M-C \(tweeter\)/);
    const out = derivedGateViolation((m) => evaluateGates(netlist, gates, ref, m));
    expect(out).toMatch(/M-C \(tweeter\)/);
    // The counter-proof: a limit under both readings is passed on both, and nothing is refused.
    const lenient: GateSettings = { ...GATES, maxDriveOnFsDbByDriver: { ...(GATES.maxDriveOnFsDbByDriver ?? {}), tweeter: Math.max(subject.frozen!, subject.derived!) + 1 } };
    expect(derivedGateViolation((m) => evaluateGates(netlist, lenient, ref, m))).toBeNull();
  });

  it('the stated figure of this casus is what the frozen half of the search reads — the refusal changes nothing about the limit', () => {
    expect(GATES.maxDriveOnFsDbByDriver).toEqual(STATED);
  });
});

describe('A5e.3c — the V32 shape for M-C: the gate route on the own crossings and the report agree on every frozen netlist', () => {
  const keys = Object.keys((golden.manifest_en_geometrie as { netlists: Record<string, string> }).netlists);
  const live = keys.filter((k) => /^KAND_V2_\d+$/.test(k));
  /** The corpora the refusal governs — generated on this engine and this measurement set — plus the reference filters. */
  const governed = keys.filter((k) => /^(KAND_V2|A5E3VELD_KAND|A5E3ARM_KAND)_\d+$/.test(k) || ['HUIDIG', 'KAND_A', 'KAND_B'].includes(k));

  /** One netlist, one way: the gate route on the file's own crossings beside the report. */
  const compare = (key: string) => {
    const rep = bank.report(key);
    const netlist = casus1Filter(key, manifest, files, golden).netlist;
    const own = evaluateGates(netlist, GATES, referenceFrom(key), 'derived');
    return rep.gates.verdicts
      .filter((x) => x.gate === 'M-C' && x.value !== null)
      .map((v) => {
        const g = own.verdicts.find((x) => x.gate === 'M-C' && x.subject === v.subject);
        return { way: v.subject, report: v.value!, gate: g?.value ?? null, reportPass: v.pass, gatePass: g?.pass ?? null, reportXo: rep.crossings.map((c) => c.fHz), gateXo: own.crossings.map((c) => c.fHz) };
      });
  };

  it('M-C per way on every governed netlist, within the dB class — and the same verdict', () => {
    /* The reference is frozen from the FILE itself, so its frozen passbands ARE
     * the file's own: this is the evaluation the worker's second verdict makes
     * and the evaluation the report makes, side by side. A crossing derived on
     * the chain grid (143 points) against one derived on the report grid (1600)
     * moves a passband edge by a hertz; the dB class covers that and nothing
     * else. */
    let compared = 0;
    for (const key of governed) {
      for (const r of compare(key)) {
        expect(r.gate, `${key}/${r.way}: the gate route judges no M-C where the report does`).not.toBeNull();
        expect(Math.abs(r.gate! - r.report), `${key}/${r.way}: gate ${r.gate} vs report ${r.report}`).toBeLessThanOrEqual(DB_CLASS);
        expect(r.gatePass, `${key}/${r.way}: gate says ${r.gatePass}, report says ${r.reportPass}`).toBe(r.reportPass);
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(governed.length);
  });

  it('over the WHOLE case book the two routes DERIVE DIFFERENT CROSSINGS on a NAMED set of dated (netlist, way) pairs — pinned exactly against the manifest, not a complement', () => {
    /* MEASURED 05-09-2026 and not repaired: on sixteen (netlist, way) pairs of
     * dated corpora (V28–V50) `crossingsOf` on the chain grid and
     * `deriveCrossings` on the report grid land on different crossings — a
     * mid whose lower crossing the chain grid puts at ~490 Hz where the report
     * grid finds ~385, and on the two V28 netlists a mid→tweeter crossing at
     * 1521/1613 Hz against 3818/3949 — so the passbands differ and M-C differs
     * with them, by up to 5 dB on V28_KAND_1's mid and 3 dB on its tweeter.
     *
     * SINCE E-1 THE SET LIVES IN THE MANIFEST (`e1_kruispuntafleiding`, written
     * by the recorder with the era of each netlist and both readings) and this
     * guard pins it EXACTLY: the fresh set of disagreeing pairs must equal the
     * recorded set — a new disagreement fails by not being recorded, and a pair
     * that stops disagreeing fails by still being recorded, so the list can
     * only shrink by someone re-recording it. The A5e.3c form asserted only
     * that every fresh pair was on a typed list, which a vanished pair passes
     * in silence — the complement's cousin (the V37/V38-fix lesson). The
     * recorded numbers reproduce within the dB class, and none of the pairs
     * belongs to a corpus the refusal governs. */
    const block = (golden.manifest_en_geometrie as unknown as {
      e1_kruispuntafleiding?: {
        paren: { netlist: string; weg: string; M_C_ketenraster_dB: number | null; M_C_rapport_dB: number | null; oordeel_ketenraster: boolean | null; oordeel_rapport: boolean }[];
        bestuurd_door_de_weigering_en_eens: boolean;
      };
    }).e1_kruispuntafleiding;
    expect(block, 'the case book carries no e1_kruispuntafleiding block — run record-casus1-v2-references.ts').toBeDefined();
    const recorded = block!.paren.map((p) => `${p.netlist}/${p.weg}`).sort();
    const fresh = new Map<string, { gate: number | null; report: number; gatePass: boolean | null; reportPass: boolean }>();
    for (const key of keys) {
      for (const r of compare(key)) {
        if (r.gate === null || Math.abs(r.gate - r.report) > DB_CLASS || r.gatePass !== r.reportPass) fresh.set(`${key}/${r.way}`, r);
      }
    }
    expect([...fresh.keys()].sort(), 'the pairs the two routes disagree on must be EXACTLY the recorded set').toEqual(recorded);
    // ...and the list is not empty bookkeeping: the disagreement is real on at least one named pair today.
    expect(recorded.length).toBeGreaterThan(0);
    for (const p of block!.paren) {
      const f = fresh.get(`${p.netlist}/${p.weg}`)!;
      if (p.M_C_ketenraster_dB === null) expect(f.gate).toBeNull();
      else expect(Math.abs(f.gate! - p.M_C_ketenraster_dB), `${p.netlist}/${p.weg}: gate route`).toBeLessThanOrEqual(DB_CLASS);
      expect(Math.abs(f.report - p.M_C_rapport_dB!), `${p.netlist}/${p.weg}: report`).toBeLessThanOrEqual(DB_CLASS);
      expect(f.reportPass).toBe(p.oordeel_rapport);
      expect(f.gatePass).toBe(p.oordeel_ketenraster);
      expect(governed.some((k) => p.netlist === k), `${p.netlist}: a governed corpus disagrees with itself`).toBe(false);
    }
    expect(block!.bestuurd_door_de_weigering_en_eens).toBe(true);
  });

  it('the LIVE corpus passes M-C on its OWN crossings, every way — the acceptance the refusal exists for', () => {
    expect(live.length).toBeGreaterThan(0);
    for (const key of live) {
      const own = evaluateGates(casus1Filter(key, manifest, files, golden).netlist, GATES, referenceFrom(key), 'derived');
      for (const v of own.verdicts.filter((x) => x.gate === 'M-C' && x.active)) {
        expect(v.pass, `${key}/${v.subject}: ${v.value} dB against ${v.limit} on its own crossings`).toBe(true);
      }
      expect(own.violation, `${key}: ${own.violation}`).toBeNull();
    }
  });
});
