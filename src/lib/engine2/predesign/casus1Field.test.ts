/**
 * F4d ON CASUS 1 — the field the measurements imply, and the pre-start estimate
 * that used to say 4 of 4.
 *
 * THE ACCEPTANCE THIS FILE OWNS, and it is the one the audit's §6.2 asked for.
 * Live on the KOAN project the estimate reported four of four candidates
 * outside the A5d.3 window: the recommended band 396.7–448.5 Hz had been
 * replaced two screens upstream by the v1 physics window at 707–728 Hz, and the
 * candidates were generated from the replacement. The estimate was right; the
 * cause was `clampPin`. With the candidates generated from the window itself
 * the count is ZERO — not because the estimate was relaxed but because a
 * candidate outside a window is now something the generator cannot express.
 *
 * A count of zero is worthless without a counter-proof, so the same estimator
 * is run on the v1 physics window's own crossings and reports them outside. An
 * assertion that nothing is wrong has to have shown it can say something is.
 *
 * AND THE FIELD IS CLASS A. F4a's classification says a reference that depends
 * only on the MEASUREMENTS is class A, one that also depends on a netlist is
 * class B, and one that depends on a SEARCH is class C — which casus 1 has none
 * of, deliberately. The candidate field is derived from windows, and windows
 * are pre-design: the same field must come out whichever of the three baseline
 * netlists the report was built on. That is asserted here rather than assumed,
 * the way V19 asserted it for the windows themselves.
 */

import { describe, expect, it } from 'vitest';
import {
  CASUS1_WOOFER_DC_OHM,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
} from '../casus1.fixture.ts';
import { buildReport, type EngineV2Report } from '../report.ts';
import { ctcKey } from '../metrics/types.ts';
import { FLAT_TARGET } from '../requirements/targetCurve.ts';
import { casus1Field } from '../casus1V2.fixture.ts';
import { candidateFieldKey } from './candidateField.ts';
import { candidatesOutsideWindows } from './xoRangeAdvice.ts';
import { recommendedBand } from './recommendedBand.ts';
import { compareDesigns, COMPARISON_COLUMNS } from './comparison.ts';
import { stableJson } from '../optimizer/determinism.ts';

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const geometry = casus1Geometry(golden);

const report = (candidate: 'HUIDIG' | 'KAND_A' | 'KAND_B'): EngineV2Report =>
  buildReport({
    manifest,
    files,
    filter: casus1Filter(candidate, manifest, files, golden),
    geometry,
    settings: {
      amplifierPowerW: 100,
      // The same order every other casus-1 test states, and the one the
      // casebook's own window references carry (`kruisvensters.*_orde4`).
      orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
      reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
      targetCurve: FLAT_TARGET,
    },
  });

const REPORTS = { HUIDIG: report('HUIDIG'), KAND_A: report('KAND_A'), KAND_B: report('KAND_B') };

/* M-1 — THE FIELD IS THE FIXTURE'S (`casus1Field`): the woofer→mid axis
 * abstains on the order and runs LR2 and LR4 (Sander's ask), the mid→tweeter
 * axis keeps the stated order 4. Until M-1 this file built its own field with
 * the stated order on both axes; a second definition of the field is a second
 * opinion about what the corpus was generated from. */
const fieldFor = (r: EngineV2Report) => casus1Field(r);

const FIELD = fieldFor(REPORTS.HUIDIG);

