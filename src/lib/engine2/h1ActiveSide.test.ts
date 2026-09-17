import { describe, expect, it } from 'vitest';
import { buildReport, type ReportSettings } from './report.ts';
import { dspTargetBlock, describeDspTarget, polarityDecisiveDb } from './dspTarget.ts';
import { modelBranchResponse } from '../activeSide.ts';
import {
  ACTIVE_WAY,
  CASUS1H_ACTIVE,
  CASUS1H_MERGE_FIT_UNCERTAINTY_DEG,
  CASUS1H_REPORT_SETTINGS,
  CASUS1H_V2_BAND_SOURCE,
  PASSIVE_LOWEST_WAY,
  casus1hActiveAt,
  casus1hFiles,
  casus1hGeometry,
  casus1hManifest,
  casus1hReport,
  casus1hSettingsAt,
  loadGolden1h,
} from './casus1h.fixture.ts';

const golden = loadGolden1h();
const manifest = casus1hManifest();
const files = casus1hFiles(manifest);
const geometry = casus1hGeometry(golden);
const LIVE = Object.keys(golden.manifest_en_geometrie.netlists).filter((k) => /^H_KAND_\d+$/.test(k));
const handoverOf = (key: string): number => {
  const hz = (golden.kandidaten[key] as { actieve_overname_hz?: number } | undefined)?.actieve_overname_hz;
  if (hz === undefined) throw new Error(`casus 1h: ${key} has no recorded active handover`);
  return hz;
};

/** The same report settings WITHOUT the stated block — the app as it was (P4). */
const bareSettings: ReportSettings = (() => {
  const s = { ...CASUS1H_REPORT_SETTINGS };
  delete (s as { activeHandover?: unknown }).activeHandover;
  return s;
})();

