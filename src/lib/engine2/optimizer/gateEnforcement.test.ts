/**
 * DELIVERABLE 3, ACCEPTANCE — the gates as a STRUCTURE, not as a preference.
 *
 * Two regressions, both from the casebook, plus the two properties that make
 * them mean something.
 *
 * V2 — THE PATHOLOGY THIS PHASE EXISTS FOR. The casebook records it as
 * "fasedoel via ondergedempte L/C met serie-R tegen de grens (drift richting
 * extreem hoge R zonder grenshandhaving)". The fixture reproduces it without
 * being asked to: pushed at a tight phase target, the ungated search drives
 * the low branch's series resistor from 1 Ω to within a whisker of the box
 * ceiling and burns 90 % of the amplifier's power in it, while another start
 * hands the amplifier a 1.5 Ω load with the tweeter's series capacitor opened
 * up to 13 µF. With the gates armed and the Q_es budget inverted into the
 * search box, neither happens — and the test asserts BOTH halves, because
 * "the gate values are fine" and "the drift is gone" are different claims and
 * a design can satisfy the first while still doing the second.
 *
 * NO EVASION. A deliberately tight gate, and EVERY delivered candidate
 * respects it — not the winner, every one. That is the difference between a
 * gate and a ranking: a ranking answers "which is best", a gate answers "may
 * this exist", and a search that only checked its favourite would be doing
 * the first while claiming the second.
 *
 * THE TWO PROPERTIES THAT KEEP THESE HONEST.
 *  · A gate is NEVER a cost term (P2). Tested by running with no gate and
 *    with a SLACK gate — one that is armed but nowhere near binding — and
 *    asserting the delivered networks are byte-identical. A penalty term,
 *    however small, would move them.
 *  · The regressions are NOT VACUOUS. Each asserts that the ungated run on
 *    the same seed does show the behaviour being excluded. A gate test on a
 *    case that never misbehaves proves nothing at all.
 */

import { describe, expect, it } from 'vitest';
import { selectEngine } from '../facade.ts';
import { stableJson } from './determinism.ts';
import { evaluateGates, type GateSettings, type GateVerdict } from './gates.ts';
import { invertBudgets, searchBoxFor } from './bounds.ts';
import { runV2Optimization, type V2OptimizeResult } from './run.ts';
import { v2DriverZ, v2GateReference, v2Netlist, v2Responses, v2SeedParts, V2_GRID } from './v2.fixture.ts';
import type { VxpPart } from '../../parsers/vxp.ts';

const ON = selectEngine(true);
const reference = v2GateReference();
const { wBase, tBase } = v2Responses();
const driverZ = v2DriverZ();

/** The pressure that produced the pathology in the first place: a tight phase target. */
const PRESSURE = { phasePriority: 0.7, staged: { rippleDb: 1.0, phaseDeg: 5 } };

/** The gate set for the pathology regression — all three of A4's gates armed. */
const GATES: GateSettings = {
  maxDissipationFraction: 0.35,
  minEpdrOhm: 1.5,
  maxDriveOnFsDb: -6,
};

/**
 * The measured DC resistance of the low branch's driver, as a PROJECT INPUT.
 *
 * A4 lists R_e as a declared data need for exactly this reason and V8d says
 * why the derived value cannot stand in for it. Here it is simply stated, as
 * a project would state it.
 */
const LOW_RE_OHM = 5.0;
/** Series resistance already in the low path at the seed (the coil's DCR). */
const LOW_PATH_R_OHM = 0.36;

function boundsFor(qesMax: number) {
  return invertBudgets(
    [
      {
        driver: 'mid',
        lowest: true,
        highPassProtected: false,
        reOhm: LOW_RE_OHM,
        reSource: 'measured DC resistance, entered for this project',
        zPassbandMedianOhm: null,
        passbandHz: null,
        fsHz: null,
        fPeakHz: null,
        gapBudgetDb: null,
        pathROhm: LOW_PATH_R_OHM,
      },
    ],
    { qesMultiplierMax: qesMax },
  ).bounds;
}

function optimise(args: {
  seed?: number;
  gates?: GateSettings;
  qesMax?: number;
  starts?: number;
}): V2OptimizeResult {
  const bounds = args.qesMax === undefined ? [] : boundsFor(args.qesMax);
  return runV2Optimization({
    selection: ON,
    seedParts: v2SeedParts(),
    grid: V2_GRID,
    wBase,
    tBase,
    driverZ,
    adjust: { offsetMm: 0, trimDb: 0, inverted: false },
    tuneOptions: PRESSURE,
    determinism: { seed: args.seed ?? 4242, starts: args.starts ?? 3 },
    gateReference: reference,
    ...(args.gates ? { gates: args.gates } : {}),
    ...(args.qesMax !== undefined ? { budgets: { qesMultiplierMax: args.qesMax } } : {}),
    bounds,
  });
}

