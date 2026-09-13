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
  casus1ExcursionSettings,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  casus1MaxDriveOnFsDbByDriver,
  loadGolden,
} from '../casus1.fixture.ts';
import { buildReport, type EngineV2Report } from '../report.ts';
import { ctcKey } from '../metrics/types.ts';
import { FLAT_TARGET } from '../requirements/targetCurve.ts';
import { CASUS1_FIELD_CHAIN_BUDGET, CASUS1_FIELD_STATED_ORDER, CASUS1_WINDOW_SETTINGS, casus1Field } from '../casus1V2.fixture.ts';
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
      /* A5e.3-veld — the excursion inputs: the woofer→mid window stands on the
       * mid's excursion ceiling (V49) since A5e.3-veld, and a report without
       * the inputs derives no ceiling and builds M-1's field. Read, never
       * written here (P6). */
      ...casus1ExcursionSettings(golden),
      /* A5e.3b — the stated M-C figure per way: the mid→tweeter window stands
       * on the STRICTEST of stated and derived since A5e.3b, and a report
       * without the figure builds A5e.3-veld's field. Read, never written
       * here (P6). */
      ...(Object.keys(casus1MaxDriveOnFsDbByDriver(golden)).length > 0
        ? { maxDriveOnFsDbByDriver: casus1MaxDriveOnFsDbByDriver(golden) }
        : {}),
      /* E-1 — a stated ceiling per pair, when the project states one (unstated
       * today): the mirror of the stated-figure floor, read the same way. */
      ...CASUS1_WINDOW_SETTINGS,
    },
  });

const REPORTS = { HUIDIG: report('HUIDIG'), KAND_A: report('KAND_A'), KAND_B: report('KAND_B') };