describe('H-1 — the modelled active branch inside the report', () => {
  it('P4 — no stated block, no active side, and every sum is the passive network alone', () => {
    const bare = buildReport({ manifest, files, filter: null, geometry, settings: bareSettings });
    expect(bare.activeSide).toBeNull();
    /* And the report is the ordinary one it always was: three measured ways,
     * two windows, nothing modelled. */
    expect(bare.driversLowToHigh).toEqual(['woofer', 'mid', 'tweeter']);
  });

  it('the derivation runs WITHOUT a netlist — class A, so no candidate can move it', () => {
    for (const hz of CASUS1H_ACTIVE.positionsHz) {
      const a = casus1hReport(null, manifest, files, golden, casus1hSettingsAt(hz)).activeSide;
      expect(a, `no active side at ${hz} Hz`).not.toBeNull();
      expect(a!.off).toEqual([]);
      expect(a!.settings).not.toBeNull();
      /* Without a netlist there is nothing to re-fit against, and the field says
       * so rather than holding a stale number. */
      expect(a!.deliveredRefit).toBeNull();
      expect(a!.passiveOnlySumDb).toBeNull();
    }
  });

  it('THE DELAY AND THE POLARITY ARE CLASS A; THE GAIN IS A LEVEL MATCH ON WHAT WAS BUILT', () => {
    /* The split this route turns on. The delay and the polarity are the
     * ALIGNMENT and a search could genuinely abuse them, so they are derived
     * before anything runs and are the same number on every netlist. The gain
     * is a LEVEL MATCH — the same normalisation `bandStd` performs on the sum,
     * applied to the one branch whose level lives in a processor — so it is a
     * property of the network in front of you and differs per netlist. */
    for (const key of LIVE) {
      const hz = handoverOf(key);
      const s = casus1hReport(key, manifest, files, golden, casus1hSettingsAt(hz)).activeSide!;
      const bare = casus1hActiveAt(hz, manifest, files).settings;
      expect(s.settings!.delayMs, `${key}: the delay moved with the netlist`).toBeCloseTo(bare.delayMs, 12);
      expect(s.settings!.inverted, `${key}: the polarity moved with the netlist`).toBe(bare.inverted);
      /* And the gain DID move — the realisation costs level, measured at H-1 as
       * 2.3 to 3.2 dB. `classAGainDb` is what the stated shape alone asked. */
      expect(s.classAGainDb).toBeCloseTo(bare.gainDb, 12);
      expect(Math.abs(s.settings!.gainDb - s.classAGainDb!), `${key}: the realisation costs no level`).toBeGreaterThan(0.5);
    }
    /* Without a netlist there is nothing to level against, and the published
     * gain is then the class-A one — the honest state, not a stale number. */
    const noNet = casus1hReport(null, manifest, files, golden, casus1hSettingsAt(CASUS1H_ACTIVE.positionsHz[0])).activeSide!;
    expect(noNet.settings!.gainDb).toBeCloseTo(noNet.classAGainDb!, 12);
  });

  it('THE SEPARATION IS STRUCTURAL: the model joins every ACOUSTIC quantity and NO electrical one', () => {
    /* The dragging claim of this file. The modelled branch is added to
     * `branchComplex` after the passive loop and `analysis.transferByModel` is
     * never touched, so this is a property of where the code puts it — but a
     * property nobody measures is a property that stops holding. */
    const key = LIVE[0];
    expect(key, 'no live casus-1h netlist to measure on').toBeDefined();
    const hz = handoverOf(key);
    const withA = casus1hReport(key, manifest, files, golden, casus1hSettingsAt(hz));
    const noA = casus1hReport(key, manifest, files, golden, bareSettings);

    /* ELECTRICAL — byte for byte. */
    expect(withA.metrics.dissipation?.totalFraction).toBe(noA.metrics.dissipation?.totalFraction);
    expect(withA.metrics.epdr?.minZOhm).toBe(noA.metrics.epdr?.minZOhm);
    expect(withA.metrics.epdr?.minOhm).toBe(noA.metrics.epdr?.minOhm);
    expect(JSON.stringify(withA.metrics.buildability)).toBe(JSON.stringify(noA.metrics.buildability));
    expect(JSON.stringify(withA.metrics.thermalLoad)).toBe(JSON.stringify(noA.metrics.thermalLoad));
    expect(JSON.stringify(withA.metrics.thevenin)).toBe(JSON.stringify(noA.metrics.thevenin));
    /* EVERY PURELY ELECTRICAL GATE IDENTICAL, and M-C is the one exception —
     * which this test found rather than assumed. M-C's quantity is the drive on
     * a way's own resonance RELATIVE TO ITS PASSBAND, and a passband is bounded
     * by the CROSSINGS. On a hybrid the mid's passband is bounded below by the
     * active handover, so both the reading and the derived limit move: −14.90
     * against −1.71 without the model, −25.95 against −12.76 with it. That is
     * not a leak, it is the protection the handover buys, and it is the whole
     * reason M-C can judge the mid here at all (step 0, d). */
    const ELECTRICAL = ['M-A', 'M-B/EPDR', 'M-B/|Z|', 'M-A/part', 'M-L'];
    const verdicts = (r: typeof withA) =>
      JSON.stringify(
        r.gates.verdicts
          .filter((v) => ELECTRICAL.includes(v.gate))
          .map((v) => [v.gate, v.subject, v.value, v.limit, v.active, v.pass]),
      );
    expect(verdicts(withA)).toBe(verdicts(noA));
    /* And the exception is EXACTLY M-C, named, so a second one cannot appear
     * unnoticed. */
    const moved = withA.gates.verdicts.filter((v) => {
      const b = noA.gates.verdicts.find((x) => x.gate === v.gate && x.subject === v.subject);
      return !b || b.value !== v.value || b.limit !== v.limit;
    });
    expect([...new Set(moved.map((v) => v.gate))]).toEqual(['M-C']);
    expect(moved.map((v) => v.subject)).toEqual([PASSIVE_LOWEST_WAY]);

    /* ACOUSTIC — aantoonbaar different, or the model is decoration (V23). */
    expect(withA.system.sumDb).not.toBeNull();
    expect(JSON.stringify(withA.system.sumDb)).not.toBe(JSON.stringify(noA.system.sumDb));
    expect(withA.system.branches!.length).toBe(noA.system.branches!.length + 1);
    expect(withA.system.branches!.map((b) => b.driver)).toContain(ACTIVE_WAY);
    expect(noA.system.branches!.map((b) => b.driver)).not.toContain(ACTIVE_WAY);
    /* Two handovers instead of one, and the extra one is the active pair. */
    expect(withA.system.phaseTracking.length).toBe(noA.system.phaseTracking.length + 1);
    expect(withA.system.phaseTracking.some((p) => p.lower === ACTIVE_WAY && p.upper === PASSIVE_LOWEST_WAY)).toBe(true);
  });

  it('the passive-only sum is the same arithmetic on the passive branches, not a re-derivation', () => {
    const key = LIVE[0];
    const hz = handoverOf(key);
    const withA = casus1hReport(key, manifest, files, golden, casus1hSettingsAt(hz));
    const noA = casus1hReport(key, manifest, files, golden, bareSettings);
    expect(withA.activeSide!.passiveOnlySumDb).not.toBeNull();
    /* Identical to the sum a report without the stated block produces — which is
     * what makes "what the model contributes" a subtraction a reader can do. */
    expect(JSON.stringify(withA.activeSide!.passiveOnlySumDb)).toBe(JSON.stringify(noA.system.sumDb));
  });

  it('the modelled branch IS the measurement times the stated transfer — on the report grid', () => {
    const key = LIVE[0];
    const hz = handoverOf(key);
    const rep = casus1hReport(key, manifest, files, golden, casus1hSettingsAt(hz));
    const a = rep.activeSide!;
    const src = rep.ingest.drivers.find((d) => d.driver === ACTIVE_WAY)!.onAxisFull!;
    const grid = rep.analysisGrid!;
    const measuredOnGrid = {
      freq: [...grid],
      spl: grid.map((f) => {
        /* Log interpolation, the report's own `interpLog` in the one form a test
         * may restate: the endpoints clamp and the interior is linear in log f. */
        let i = 0;
        while (i + 2 < src.grid.length && src.grid[i + 1] < f) i++;
        const t = Math.log(f / src.grid[i]) / Math.log(src.grid[i + 1] / src.grid[i]);
        const u = Math.min(1, Math.max(0, t));
        return src.db[i] + (src.db[i + 1] - src.db[i]) * u;
      }),
      phaseDeg: grid.map(() => 0),
    };
    const model = modelBranchResponse(measuredOnGrid, {
      ...a.settings!,
      kind: a.stated.kind,
      order: a.stated.order,
      hz: a.stated.hz,
    });
    const branch = rep.system.branches!.find((b) => b.driver === ACTIVE_WAY)!;
    /* The LEVEL is the product, within the interpolation this test does by hand
     * (the report's own is the same rule; the tolerance is that restatement and
     * nothing else). */
    for (let i = 20; i < grid.length - 20; i += 17) {
      expect(branch.db[i]).toBeCloseTo(model.spl[i], 1);
    }
  });

  it('M-C protects the MID on a hybrid — the thing casus 1 and casus 1b cannot show', () => {
    for (const key of LIVE) {
      const hz = handoverOf(key);
      const rep = casus1hReport(key, manifest, files, golden, casus1hSettingsAt(hz));
      expect(rep.gates.highPassProtected, `${key}`).toContain(PASSIVE_LOWEST_WAY);
      /* And NEVER the active way: it has no branch in this netlist, so there is
       * nothing for the derivation to read. */
      expect(rep.gates.highPassProtected).not.toContain(ACTIVE_WAY);
      const mc = rep.gates.verdicts.find((v) => v.metric === 'M-C' && v.subject === PASSIVE_LOWEST_WAY);
      expect(mc, `${key}: no M-C verdict on ${PASSIVE_LOWEST_WAY}`).toBeDefined();
      expect(mc!.value).not.toBeNull();
    }
  });

  it('M-D has no quantity on a hybrid, and the report says that rather than leaving a row empty', () => {
    const key = LIVE[0];
    const hz = handoverOf(key);
    const rep = casus1hReport(key, manifest, files, golden, casus1hSettingsAt(hz));
    /* The metric reads a BRANCH of the netlist, and the active way has none. */
    expect(rep.metrics.lfBump.some((x) => x.driver === ACTIVE_WAY)).toBe(false);
    const block = golden.manifest_en_geometrie.h1_md_vervalt as { budget_niet_gewapend?: boolean } | undefined;
    expect(block?.budget_niet_gewapend).toBe(true);
    /* And the requirement is filed as NOT CARRIED, with its reason — a
     * requirement that is simply missing and one that is deliberately not
     * stated look the same in a report unless somebody writes it down. */
    const niet = (golden.manifest_en_geometrie.gestelde_eisen as { niet_overgenomen?: Record<string, unknown> }).niet_overgenomen;
    expect(typeof niet?.lf_opslingering_budget_dB).toBe('string');
    expect(String(niet!.lf_opslingering_budget_dB)).toMatch(/seriespoel|serie-?spoel/i);
  });

  it('the judged band starts at the ACTIVE way — it is the lowest way of the system', () => {
    expect(CASUS1H_V2_BAND_SOURCE.lowest).toBe(ACTIVE_WAY);
    /* Its f_p starts the band and its validity floor the grid (E-5), and that a
     * way is not in the netlist changes nothing about where it plays. */
    expect(CASUS1H_V2_BAND_SOURCE.floorHz).toBeGreaterThan(CASUS1H_V2_BAND_SOURCE.validityFloorHz);
  });

  it('every stated position lies inside the derived window of the active handover', () => {
    const rep = casus1hReport(null, manifest, files, golden, casus1hSettingsAt(CASUS1H_ACTIVE.positionsHz[0]));
    const w = rep.predesign.windows.find((x) => x.lower === ACTIVE_WAY && x.upper === PASSIVE_LOWEST_WAY);
    expect(w, 'no active-pair window').toBeDefined();
    for (const hz of CASUS1H_ACTIVE.positionsHz) {
      expect(hz, `${hz} Hz is below the window floor`).toBeGreaterThanOrEqual(w!.floorHz!);
      expect(hz, `${hz} Hz is above the window ceiling`).toBeLessThanOrEqual(w!.ceilingHz!);
    }
  });

  it('the DSP block carries the judged settings, the delivered re-fit, and the caveats that matter', () => {
    for (const key of LIVE) {
      const hz = handoverOf(key);
      const rep = casus1hReport(key, manifest, files, golden, casus1hSettingsAt(hz));
      const b = dspTargetBlock(rep, { mergeFitUncertaintyDeg: CASUS1H_MERGE_FIT_UNCERTAINTY_DEG ?? undefined })!;
      expect(b.activeWay).toBe(ACTIVE_WAY);
      expect(b.passiveWay).toBe(PASSIVE_LOWEST_WAY);
      expect(b.lowPass.hz).toBeCloseTo(hz, 9);
      /* The re-fit is a READING and exists — with a netlist there is a delivered
       * branch to fit against. */
      expect(b.deliveredRefit, `${key}: no delivered re-fit`).not.toBeNull();
      const text = describeDspTarget(b).join('\n');
      /* The cabinet sentence is not optional. */
      expect(text).toMatch(/DEEPEST NULL/);
      /* AND IT LEADS WITH WHAT TO DIAL IN, not with what the run was judged
       * with — on casus 1h those delays differ by up to 0.93 ms, and the
       * headline is where a designer reads the number they type. */
      const head = describeDspTarget(b).slice(0, 6).join('\n');
      expect(head).toContain(b.deliveredRefit!.delayMs.toFixed(3));
      expect(head).toMatch(/re-fitted on the DELIVERED network/);
      /* A NEGATIVE delay must say what to do about it: no processor advances. */
      if (b.deliveredRefit!.delayMs < 0) expect(text).toMatch(/delay the\s+passive ways/);
      /* A polarity chosen by less than the merge-fit uncertainty says so. */
      if (b.polarity.marginDb !== null && b.polarity.decisiveDb !== null && b.polarity.marginDb < b.polarity.decisiveDb) {
        expect(text).toMatch(/NOT DECIDED BY THE DATA/);
      }
    }
  });

  it('THE DIALLED DELAY IS THE ONE THE LOUDSPEAKER GETS, and it is measurably better than the judged one', () => {
    /* THE HEADLINE OF H-1, and the reason `activeSideSettings` exists. The
     * search is steered with the class-A delay — derived before any network
     * existed, so no candidate can move the sum it is judged on — and the
     * REALISED high-pass carries phase the stated shape does not. So the
     * delivered network prefers a different delay, and that is the one a
     * designer dials in. Measured on casus 1h: M-K on the active handover goes
     * from 36-78 degrees as judged to 9-17 degrees as dialled, and the
     * delivered crossing lands on the stated handover instead of well above it.
     *
     * A decision table that printed only the judged number would report a
     * hybrid as far worse on phase than the fully passive corpus, which is the
     * opposite of what it does. */
    for (const key of LIVE) {
      const hz = handoverOf(key);
      const rep = casus1hReport(key, manifest, files, golden, casus1hSettingsAt(hz));
      const refit = rep.activeSide!.deliveredRefit!;
      const dialled = casus1hReport(key, manifest, files, golden, {
        ...casus1hSettingsAt(hz),
        activeSideSettings: refit.settings,
      });
      const pairOf = (r: typeof rep) =>
        r.system.phaseTracking.find((p) => p.lower === ACTIVE_WAY && p.upper === PASSIVE_LOWEST_WAY)!;
      const judged = pairOf(rep);
      const dial = pairOf(dialled);
      expect(dial.meanAbsDeg, `${key}: dialling the delivered delay did not improve M-K`).toBeLessThan(judged.meanAbsDeg);
      /* And the handover lands where it was stated, within a sixth of an octave
       * — the sharpest statement that the alignment is right. */
      expect(Math.abs(Math.log2(dial.crossingHz / hz)), `${key}: the dialled crossing is not at the stated handover`).toBeLessThan(1 / 6);
    }
  });

  it('a STATED DSP setting wins over the derivation, and absent is the derivation (P4)', () => {
    const hz = CASUS1H_ACTIVE.positionsHz[0];
    const key = LIVE[0];
    const derived = casus1hReport(key, manifest, files, golden, casus1hSettingsAt(hz)).activeSide!.settings!;
    const stated = casus1hReport(key, manifest, files, golden, {
      ...casus1hSettingsAt(hz),
      activeSideSettings: { delayMs: derived.delayMs + 0.25 },
    }).activeSide!.settings!;
    expect(stated.delayMs).toBeCloseTo(derived.delayMs + 0.25, 12);
    /* And stating one does not silently re-level the gain on top of it: a
     * caller that says what the processor is set to is not asking for an
     * estimate of it. */
    expect(stated.inverted).toBe(derived.inverted);
  });

  it('the polarity threshold is DERIVED from the project\'s own merge-fit uncertainty, not chosen', () => {
    /* Two branches θ apart sum to 2·cos(θ/2) instead of 2, so the null margin
     * loses exactly −20·log10(cos(θ/2)). A threshold nobody can re-derive is a
     * threshold nobody checks — and the INPUT comes from the casus file, never
     * from engine code (P6). */
    expect(CASUS1H_MERGE_FIT_UNCERTAINTY_DEG, 'casus 1h states no merge-fit uncertainty').not.toBeNull();
    const deg = CASUS1H_MERGE_FIT_UNCERTAINTY_DEG!;
    expect(polarityDecisiveDb(deg)).toBeCloseTo(-20 * Math.log10(Math.cos((deg / 2) * (Math.PI / 180))), 9);
    expect(polarityDecisiveDb(deg)).toBeGreaterThan(0);
    expect(polarityDecisiveDb(deg)).toBeLessThan(1);
    /* And with NO input the block judges the polarity not at all (P4). */
    const rep = casus1hReport(null, manifest, files, golden, casus1hSettingsAt(CASUS1H_ACTIVE.positionsHz[0]));
    expect(dspTargetBlock(rep)!.polarity.decisiveDb).toBeNull();
    expect(describeDspTarget(dspTargetBlock(rep)!).join('\n')).toMatch(/states no merge-fit uncertainty/);
  });
});