describe('the field casus 1 implies', () => {
  it('is derived from the two feasible windows and nothing else', () => {
    const axes = FIELD.field.axes;
    expect(axes).toHaveLength(2);
    expect(axes[0].pairLabel).toBe('woofer→mid');
    expect(axes[1].pairLabel).toBe('mid→tweeter');
    // The windows are the casebook's own (`kruisvensters`), to the hertz the
    // reference file rounds to.
    const wm = golden.kruisvensters.woofer_mid_orde4 as unknown as { venster: [number, number] };
    const wm2 = golden.kruisvensters.woofer_mid_orde2 as unknown as { venster: [number, number] };
    const mt = golden.kruisvensters.mid_tweeter_orde4 as unknown as { venster: [number, number] };
    const win = (i: number, order: string) => axes[i].window[order];
    // Within the reference file's own frequency tolerance class — a window edge
    // is a reference, and a test that carried its own tolerance could quietly
    // widen one (the F4a discipline).
    const pct = golden.toleranties.frequenties_pct / 100;
    const near = (got: number, want: number) => Math.abs(got / want - 1) <= pct;
    expect(near(win(0, '4').floorHz!, wm.venster[0])).toBe(true);
    expect(near(win(0, '4').ceilingHz!, wm.venster[1])).toBe(true);
    // M-1 — the second-order window on the same axis has its OWN floor (k·f_s at order 2).
    expect(near(win(0, '2').floorHz!, wm2.venster[0])).toBe(true);
    expect(near(win(0, '2').ceilingHz!, wm2.venster[1])).toBe(true);
    expect(win(0, '2').floorHz!).toBeGreaterThan(win(0, '4').floorHz!);
    expect(near(win(1, '4').floorHz!, mt.venster[0])).toBe(true);
    expect(near(win(1, '4').ceilingHz!, mt.venster[1])).toBe(true);
    expect(axes[1].window['2']).toBeUndefined();
  });

  it('places thirteen LR4 and ten LR2 positions on the lower axis and five on the upper, and says why', () => {
    /* The count is derived: `1 + floor(span / smoothing)`, over the A5d.3
     * WINDOW, per order. Until M-1 the W-M window spanned 0.47 octaves (397–549
     * Hz, the gate floor) ⇒ three positions at the stated order 4. On the
     * merged set the floor is k·f_s of the mid: 124–550 Hz at order 4 (2.15
     * octaves ⇒ thirteen) and 178–550 Hz at order 2 (1.63 ⇒ ten), and the axis
     * ABSTAINS on the order so both are built (LR2 and LR4). M-T spans 0.83
     * octaves at the stated order 4 ⇒ five. 23 × 5 = 115 candidates.
     *
     * It read three and three until the F4d follow-up, because the upper axis
     * was laid across the RECOMMENDED band (0.33 octaves, the window minus the
     * worst lobing zone) instead of the window. The excision is suspended
     * pending V28, so the upper axis gets the count its window implies. */
    const wm = FIELD.field.axes[0].positionsByOrder;
    const mt = FIELD.field.axes[1].positionsByOrder;
    expect(FIELD.field.axes[0].orders).toEqual([2, 4]);
    expect(FIELD.field.axes[1].orders).toEqual([4]);
    expect(wm).toHaveLength(2);
    expect(mt).toHaveLength(1);
    const o2 = wm.find((p) => p.order === 2)!;
    const o4 = wm.find((p) => p.order === 4)!;
    expect(o4.count).toBe(13);
    expect(o4.derivedCount).toBe(13);
    expect(o2.count).toBe(10);
    expect(o2.derivedCount).toBe(10);
    expect(mt[0].count).toBe(5);
    expect(mt[0].derivedCount).toBe(5);
    expect(FIELD.field.candidates).toHaveLength((o2.count + o4.count) * mt[0].count);
    expect(FIELD.field.candidates).toHaveLength(115);
    // Sander's two positions of interest lie on both orders: ~350 and ~400 Hz.
    for (const p of [o2, o4]) {
      expect(p.hz.some((h) => h > 320 && h < 380)).toBe(true);
      expect(p.hz.some((h) => h > 380 && h < 440)).toBe(true);
    }
    // The abstention is said out loud, and the upper axis says it was stated.
    expect(FIELD.orders[0].why.join(' ')).toContain('every buildable order is its own candidate');
    expect(FIELD.orders[1].why.join(' ')).toContain('the designer stated');
    // Every candidate names LR on both axes — the library was LR-only.
    for (const c of FIELD.field.candidates) for (const x of c.crossings) expect(x.alignment.kind).toBe('LR');
  });

  it('does NOT cut the worst lobing zone out of the upper axis, and says whose zone it was', () => {
    /* Casus 1's upper pair is the one V9 flagged: the favourable lobing zone
     * lies above the breakup ceiling and the WORST one lies inside the window.
     * F4d turned that into a gap in the candidate list. The F4d follow-up took
     * the gap back out (V28): the zone is a λ fraction on one centre-to-centre
     * distance, and V20a reserves every lobing judgement for the vertical
     * synthesis. What replaces the gap is not silence — the zone travels with
     * every candidate, attributed, and a position genuinely sits inside it. */
    const rec = FIELD.field.axes[1].recommended['4'];
    expect(rec.segments).toHaveLength(2); // `recommendedBand` is untouched
    const zone = rec.worstZoneHz!;
    const inZone = FIELD.field.candidates.filter(
      (c) => c.crossings[1].hz > zone[0] && c.crossings[1].hz < zone[1],
    );
    expect(inZone.length).toBeGreaterThan(0);

    for (const c of FIELD.field.candidates) {
      const ex = c.crossings[1].excisions;
      expect(ex).toHaveLength(1);
      expect(ex[0].hz).toEqual(zone);
      expect(ex[0].applied).toBe(false);
      expect(ex[0].source).toMatch(/not the vertical synthesis/);
      expect(ex[0].suspendedBecause).toMatch(/V28/);
    }
  });

  it('is CLASS A: the same field comes out of all three baseline reports', () => {
    /* F4a's classification, applied to the generator. A window is pre-design —
     * it stands on measurement validity, f_s, breakup severity and the
     * centre-to-centre spacing, and on no filter at all — so the field it
     * implies must not move when the loaded netlist does. Measured rather than
     * assumed, exactly as V19 measured it for the windows. */
    const a = stableJson(candidateFieldKey(FIELD.field));
    expect(stableJson(candidateFieldKey(fieldFor(REPORTS.KAND_A).field))).toBe(a);
    expect(stableJson(candidateFieldKey(fieldFor(REPORTS.KAND_B).field))).toBe(a);
  });
});