/* M-1 — THE FIELD IS THE FIXTURE'S (`casus1Field`). Until M-1 this file built
 * its own field with the stated order on both axes; a second definition of the
 * field is a second opinion about what the corpus was generated from. M-1 let
 * the woofer→mid axis abstain (LR2 and LR4); A5e.3-veld states order 4 on both
 * axes again, bounds the woofer→mid window below by the mid's excursion ceiling
 * and thins the field to a stated chain budget — see the fixture. */
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
    const wm = golden.kruisvensters.woofer_mid_orde4 as unknown as { venster: [number, number]; vloer_bindend: string; _k_fs_tot_A5e3veld: { venster: [number, number] } };
    const mt = golden.kruisvensters.mid_tweeter_orde4 as unknown as { venster: [number, number]; vloer_bindend: string };
    const win = (i: number, order: string) => axes[i].window[order];
    // Within the reference file's own frequency tolerance class — a window edge
    // is a reference, and a test that carried its own tolerance could quietly
    // widen one (the F4a discipline).
    const pct = golden.toleranties.frequenties_pct / 100;
    const near = (got: number, want: number) => Math.abs(got / want - 1) <= pct;
    expect(near(win(0, '4').floorHz!, wm.venster[0])).toBe(true);
    expect(near(win(0, '4').ceilingHz!, wm.venster[1])).toBe(true);
    /* A5e.3-veld — the lower axis stands on the DRIVE floor (the mid's excursion
     * ceiling, A5d.3(ii) inverted) and that lies ABOVE M-1's k·f_s floor, which
     * the reference keeps as its bridge. A5e.3b — the upper axis stands on the
     * STATED figure's floor now (the strictest of stated and derived): the
     * tweeter's excursion floor lies under k·f_s, but the stated −20 dB at the
     * stated order inverts to ~1647 Hz, above it. */
    expect(win(0, '4').floorBy!.rule).toBe('drive');
    expect(wm.vloer_bindend).toBe('aandrijving_excursie');
    expect(win(0, '4').floorHz!).toBeGreaterThan(wm._k_fs_tot_A5e3veld.venster[0]);
    expect(near(win(1, '4').floorHz!, mt.venster[0])).toBe(true);
    expect(near(win(1, '4').ceilingHz!, mt.venster[1])).toBe(true);
    /* M-2b — the M-T floor is the manufacturer's recommended lower bound now
     * (2200 Hz, BlieSMa, verbatim at the stated order). U-4 registered the
     * figure and refused to feed it because feeding it is a different field;
     * this is that regeneration. */
    expect(win(1, '4').floorBy!.rule).toBe('stated-min');
    expect(mt.vloer_bindend).toBe('aanbevolen_ondergrens');
    // ...and the two earlier floors stay as bridges, each stricter than the last.
    const mtBridge = (golden.kruisvensters.mid_tweeter_orde4 as unknown as { _excursievloer_tot_A5e3b: { venster: [number, number]; vloer_bindend: string } })._excursievloer_tot_A5e3b;
    const mtM2b = (golden.kruisvensters.mid_tweeter_orde4 as unknown as { _afgeleide_vloer_tot_M2b: { venster: [number, number]; vloer_bindend: string } })._afgeleide_vloer_tot_M2b;
    expect(mtBridge.vloer_bindend).toBe('fs');
    expect(mtM2b.vloer_bindend).toBe('aandrijving_gesteld');
    expect(win(1, '4').floorHz!).toBeGreaterThan(mtM2b.venster[0]);
    expect(mtM2b.venster[0]).toBeGreaterThan(mtBridge.venster[0]);
    // Order 4 is STATED on both axes since A5e.3-veld: no second-order window is built.
    expect(axes[0].window['2']).toBeUndefined();
    expect(axes[1].window['2']).toBeUndefined();
  });

  it('places eleven LR4 positions on the lower axis and ONE on the upper, under a budget of 16 that no longer binds', () => {
    /* The count is derived: `1 + floor(span / smoothing)`, over the stretch a
     * position may SIT on, per order. Since C-2 that stretch is the A5d.3
     * window INSET by half a spacing on each side, because every cage is one
     * spacing wide and two-sided and has to fit inside the window.
     *
     * M-2b — THE UPPER AXIS COLLAPSED TO ONE POSITION, and the budget stopped
     * binding as a result. The mid→tweeter window was 1647–2304 Hz (0.48
     * octaves, room for two two-sided cages); with the tweeter's recommended
     * lower bound fed it is 2200–2304 Hz — 0.067 octaves, which holds exactly
     * one. The lower axis is unchanged at eleven, so the field is 11 × 1 = 11,
     * BELOW the stated budget of 16: nothing is thinned, and what made the
     * field smaller is a GRENS and not a begroting. The C-2 field was
     * 8 × 2 = 16 out of 22 offered, with the lower axis thinned from eleven. */
    const wm = FIELD.field.axes[0].positionsByOrder;
    const mt = FIELD.field.axes[1].positionsByOrder;
    expect(FIELD.field.axes[0].orders).toEqual([CASUS1_FIELD_STATED_ORDER]);
    expect(FIELD.field.axes[1].orders).toEqual([CASUS1_FIELD_STATED_ORDER]);
    expect(wm).toHaveLength(1);
    expect(mt).toHaveLength(1);
    expect(wm[0].derivedCount).toBe(11);
    expect(wm[0].count).toBe(11);
    expect(mt[0].derivedCount).toBe(1);
    expect(mt[0].count).toBe(1);
    expect(FIELD.field.parameters.chainBudget).toBe(CASUS1_FIELD_CHAIN_BUDGET);
    expect(FIELD.field.parameters.positionPolicy).toBe('two-sided');
    expect(FIELD.field.parameters.derivedSize).toBe(11);
    expect(FIELD.field.parameters.deliveredSize).toBe(wm[0].count * mt[0].count);
    expect(FIELD.field.candidates).toHaveLength(11);
    expect(FIELD.field.candidates.length).toBeLessThan(CASUS1_FIELD_CHAIN_BUDGET);
    /* NOTHING WAS THINNED, so the thinning note must NOT be there — the
     * counter-proof, since "no note" is also true of a field that lost its
     * accounting. */
    expect(FIELD.notes.join(' ')).not.toContain('are delivered');
    expect(FIELD.field.parameters.derivedSize).toBe(FIELD.field.parameters.deliveredSize);
    // The lowest position is the drive floor itself, and no position lies under it.
    for (const h of wm[0].hz) expect(h).toBeGreaterThanOrEqual(FIELD.field.axes[0].window['4'].floorHz! - 0.5);

    /* C-2 — EVERY CAGE IS TWO-SIDED AND INSIDE THE WINDOW, on both axes, and
     * that is the whole point of the policy: a candidate on a band edge could
     * be judged in one direction only, and E-1 measured the field behaving
     * accordingly (every delivered network on the 2304 Hz ceiling position
     * crossed 61–255 Hz lower). The extreme cages TOUCH the window edges —
     * that is the inset working — and none crosses them. */
    for (const c of FIELD.field.candidates) {
      for (let i = 0; i < c.crossings.length; i++) {
        const x = c.crossings[i];
        const w = FIELD.field.axes[i].window['4'];
        expect(x.twoSided, `${x.pairLabel} @ ${x.hz} Hz`).toBe(true);
        expect(x.cageHz[0]).toBeGreaterThanOrEqual(w.floorHz! - 0.05);
        expect(x.cageHz[1]).toBeLessThanOrEqual(w.ceilingHz! + 0.05);
        expect(x.hz).toBeGreaterThan(x.cageHz[0]);
        expect(x.hz).toBeLessThan(x.cageHz[1]);
      }
    }
    // ...and the provenance says so rather than leaving it to be re-derived.
    expect(FIELD.field.candidates[0].provenance).toContain('laid two-sided');
    /* M-2b — THE UPPER CAGE IS THE WHOLE WINDOW, and the provenance says which
     * kind of edge that is. C-2's claim was that no cage is CLIPPED — asked
     * half a question because the generator ran out of band on one side. The
     * mid→tweeter window is now narrower than one spacing, so its single cage
     * spans it end to end and touches BOTH edges, which is the honest answer
     * to "where may this handover sit" rather than a clipping. The lower axis,
     * where there is room, carries no such cage at all. */
    const mtCage = FIELD.field.candidates[0].crossings[1];
    /* Rounded to the printed hertz on the ceiling: the generator rounds the
     * cage edge it reports and the window keeps the full float. */
    expect(mtCage.cageHz[0]).toBe(FIELD.field.axes[1].window['4'].floorHz);
    expect(mtCage.cageHz[1]).toBeCloseTo(FIELD.field.axes[1].window['4'].ceilingHz!, 1);
    expect(FIELD.field.candidates[0].provenance).toContain('the whole band: one-sided at both edges');
    for (const c of FIELD.field.candidates) {
      const wm = c.crossings[0];
      const wmWin = FIELD.field.axes[0].window['4'];
      expect(wm.cageHz[0] > wmWin.floorHz! || wm.cageHz[1] < wmWin.ceilingHz!).toBe(true);
    }
    // The stated order is said out loud on both axes.
    expect(FIELD.orders[0].why.join(' ')).toContain('the designer stated');
    expect(FIELD.orders[1].why.join(' ')).toContain('the designer stated');
    // Every candidate names LR4 on both axes — the library was LR-only and the order stated.
    for (const c of FIELD.field.candidates) for (const x of c.crossings) {
      expect(x.alignment.kind).toBe('LR');
      expect(x.order).toBe(CASUS1_FIELD_STATED_ORDER);
    }
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
    /* M-2b — ONE SEGMENT, AND SINCE M-2b IT LIES ENTIRELY OUTSIDE THE ZONE.
     * At A5e.3b the stated-figure floor (1647 Hz) landed INSIDE the worst
     * lobing zone (~1327–1858 Hz on 129.2 mm) and the zone cut the
     * recommendation at its bottom edge. The manufacturer's recommended lower
     * bound (2200 Hz) sits above the zone altogether, so the whole window is
     * clear of it and NO candidate sits inside it any more. `recommendedBand`
     * itself is untouched — what moved is the window it is given. */
    expect(rec.segments).toHaveLength(1);
    const zone = rec.worstZoneHz!;
    const inZone = FIELD.field.candidates.filter(
      (c) => c.crossings[1].hz > zone[0] && c.crossings[1].hz < zone[1],
    );
    expect(inZone).toHaveLength(0);
    expect(FIELD.field.axes[1].window['4'].floorHz!).toBeGreaterThan(zone[1]);
    expect(rec.segments[0].reasons.join(' ')).toContain('outside the worst lobing zone');

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
    expect(estimate.total).toBe(FIELD.field.candidates.length);
    expect(estimate.outside).toBe(0);
    for (const axis of estimate.perAxis) expect(axis.outside).toBe(0);
  });

  it('since M-2b NONE lie outside the F3c recommended band either — and the estimator still can say so', () => {
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
    /* M-2b — ZERO, and that is the state the claim now records. Until M-2b the
     * mid→tweeter window ran from 1647 Hz, which lands INSIDE the worst lobing
     * zone (1327–1858 Hz), so part of the field sat outside the F3c
     * recommendation and the divergence between window and recommendation was
     * visible in the field itself. The manufacturer's recommended lower bound
     * (2200 Hz) lifts the whole window clear of that zone, so every candidate
     * is now inside the recommendation as well.
     *
     * The claim this test makes is unchanged — window and recommendation are
     * DIFFERENT questions — and the counter-proof moves to where it can still
     * be measured: the recommendation is strictly narrower than the window on
     * the LOWER axis, where the zone still bites. */
    expect(estimate.outsideRecommended).toBe(0);
    for (const axis of estimate.perAxis) expect(axis.outsideRecommended).toBe(0);
    /* THE COUNTER-PROOF, and it is what keeps the zero from being a silence.
     * The worst lobing zone is still THERE and still travels with every
     * candidate of the upper axis; what changed is that the window no longer
     * reaches into it. Both halves are asserted — the zone exists, and the
     * window's floor is above its top — so a version that simply stopped
     * computing zones would not pass. */
    const zone = FIELD.field.axes[1].recommended['4'].worstZoneHz!;
    expect(zone[1]).toBeGreaterThan(zone[0]);
    expect(FIELD.field.axes[1].window['4'].floorHz!).toBeGreaterThan(zone[1]);
    for (const c of FIELD.field.candidates) {
      expect(c.crossings[1].excisions).toHaveLength(1);
      expect(c.crossings[1].excisions[0].hz).toEqual(zone);
      expect(c.crossings[1].excisions[0].applied).toBe(false);
    }
    /* ...and the estimator has not gone silent. That it still REPORTS on a
     * field that diverges is measured in the next test, on the v1 window, and
     * is not re-asserted here with a synthetic candidate: one below the
     * window's floor counts as outside the WINDOW, which is a different
     * column and would make this claim pass for the wrong reason. */
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
