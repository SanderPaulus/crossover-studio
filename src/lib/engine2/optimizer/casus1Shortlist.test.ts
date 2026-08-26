/**
 * F3 ACCEPTANCE on casus 1 — requirements at casebook level, and the golden
 * references for the two new response quantities.
 *
 * Two things are checked here that nothing else can check:
 *
 *  · THE NUMBERS ARE REAL. Every other F3 test runs on synthetic responses
 *    where the right answer is known by construction. That proves the
 *    arithmetic; it does not prove the quantities mean anything on a measured
 *    three-way. These do.
 *  · THE SHORTLIST BEHAVES ON A REAL FIELD. Three genuinely different casebook
 *    candidates, judged against the requirements the casebook itself used.
 *
 * The golden values carry their parameters in the reference file, per the V15
 * process rule: a window without a smoothing width, a band and a target curve
 * is not reproducible and therefore is not a reference. The withdrawn F1
 * `spl_venster_dB` was removed for exactly that reason, and what is recorded
 * now is a DIFFERENT quantity with a complete parameter set — not a
 * reinstatement of it.
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
import { buildShortlist, type ShortlistInput } from './shortlist.ts';
import type { TopologyDescriptor } from './diversity.ts';
import type { CandidateMeasurements } from '../requirements/requirements.ts';
import { FLAT_TARGET } from '../requirements/targetCurve.ts';

const golden = loadGolden();
const TOL = golden.toleranties;
const REF = golden.kandidaten as Record<string, Record<string, number>>;
const F3 = (golden.kandidaten as unknown as Record<string, Record<string, unknown>>)
  ._F3_respons_oordeel;

const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const geometry = casus1Geometry(golden);
const settings = {
  amplifierPowerW: 100,
  orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
  reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
  targetCurve: FLAT_TARGET,
};

const report = (candidate: 'HUIDIG' | 'KAND_A' | 'KAND_B'): EngineV2Report =>
  buildReport({
    manifest,
    files,
    filter: casus1Filter(candidate, manifest, files, golden),
    geometry,
    settings,
  });

const REPORTS = {
  HUIDIG: report('HUIDIG'),
  KAND_A: report('KAND_A'),
  KAND_B: report('KAND_B'),
};

describe('F3 golden references — the response judgement on casus 1', () => {
  it('the reference file records the parameters the numbers depend on (V15)', () => {
    expect(F3.doelcurve).toContain('flat');
    expect(F3.gladding_octaven).toBeCloseTo(1 / 6, 9);
    expect((F3.band_hz as number[]).length).toBe(2);
    expect(String(F3.band_herkomst).length).toBeGreaterThan(40);
    expect(String(F3.referentieniveau).length).toBeGreaterThan(30);
    expect((F3.grid as Record<string, unknown>).punten).toBe(1600);
    // The removed F1 reference must not creep back in under a new name.
    expect(String(golden.kandidaten._spl_venster_opmerking)).toContain('niet teruggekeerd');
  });

  it('KAND-B: RMS flatness and SPL window reproduce', () => {
    const j = REPORTS.KAND_B.system.response!;
    expect(Math.abs(j.rmsDeviationDb - REF.KAND_B_3e.rms_vlakheid_dB)).toBeLessThanOrEqual(TOL.dB);
    expect(Math.abs(j.windowPlusMinusDb - REF.KAND_B_3e.spl_venster_pm_dB)).toBeLessThanOrEqual(
      TOL.dB,
    );
    // ...on the parameters the file recorded, not on whatever the engine felt
    // like using today.
    expect(j.smoothingOctaves).toBeCloseTo(F3.gladding_octaven as number, 9);
    const band = F3.band_hz as [number, number];
    expect(j.bandHz[0]).toBeCloseTo(band[0], 1);
    expect(j.bandHz[1]).toBeCloseTo(band[1], 1);
  });

  it('the other two candidates reproduce as well', () => {
    const others = F3.overige_kandidaten as Record<string, Record<string, number>>;
    for (const [key, ref] of Object.entries(others)) {
      const j = REPORTS[key === 'HUIDIG_2e' ? 'HUIDIG' : 'KAND_A'].system.response!;
      expect(Math.abs(j.rmsDeviationDb - ref.rms_vlakheid_dB)).toBeLessThanOrEqual(TOL.dB);
      expect(Math.abs(j.windowPlusMinusDb - ref.spl_venster_pm_dB)).toBeLessThanOrEqual(TOL.dB);
    }
  });

  it('the WINDOW and the RMS order these candidates differently', () => {
    // Not a contrived property: on the casebook's own three designs the
    // acceptance question and the flatness question already disagree, which is
    // precisely why A5e.1 refused to collapse them into one number.
    const byWindow = (['HUIDIG', 'KAND_A', 'KAND_B'] as const)
      .slice()
      .sort((a, b) => REPORTS[a].system.response!.windowPlusMinusDb - REPORTS[b].system.response!.windowPlusMinusDb);
    const byRms = (['HUIDIG', 'KAND_A', 'KAND_B'] as const)
      .slice()
      .sort((a, b) => REPORTS[a].system.response!.rmsDeviationDb - REPORTS[b].system.response!.rmsDeviationDb);
    expect(byWindow).not.toEqual(byRms);
  });

  it('no candidate shows a narrow peak on this measurement set, and none shows a dip either', () => {
    // Recorded because an empty column is a finding too: if a future change
    // starts reporting peaks here, something moved.
    for (const r of Object.values(REPORTS)) expect(r.system.response!.narrowPeaks).toEqual([]);
  });
});

/* ================================================================== *
 * The shortlist on the casebook field
 * ================================================================== */