/** The series resistance the low branch's own resistor carries, ohms. */
function seriesROf(parts: readonly VxpPart[]): number {
  const r = parts.find((p) => p.partId === 'R1' && !p.open && !p.shorted);
  return r ? (r.params.find((q) => q.name === 'R')?.value ?? 0) : 0;
}

const verdict = (vs: readonly GateVerdict[], gate: string, subject?: string): GateVerdict | undefined =>
  vs.find((v) => v.gate === gate && (subject === undefined || v.subject === subject));

/* The soft buildability ceiling the ungated search parked against — quoted
 * from `netOptimizer`'s BOUNDS.R. Used only to say "it went to the wall". */
const APP_RESISTOR_CEILING_OHM = 47;

const UNGATED = optimise({});
const GATED = optimise({ gates: GATES, qesMax: 1.5 });

describe('Deliverable 3 - the gates are structural', () => {
  /* ================= V2: the pathology regression ================= */

  describe('casebook V2 - phase bought with a resistor drifting to extremes', () => {
    it('the ungated search DOES exhibit the pattern (this regression is not vacuous)', () => {
      // Without this the test below could pass on a case that never misbehaves,
      // which is the most comfortable way for a regression to mean nothing.
      const drifted = UNGATED.candidates.some(
        (c) => seriesROf(c.parts) > APP_RESISTOR_CEILING_OHM * 0.8,
      );
      const burnt = UNGATED.candidates.some((c) => {
        const g = evaluateGates(v2Netlist(c.parts), {}, reference, 'frozen');
        return (g.metrics.dissipation?.totalFraction ?? 0) > GATES.maxDissipationFraction!;
      });
      const hostile = UNGATED.candidates.some((c) => {
        const g = evaluateGates(v2Netlist(c.parts), {}, reference, 'frozen');
        return (g.metrics.epdr?.minOhm ?? Infinity) < GATES.minEpdrOhm!;
      });
      const unprotected = UNGATED.candidates.some((c) => {
        const g = evaluateGates(v2Netlist(c.parts), {}, reference, 'frozen');
        return g.metrics.driveVoltage.some((v) => v.db > GATES.maxDriveOnFsDb!);
      });
      expect(drifted, 'no candidate drove its series R to the wall').toBe(true);
      expect(burnt, 'no candidate exceeded the dissipation ceiling').toBe(true);
      expect(hostile, 'no candidate fell under the EPDR floor').toBe(true);
      expect(unprotected, 'no candidate left the driver unprotected on its resonance').toBe(true);
    });

    it('with the gates and the budget armed, NO delivered candidate shows it', () => {
      expect(GATED.candidates.length).toBeGreaterThan(0);
      const boundOhm = boundsFor(1.5)[0].maxSI;

      for (const c of GATED.candidates) {
        // (a) the GATE VALUES.
        const g = evaluateGates(v2Netlist(c.parts), GATES, reference, 'frozen');
        expect(g.failures, `${c.label}: ${g.violation}`).toEqual([]);
        expect(g.metrics.dissipation!.totalFraction).toBeLessThanOrEqual(GATES.maxDissipationFraction!);
        expect(g.metrics.epdr!.minOhm).toBeGreaterThanOrEqual(GATES.minEpdrOhm!);
        for (const v of g.metrics.driveVoltage) {
          expect(v.db).toBeLessThanOrEqual(GATES.maxDriveOnFsDb!);
        }

        // (b) the ABSENCE OF THE DRIFT, asserted separately. A design can meet
        //     every gate value and still be the shape the casebook warns about
        //     — that is precisely why A5d.6 bounds the search box as well as
        //     gating the result.
        expect(seriesROf(c.parts)).toBeLessThanOrEqual(boundOhm + 1e-9);
        expect(seriesROf(c.parts)).toBeLessThan(APP_RESISTOR_CEILING_OHM * 0.2);
      }
    });

    it('the enforcement happened INSIDE the search, not by throwing candidates away', () => {
      // The A3 requirement is that a polish step cannot cross an active gate,
      // whatever it wins elsewhere. The evidence is that steps were refused.
      const refused = GATED.candidates.flatMap((c) => c.net.gateRefusals ?? []);
      expect(refused.length).toBeGreaterThan(0);
      for (const line of refused) expect(line).toMatch(/refused:/);
    });
  });

  /* ================= no evasion ================= */

  describe('no evasion - a deliberately binding gate', () => {
    const TIGHT: GateSettings = { maxDissipationFraction: 0.05 };
    const tightRun = optimise({ gates: TIGHT });

    it('the gate really binds on this case', () => {
      const over = UNGATED.candidates.filter((c) => {
        const g = evaluateGates(v2Netlist(c.parts), {}, reference, 'frozen');
        return (g.metrics.dissipation?.totalFraction ?? 0) > TIGHT.maxDissipationFraction!;
      });
      expect(over.length).toBeGreaterThan(0);
    });

    it('EVERY delivered candidate respects it - not only the winner', () => {
      expect(tightRun.candidates.length).toBeGreaterThan(0);
      for (const c of tightRun.candidates) {
        const g = evaluateGates(v2Netlist(c.parts), TIGHT, reference, 'frozen');
        expect(g.failures, `${c.label} violates the tight gate`).toEqual([]);
        expect(g.metrics.dissipation!.totalFraction).toBeLessThanOrEqual(
          TIGHT.maxDissipationFraction!,
        );
      }
    });

    it('the report carries the gate status PER CANDIDATE, delivered and rejected', () => {
      for (const c of [...tightRun.candidates]) {
        expect(c.gatesFrozen.length).toBeGreaterThan(0);
        expect(c.gatesDerived.length).toBeGreaterThan(0);
        const ma = verdict(c.gatesFrozen, 'M-A', 'system')!;
        expect(ma.active).toBe(true);
        expect(ma.limit).toBe(TIGHT.maxDissipationFraction);
        expect(ma.pass).toBe(true);
        expect(ma.reason).toContain('%');
        // An INACTIVE gate is still reported, with its value and the fact that
        // nothing judged it — P4's visible half.
        const epdr = verdict(c.gatesFrozen, 'M-B/EPDR', 'system')!;
        expect(epdr.active).toBe(false);
        expect(epdr.limit).toBeNull();
        expect(epdr.value).not.toBeNull();
        expect(epdr.reason).toContain('no limit set');
      }
      for (const r of tightRun.rejected) {
        expect(r.reasons.length).toBeGreaterThan(0);
        expect(r.gatesFrozen.length + r.gatesDerived.length).toBeGreaterThan(0);
      }
    });
  });

  /* ================= P2: a gate is not a cost term ================= */

  it('P2 - an armed but SLACK gate changes nothing about the search', () => {
    // If the gates were a penalty beside the objective, arming one would move
    // the optimum even where it is nowhere near binding. Byte comparison, no
    // tolerance: a small change is exactly what a small penalty looks like.
    const slack: GateSettings = {
      maxDissipationFraction: 1,
      minEpdrOhm: 0,
      maxDriveOnFsDb: 1000,
    };
    const withSlack = optimise({ gates: slack, starts: 2 });
    const without = optimise({ starts: 2 });
    const values = (r: V2OptimizeResult): string =>
      stableJson(r.candidates.map((c) => ({ label: c.label, parts: c.parts })));
    expect(values(withSlack)).toBe(values(without));
    expect(withSlack.candidates.length).toBeGreaterThan(0);
    // ...and the slack gates really were ARMED, or the comparison is trivial.
    expect(withSlack.gatesActive).toBe(true);
    expect(without.gatesActive).toBe(false);
    for (const c of withSlack.candidates) {
      expect(verdict(c.gatesFrozen, 'M-A', 'system')!.active).toBe(true);
    }
  });

  /* ================= the box really is an intersection ================= */

  it('A5d.6 - the budget narrows the box, and the box is what the search sees', () => {
    const box = searchBoxFor(v2SeedParts(), boundsFor(1.5));
    // The coil's DCR comes off the top of the budget: the tuner cannot move it.
    const sum = box.valueSumCeilings.find((g) => g.ids.includes('R1'))!;
    expect(sum.maxSI).toBeCloseTo(LOW_RE_OHM * 0.5, 9);
    expect(sum.fixedSI).toBeGreaterThan(0);
    expect(box.valueCeilings['R1']).toBeCloseTo(sum.maxSI - sum.fixedSI, 9);
    // And with no budget stated there is no box at all (P4).
    expect(searchBoxFor(v2SeedParts(), []).valueSumCeilings).toEqual([]);
  });
});