describe('the pre-start estimate on the v2 route: 0 of N', () => {
  const windows = FIELD.field.axes.map((a, i) => ({
    pairLabel: a.pairLabel,
    window: REPORTS.HUIDIG.predesign.windows[i],
    recommendedHz: recommendedBand(REPORTS.HUIDIG.predesign.windows[i]).effectiveHz,
  }));

  it('no generated candidate lies outside a feasible window', () => {
    const estimate = candidatesOutsideWindows(
      FIELD.field.candidates.map((c) => ({ label: c.label, hz: c.crossings.map((x) => x.hz) })),
      windows,
    );
    expect(estimate.total).toBe(115);
    expect(estimate.outside).toBe(0);
    for (const axis of estimate.perAxis) expect(axis.outside).toBe(0);
  });

  it('some DO lie outside the F3c recommended band, and that divergence is the point', () => {
    /* This read zero until the F4d follow-up, and the change is worth stating
     * rather than absorbing. The hard line — outside a feasible WINDOW — is
     * still zero and always will be: a candidate outside the window is
     * something the generator cannot express. The weaker line compares against
     * the F3c RECOMMENDATION, which still cuts the worst lobing zone out
     * because `recommendedBand.ts` is untouched (the dialog a designer reads
     * has not changed). With the generator's own excision suspended (V28) the
     * two now disagree, and the estimator says so.
     *
     * That is the behaviour to want while V28 is open. A suspension that
     * silenced the estimator as well would leave nothing on screen saying the
     * field and the recommendation have parted company. */
    const estimate = candidatesOutsideWindows(
      FIELD.field.candidates.map((c) => ({ label: c.label, hz: c.crossings.map((x) => x.hz) })),
      windows,
    );
    expect(estimate.outsideRecommended).toBeGreaterThan(0);
    expect(estimate.message).not.toBeNull();
    // ...and it is the UPPER axis that diverges, because that is the axis
    // whose window the worst lobing zone sits inside.
    expect(estimate.perAxis[0].outsideRecommended).toBe(0);
    expect(estimate.perAxis[1].outsideRecommended).toBeGreaterThan(0);
  });

  it('the same estimator DOES report the v1 physics window, so zero means something', () => {
    /* The counter-proof, and it is the audit's own case. The v1 floor for this
     * pair is the woofer's near-field/far-field splice blend at 707 Hz, so a
     * candidate generated from the v1 window hands over above the A5d.3
     * ceiling of 548 Hz. Four of four, live, on the KOAN project — reproduced
     * here as a statement about the estimator rather than about the run. */
    const v1Style = [707, 715, 721, 728].map((hz) => ({
      label: `v1 window ${hz} Hz`,
      hz: [hz, 2000] as (number | null)[],
    }));
    const estimate = candidatesOutsideWindows(v1Style, windows);
    expect(estimate.total).toBe(4);
    expect(estimate.outside).toBe(4);
    expect(estimate.message).toContain('4 of 4');
  });
});