/** The casebook's own three candidates, as a field the shortlist can judge. */
function casebookField(): ShortlistInput<string>[] {
  const topo = (order: number, invertedMid: boolean): TopologyDescriptor => ({
    flanks: [
      { way: 'woofer', side: 'lp', kind: 'LR', order },
      { way: 'mid', side: 'hp', kind: 'LR', order },
      { way: 'mid', side: 'lp', kind: 'LR', order },
      { way: 'tweeter', side: 'hp', kind: 'LR', order },
    ],
    inverted: invertedMid ? ['mid'] : [],
  });
  const measure = (r: EngineV2Report): CandidateMeasurements => ({
    response: r.system.response,
    phaseTracking: r.system.phaseTracking.map((p) => ({
      subject: `${p.lower}|${p.upper}`,
      meanAbsDeg: p.meanAbsDeg,
    })),
  });
  return [
    {
      label: 'HUIDIG',
      parts: [],
      result: 'HUIDIG',
      topology: topo(2, false),
      measurements: measure(REPORTS.HUIDIG),
      gates: [],
    },
    {
      label: 'KAND_A',
      parts: [],
      result: 'KAND_A',
      topology: topo(2, true),
      measurements: measure(REPORTS.KAND_A),
      gates: [],
    },
    {
      label: 'KAND_B',
      parts: [],
      result: 'KAND_B',
      topology: topo(3, false),
      measurements: measure(REPORTS.KAND_B),
      gates: [],
    },
  ];
}

describe('F3 — the shortlist on casus 1 at casebook requirements', () => {
  // The casebook's own working limits: ±2.0 dB window, 5° phase. The
  // impedance floor is a GATE and is handled there, not here — which is the
  // separation A5e.1 is built on.
  const REQUIREMENTS = { splWindowPlusMinusDb: 2.0, maxPhaseTrackingDeg: 5 };

  it('at least one candidate qualifies, and the shortlist says which', () => {
    const s = buildShortlist(casebookField(), 'casus1-run', {
      requirements: REQUIREMENTS,
      targetCurve: FLAT_TARGET,
    });
    expect(s.rows.length).toBeGreaterThanOrEqual(1);
    expect(s.consideredCount).toBe(3);
    for (const r of s.rows) {
      expect(r.requirements.feasible).toBe(true);
      // Every delivered row carries the numbers that admitted it.
      expect(r.measurements.response).not.toBeNull();
    }
  });

  it('the shortlist spans more than one topology class when the field holds more', () => {
    const s = buildShortlist(casebookField(), 'casus1-run', {
      requirements: REQUIREMENTS,
      targetCurve: FLAT_TARGET,
      size: 3,
    });
    // The casebook field genuinely contains two orders and two polarities.
    const classes = new Set(s.rows.map((r) => r.topologyClass));
    if (s.rows.length >= 2) expect(classes.size).toBeGreaterThanOrEqual(2);
  });

  it('an impossible window climbs the ladder and LABELS the result', () => {
    // The phase requirement is deliberately generous here, so that the WINDOW
    // is the only thing failing: that is what makes "only the failing
    // requirement moves" a real assertion rather than a coincidence. (At the
    // casebook's own 5° both fail on this field — HUIDIG tracks at 23.8° — and
    // the ladder then correctly widens both.)
    const s = buildShortlist(casebookField(), 'casus1-run', {
      requirements: { splWindowPlusMinusDb: 0.1, maxPhaseTrackingDeg: 30 },
      targetCurve: FLAT_TARGET,
      size: 1,
    });
    expect(s.relaxation.steps.length).toBeGreaterThan(0);
    expect(s.relaxation.steps.every((st) => st.requirement === 'spl-window')).toBe(true);
    expect(s.relaxation.inForce.maxPhaseTrackingDeg).toBe(30);
    expect(s.label).toContain('you asked for');
    expect(s.label).toContain('±0.10 dB');
    // And no protection limit was involved at any rung.
    expect(Object.keys(s.relaxation.inForce).sort()).toEqual([
      'maxPhaseTrackingDeg',
      'splWindowPlusMinusDb',
    ]);
  });

  it('the shortlist stamp is stable and separable from the run', () => {
    const a = buildShortlist(casebookField(), 'casus1-run', { requirements: REQUIREMENTS });
    const b = buildShortlist(casebookField(), 'casus1-run', { requirements: REQUIREMENTS });
    expect(b.stamp.shortlistFingerprint).toBe(a.stamp.shortlistFingerprint);
    expect(b.rows.map((r) => r.label)).toEqual(a.rows.map((r) => r.label));

    const stricter = buildShortlist(casebookField(), 'casus1-run', {
      requirements: { ...REQUIREMENTS, maxPhaseTrackingDeg: 4 },
    });
    expect(stricter.stamp.runFingerprint).toBe(a.stamp.runFingerprint);
    expect(stricter.stamp.shortlistFingerprint).not.toBe(a.stamp.shortlistFingerprint);
  });
});