describe('the comparison block — reporting, and nothing else', () => {
  const table = compareDesigns([
    { label: 'HUIDIG', origin: 'baseline', report: REPORTS.HUIDIG },
    { label: 'KAND-A', origin: 'baseline', report: REPORTS.KAND_A },
    { label: 'KAND-B', origin: 'baseline', report: REPORTS.KAND_B },
  ]);

  it('every column is a metric-register quantity, computed by the same assembly', () => {
    expect(table.columns).toEqual(COMPARISON_COLUMNS);
    for (const row of table.rows) {
      for (const col of table.columns) expect(row.cells[col.key]).toBeDefined();
    }
  });

  it('reproduces the casebook numbers for the three baselines', () => {
    const TOL = golden.toleranties;
    const REF = golden.kandidaten as Record<string, Record<string, number>>;
    const at = (label: string, key: string) => table.rows.find((r) => r.label === label)!.cells[key];
    // min |Z| and min EPDR — the casebook's own pair, on all three designs.
    expect(Math.abs(at('HUIDIG', 'minZ').value! - REF.HUIDIG_2e.minZ)).toBeLessThanOrEqual(TOL.ohm);
    expect(Math.abs(at('HUIDIG', 'minEpdr').value! - REF.HUIDIG_2e.minEPDR)).toBeLessThanOrEqual(TOL.ohm);
    expect(Math.abs(at('KAND-A', 'minZ').value! - REF.KAND_A_2e.minZ)).toBeLessThanOrEqual(TOL.ohm);
    expect(Math.abs(at('KAND-B', 'minEpdr').value! - REF.KAND_B_3e.minEPDR)).toBeLessThanOrEqual(TOL.ohm);
  });

  it('does not rank: the row order is the order given, whatever the numbers say', () => {
    expect(table.rows.map((r) => r.label)).toEqual(['HUIDIG', 'KAND-A', 'KAND-B']);
    const reversed = compareDesigns([
      { label: 'KAND-B', origin: 'baseline', report: REPORTS.KAND_B },
      { label: 'HUIDIG', origin: 'baseline', report: REPORTS.HUIDIG },
    ]);
    expect(reversed.rows.map((r) => r.label)).toEqual(['KAND-B', 'HUIDIG']);
    // No column, no field and no note claims a winner.
    expect(JSON.stringify(table).toLowerCase()).not.toContain('"best"');
    expect(table.note).toMatch(/Nothing in this table is ranked/);
  });

  it('candidates are listed AFTER the baselines — reading order, not merit', () => {
    const mixed = compareDesigns([
      { label: 'KAND-V2-1', origin: 'v2-candidate', report: REPORTS.KAND_B, provenance: 'test' },
      { label: 'HUIDIG', origin: 'baseline', report: REPORTS.HUIDIG },
    ]);
    expect(mixed.rows.map((r) => r.origin)).toEqual(['baseline', 'v2-candidate']);
    expect(mixed.rows[1].provenance).toBe('test');
  });

  it('a value that could not be computed says WHY, rather than reading as a good one', () => {
    /* V23's lesson as a table cell. `M-D` needs a near-field measurement of the
     * way it evaluates; where casus 1 has one the cell carries a number, and a
     * design where it did not would carry the reason instead — never a blank
     * that a reader could take for "no lift". */
    for (const row of table.rows) {
      for (const col of table.columns) {
        const c = row.cells[col.key];
        if (c.value === null) expect(c.absentReason!.length).toBeGreaterThan(20);
        else expect(c.absentReason).toBeNull();
      }
    }
  });
});
