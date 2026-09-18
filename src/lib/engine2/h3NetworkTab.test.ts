/**
 * H-3 — THE NETWORK TAB'S TUNE OF A DRAWN NETWORK, on the chain's own terms.
 *
 * WHAT IS CLAIMED, in the order the engine meets it:
 *
 *   1. THE SHARED ASSEMBLY is one function: `assembledTuneOptions` carries the
 *      modelled/complement branch, the level band, the safety set's active
 *      branch, the band and the stop-goal band exactly as the chain's tune
 *      did; without an active side none of those keys exist (P2), and the
 *      hooks are merged last (F2b). `activeSideBranches` builds the branch from
 *      the passive way in the lean form, from the active measurement in the
 *      measured form, and names the missing measurement (P4).
 *   2. THE SEED: the template's lowest passive way on casus 1b's MEASURED mid
 *      (the two-way demo bundle's own data), realised from the stated
 *      handover by the acoustic synthesis; the report judges its flank with
 *      `flankErrorDb` — the function the shortlist reads.
 *   3. THE TUNE through the real route (`handleV2Request`, `v2TuneNetlist`):
 *      delivers under every armed gate, judges no sum in the lean form (F0:
 *      NOT JUDGED, never blank), judges the flank, and the report reads the
 *      same flank off the delivered parts (one function, two grids). AND THE
 *      FINDING, pinned as a claim so a repair shows up here: on this seed the
 *      tune reaches its own goal (the complemented sum's ripple 11.1 → 2.8 dB)
 *      and moves the FLANK AWAY from its target (0.84 → 3.7 dB rms) — the
 *      flank band is one octave of six in the amplitude term, and the search
 *      spends it. Measured with the floor, without the floor and with the
 *      phase weight at zero: 3.7, 5.7 and 3.1 dB rms. Casebook H-3, open.
 *   4. P2: the same drawn network WITHOUT an active side is the plain two-way
 *      tune: the sum judged, no flank column.
 *   5. P4: a measured-form handover without the measurement is refused by
 *      name, not modelled away.
 *   6. V31: a tune a gate refuses delivers NOTHING — empty parts, the rule
 *      named — so the app has nothing to apply.
 *   7. H-3b — THE REGRESSION ON THE FINDING: the same seed, the same route,
 *      with a stated flank-error budget of 1.5 dB rms on the handover. The
 *      budget reaches the tuner as a wall (`assembledTuneOptions` →
 *      `flankBudget`) and the worker as the refusal (`runCandidate`,
 *      `flankVerdict`): the tune either HOLDS the flank inside the budget or
 *      is REFUSED with the number — never delivered above it. Claim 3 stays
 *      as the unbudgeted finding; this is what a stated budget makes of it.
 */

import { describe, expect, it } from 'vitest';
import { logspace, type GriddedResponse } from '../dsp.ts';
import { cplx } from '../complex.ts';
import { defaultHpLp } from '../filters.ts';
import { complementSettings, handoverBandHz, leanJudgedBand, type ActiveHandover } from '../activeSide.ts';
import { activeSideBranches, assembledTuneOptions, type ChainInput } from '../designChain.ts';
import { filterTemplate } from '../filterTemplates.ts';
import { seedLowestPassiveWay } from '../hybridNetwork.ts';
import { buildReport } from './report.ts';
import { declareCandidateChainChoices, declareCandidateChoices } from './optimizer/candidateDeclaration.ts';
import { handleV2Request, type V2CandidateResult, type V2Response, type V2TuneNetlistPayload, type V2TuneNetlistResult } from './optimizer/worker.ts';
import {
  CASUS1B_REPORT_SETTINGS,
  CASUS1B_TARGET_CURVE,
  CASUS1B_V2_BAND_HZ,
  CASUS1B_V2_GATES,
  CASUS1B_V2_SETTINGS,
  casus1bChainInput,
  casus1bFiles,
  casus1bGeometry,
  casus1bManifest,
  casus1bSeed,
  casus1bV2Facts,
  loadGolden1b,
} from './casus1b.fixture.ts';
import type { VxpCrossover, VxpPart } from '../parsers/vxp.ts';
import { crossoverToNetlist } from '../vxpNetwork.ts';

const G = loadGolden1b();
const manifest = casus1bManifest(G);
const files = casus1bFiles(manifest);
const gridded = casus1bChainInput(manifest, files);

/** The stated handover of the two-way demo's own Hybrid mode case: LR4 at 400 Hz, the active side unmeasured. */
const HANDOVER: ActiveHandover = {
  activeWay: 'active (unmeasured)',
  passiveWay: 'mid',
  hz: 400,
  kind: 'LR',
  order: 4,
  statedBy: 'this test',
  unmeasured: true,
};
/** The tune runs at the tuner's own budget: a claim about the ROUTE, measured at the settings the app states. */

/* ==================================================================== *
 * 1 — the shared assembly
 * ==================================================================== */

describe('H-3 — the assembled tune has one option assembly', () => {
  const grid = logspace(100, 10000, 60);
  const flat: GriddedResponse = { freq: [...grid], spl: grid.map(() => 90), phaseDeg: grid.map(() => 0) };
  const base = (): ChainInput => ({
    grid: [...grid],
    w: flat,
    t: flat,
    driverZ: { mid: grid.map(() => cplx(8, 0)), tweeter: grid.map(() => cplx(8, 0)) },
    adjust: { offsetMm: 0, trimDb: 0, inverted: false },
    seed: { woofer: { gainDb: 0, hp: defaultHpLp(200), lp: defaultHpLp(2000), eq: [] }, tweeter: { gainDb: 0, hp: defaultHpLp(2000), lp: defaultHpLp(20000), eq: [] } },
    settings: { ...CASUS1B_V2_SETTINGS, band: [200, 10000], safety: { freqs: [...grid], w: flat, t: flat, z: { mid: grid.map(() => cplx(8, 0)), tweeter: grid.map(() => cplx(8, 0)) } } },
  });

  it('without an active side: no branch, nothing missing, and none of the hybrid keys in the options (P2)', () => {
    const b = activeSideBranches(base());
    expect(b).toEqual({ activeSide: null, lean: false, activeBranch: null, activeBranchSafety: null, missingMeasurement: false });
    const o = assembledTuneOptions(base(), [], { activeBranch: null, activeBranchSafety: null });
    expect(o).not.toHaveProperty('activeBranch');
    expect(o).not.toHaveProperty('activeLevelBandHz');
    expect(o).not.toHaveProperty('branchTargets');
    expect(o).not.toHaveProperty('onStage');
    expect(o.safety).not.toHaveProperty('active');
    expect(o.band).toEqual([200, 10000]);
    expect(o.zFloorStrict).toBe(true);
    expect(o.staged).toEqual(CASUS1B_V2_SETTINGS.targets);
  });

  it('in the LEAN form the branch is the passive way’s own measurement times the mirror low-pass, on both grids', () => {
    const input = base();
    input.settings = { ...input.settings, activeSide: { handover: HANDOVER, settings: complementSettings(HANDOVER) } };
    const b = activeSideBranches(input);
    expect(b.lean).toBe(true);
    expect(b.missingMeasurement).toBe(false);
    expect(b.activeBranch).not.toBeNull();
    expect(b.activeBranchSafety).not.toBeNull();
    /* Well below the handover the complement passes the way at full level;
     * two octaves above it is the LR4 low-pass, 48 dB down. */
    const at = (hz: number) => b.activeBranch!.spl[grid.findIndex((f) => f >= hz)];
    expect(at(100)).toBeCloseTo(90, 0);
    expect(at(1600)).toBeLessThan(90 - 40);
    const o = assembledTuneOptions(input, [], { activeBranch: b.activeBranch, activeBranchSafety: b.activeBranchSafety });
    expect(o.activeBranch).toBe(b.activeBranch);
    expect(o.activeLevelBandHz).toEqual(handoverBandHz(400));
    expect(o.safety?.active).toBe(b.activeBranchSafety);
  });

  it('in the MEASURED form the branch comes from the active measurement, and its absence is named (P4)', () => {
    const { unmeasured: _u, ...measured } = HANDOVER;
    void _u;
    const input = base();
    input.settings = { ...input.settings, activeSide: { handover: measured, settings: { gainDb: 0, delayMs: 0, inverted: false } } };
    expect(activeSideBranches(input).missingMeasurement).toBe(true);
    expect(activeSideBranches(input).activeBranch).toBeNull();
    const withIt = { ...input, activeMeasured: flat };
    const b = activeSideBranches(withIt);
    expect(b.missingMeasurement).toBe(false);
    expect(b.lean).toBe(false);
    expect(b.activeBranch).not.toBeNull();
  });

  it('the hooks are merged LAST: a hook value wins over the settings (F2b)', () => {
    const o = assembledTuneOptions(base(), [], { activeBranch: null, activeBranchSafety: null }, { tuneOptionsFor: () => ({ band: [1, 2] }) });
    expect(o.band).toEqual([1, 2]);
  });

  it('H-3b — a stated flank-error budget reaches the tuner as `flankBudget`, in both forms; without one the key is absent (P2)', () => {
    const budgeted: ActiveHandover = { ...HANDOVER, flankBudgetDbRms: 1.5 };
    const lean = base();
    lean.settings = { ...lean.settings, activeSide: { handover: budgeted, settings: complementSettings(budgeted) } };
    const b = activeSideBranches(lean);
    const o = assembledTuneOptions(lean, [], { activeBranch: b.activeBranch, activeBranchSafety: b.activeBranchSafety });
    expect(o.flankBudget).toEqual({ handover: { hz: 400, kind: 'LR', order: 4 }, maxRmsDb: 1.5 });
    /* The measured form carries it too: the flank exists whether the active side is modelled or not. */
    const { unmeasured: _u, ...measuredBudgeted } = budgeted;
    void _u;
    const measured = { ...base(), activeMeasured: flat };
    measured.settings = { ...measured.settings, activeSide: { handover: measuredBudgeted, settings: { gainDb: 0, delayMs: 0, inverted: false } } };
    const bm = activeSideBranches(measured);
    expect(assembledTuneOptions(measured, [], { activeBranch: bm.activeBranch, activeBranchSafety: bm.activeBranchSafety }).flankBudget?.maxRmsDb).toBe(1.5);
    /* And absent without one — every run before H-3b is byte-identical. */
    const plain = base();
    plain.settings = { ...plain.settings, activeSide: { handover: HANDOVER, settings: complementSettings(HANDOVER) } };
    expect(assembledTuneOptions(plain, [], { activeBranch: null, activeBranchSafety: null })).not.toHaveProperty('flankBudget');
  });
});

/* ==================================================================== *
 * 2 + 3 — the seed and the tune on casus 1b (the two-way demo's own data)
 * ==================================================================== */

/** The template's parts in Hybrid mode: the seeded mid branch, the textbook tweeter ladder. */
function seededTemplate(): { parts: VxpPart[]; seedRmsDb: number } {
  const seed = seedLowestPassiveWay({
    handover: HANDOVER,
    grid: gridded.grid,
    driverZ: gridded.driverZ.mid,
    driverSplDb: gridded.w.spl,
    upperKnee: { enabled: true, kind: 'BW', order: 2, freq: 2500 },
    label: 'mid',
  });
  const xo = filterTemplate({ order: 2, wayCount: 2, models: ['mid', 'tweeter'], lowBranch: { components: seed.components, label: 'hybrid 400 Hz' } });
  return { parts: xo.parts, seedRmsDb: seed.result.rmsDb };
}

/** The flank of a netlist as the REPORT reads it — the function the app's chip reads. */
function reportFlank(parts: VxpPart[]) {
  return buildReportOn(parts, HANDOVER)?.flankError ?? null;
}

/** H-3b — the report's active-side block on a netlist, at a given (possibly budgeted) handover. */
function buildReportOn(parts: VxpPart[], handover: ActiveHandover) {
  const { netlist } = crossoverToNetlist({ name: 'h3', parts: [...parts] } as VxpCrossover);
  const driverZ: Record<string, { freq: readonly number[]; magnitude: readonly number[]; phaseDeg: readonly number[] }> = {};
  for (const e of manifest.entries) {
    if (e.kind !== 'Z') continue;
    const f = files.find((x) => x.entry.file === e.file);
    if (f?.impedance) driverZ[e.driver] = { freq: f.impedance.freq, magnitude: f.impedance.magnitude, phaseDeg: f.impedance.phaseDeg };
  }
  const rep = buildReport({
    manifest,
    files,
    filter: { name: 'h3', netlist, driverZ },
    geometry: casus1bGeometry(G),
    settings: { ...CASUS1B_REPORT_SETTINGS, activeHandover: handover },
  });
  return rep.activeSide ?? null;
}

const LEAN_BAND = leanJudgedBand(CASUS1B_V2_BAND_HZ, HANDOVER.hz)!;
/** The measured facts across the border, exactly as the app sends them (`factsForWorker`): the sweeps arm the electrical gates. */
const FACTS = casus1bV2Facts(
  buildReport({ manifest, files, filter: null, geometry: casus1bGeometry(G), settings: CASUS1B_REPORT_SETTINGS }),
  manifest,
  files,
);

function tuneInput(parts: VxpPart[], active: ActiveHandover | null): V2TuneNetlistPayload {
  const activeSide = active ? { handover: active, settings: complementSettings(active) } : undefined;
  const band: [number, number] = active?.unmeasured ? LEAN_BAND : CASUS1B_V2_BAND_HZ;
  const settings = { ...CASUS1B_V2_SETTINGS, band, safety: gridded.safety, ...(activeSide ? { activeSide } : {}) };
  return {
    input: {
      grid: [...gridded.grid],
      w: gridded.w,
      t: gridded.t,
      driverZ: gridded.driverZ,
      adjust: { offsetMm: 0, trimDb: 0, inverted: false },
      seed: casus1bSeed(),
      settings,
    },
    parts,
    label: 'drawn',
    v2: {
      ...FACTS,
      gates: { ...CASUS1B_V2_GATES },
      budgets: {},
      determinism: { seed: 7 },
      targetCurve: CASUS1B_TARGET_CURVE,
      judgeBandHz: band,
    },
    candidate: {
      declaration: declareCandidateChoices({
        cages: [null],
        windowFloorsHz: [null],
        multiWay: true,
        rippleStopFromLowestCrossing: true,
        stated: {
          band,
          staged: CASUS1B_V2_SETTINGS.targets,
          ampTarget: CASUS1B_V2_SETTINGS.ampTarget,
          powerMetric: CASUS1B_V2_SETTINGS.powerMetric,
          phaseMetric: CASUS1B_V2_SETTINGS.phaseMetric,
          catalogSnap: CASUS1B_V2_SETTINGS.catalogSnap,
          breakupGuard: CASUS1B_V2_SETTINGS.breakupGuard,
          audit: { thresholds: { rSourceOhm: null } },
          safety: gridded.safety,
          ...(settings.ampMinLoadOhm !== undefined ? { ampMinLoadOhm: settings.ampMinLoadOhm } : {}),
          zFloorStrict: true,
        },
        targetCurve: CASUS1B_TARGET_CURVE,
      }),
      chainDeclaration: declareCandidateChainChoices({ stated: {}, ...(activeSide ? { activeSide } : {}) }),
      provenance: 'this test — a drawn network',
    },
  };
}

function through(payload: V2TuneNetlistPayload): V2CandidateResult<V2TuneNetlistResult> {
  const wire = structuredClone({ id: 1, kind: 'v2TuneNetlist' as const, payload });
  let out: V2CandidateResult<V2TuneNetlistResult> | null = null;
  handleV2Request(wire, (m: V2Response) => {
    if (m.kind === 'error') throw new Error(m.message);
    if (m.kind === 'done') out = m.data as V2CandidateResult<V2TuneNetlistResult>;
  });
  if (!out) throw new Error('the v2 route returned nothing');
  return out;
}

describe('H-3 — the seed and the tune of a drawn network on casus 1b', () => {
  const seeded = seededTemplate();

  it('the template seeds the mid from the stated handover on the MEASURED mid, and the report judges its flank', () => {
    expect(seeded.parts.filter((p) => /^(Inductor|Capacitor)$/.test(p.type) && !p.partId?.startsWith('B·'))).toHaveLength(6);
    expect(Number.isFinite(seeded.seedRmsDb)).toBe(true);
    const flank = reportFlank(seeded.parts);
    expect(flank).not.toBeNull();
    expect(flank!.bandHz).toEqual(handoverBandHz(400));
    expect(Number.isFinite(flank!.rmsDb)).toBe(true);
  });

  it('the tune through the real route delivers under the armed gates, judges the flank and no sum — and MOVES THE FLANK AWAY from its target (the H-3 finding)', () => {
    const before = reportFlank(seeded.parts)!;
    const r = through(tuneInput(seeded.parts, HANDOVER));
    expect(r.rejection).toBeNull();
    expect(r.result.parts.length).toBeGreaterThan(0);
    expect(r.result.net.tuned).toBeGreaterThan(0);
    /* The lean form: no sum (F0 — the app prints NOT JUDGED), the flank judged. */
    expect(r.measurements.response).toBeNull();
    expect(r.measurements.flankError).not.toBeUndefined();
    const after = r.measurements.flankError!;
    expect(after).not.toBeNull();
    expect(after.bandHz).toEqual(handoverBandHz(400));
    expect(Number.isFinite(after.rmsDb)).toBe(true);
    /* Every armed gate holds on the delivered network — the stated floor
     * among them, which the drawn seed sat UNDER (1.88 Ω against 2.6). */
    expect(r.violation).toBeNull();
    expect(r.gates.filter((g) => g.active).every((g) => g.pass)).toBe(true);
    expect(r.gates.some((g) => g.gate === 'M-B/|Z|' && g.active && g.value !== null)).toBe(true);
    /* The tune's OWN goal is reached: the complemented sum's ripple falls. */
    expect(r.result.net.after.rippleDb).toBeLessThan(r.result.net.before.rippleDb);
    /* THE FINDING (casebook H-3): the flank ends further from its target than
     * the seed's — 0.84 → 3.7 dB rms measured here, with the floor dropped
     * 5.7, with the phase weight at zero 3.1. The amplitude term weighs the
     * handover band as one octave of six and the search spends it. Pinned as
     * "worse than the seed", which holds on every runtime measured; a repair
     * that holds the flank turns this line red on purpose, and then the claim
     * becomes "meets the stated goal". */
    const goal = CASUS1B_V2_SETTINGS.targets!.rippleDb;
    console.log(`[h3] seed flank ${before.rmsDb.toFixed(3)} dB rms → tuned ${after.rmsDb.toFixed(3)} (max ${after.maxAbsDb.toFixed(2)}, level ${after.levelDb.toFixed(2)}); complemented-sum ripple ${r.result.net.before.rippleDb.toFixed(2)} → ${r.result.net.after.rippleDb.toFixed(2)} dB, |Z| ${r.result.net.before.zMinOhm?.toFixed(2)} → ${r.result.net.after.zMinOhm?.toFixed(2)} Ω, ${r.result.net.evaluations} evals; stated goal ${goal} dB`);
    expect(after.rmsDb).toBeGreaterThan(before.rmsDb);
    /* H-3b, P2: with no budget stated the tuner carries no flank of its own
     * and nothing refuses on it — this run is what it was before H-3b. */
    expect(r.result.net.after).not.toHaveProperty('flankRmsDb');
    expect(r.notes.some((n) => /Flank budget \(H-3b\)/.test(n))).toBe(false);
    /* The passive pair's own phase is still measured, and the audit ran. */
    expect(r.measurements.phaseTracking.length).toBeGreaterThan(0);
    expect(r.result.net.audit).toBeDefined();
    /* The report on the delivered parts reads the same function: one number,
     * two grids (the chain's and the report's — the H-2b caveat). */
    const reported = reportFlank(r.result.parts)!;
    expect(reported).not.toBeNull();
    expect(Math.abs(reported.rmsDb - after.rmsDb)).toBeLessThan(0.5);
  }, 600_000);

  it('without an active side the same drawn network is the plain two-way tune: no flank column, and the SUM is what is judged (P2)', () => {
    const r = through(tuneInput(seeded.parts, null));
    expect(r.measurements.flankError).toBeUndefined();
    /* On this seed the plain tune is REFUSED by the stated floor — the
     * textbook seed sits at 1.88 Ω under casus 1b's 2.6 Ω and the plain tune
     * does not lift it, where the hybrid tune above did — or it delivers with
     * the sum judged. Either way the sum is the thing judged: a refused tune
     * reports the refused network's rms deviation, a delivered one its
     * response judgement. Neither carries a flank. */
    if (r.rejection) {
      expect(r.rejection.kinds).toContain('gate');
      expect(r.measurements.response).toBeNull();
      expect(r.rejection.rejectedTune).not.toBeNull();
      expect(Number.isFinite(r.rejection.rejectedTune!.rmsDeviationDb)).toBe(true);
    } else {
      expect(r.measurements.response).not.toBeNull();
    }
  }, 600_000);

  it('H-3b — with a STATED flank-error budget of 1.5 dB rms the same tune HOLDS the flank or is REFUSED with the number, never delivered above it', () => {
    const budgeted: ActiveHandover = { ...HANDOVER, flankBudgetDbRms: 1.5 };
    const before = reportFlank(seeded.parts)!;
    const r = through(tuneInput(seeded.parts, budgeted));
    /* The budget reached the TUNER: its own before/after carry the flank it
     * read (present only with a stated budget — the V30 shape). */
    expect(Number.isFinite(r.result.net.before.flankRmsDb ?? Number.NaN)).toBe(true);
    if (r.rejection === null) {
      /* DELIVERED: inside the budget, by the one comparison the chip reads,
       * and the tune still moved (it is not the seed handed back). */
      expect(r.result.parts.length).toBeGreaterThan(0);
      expect(r.result.net.tuned).toBeGreaterThan(0);
      const after = r.measurements.flankError!;
      expect(after).not.toBeNull();
      expect(after.rmsDb).toBeLessThanOrEqual(1.5);
      expect(Number.isFinite(r.result.net.after.flankRmsDb ?? Number.NaN)).toBe(true);
      expect(r.notes.some((n) => /Flank budget \(H-3b\): .*within the stated budget of ≤ 1\.50 dB rms/.test(n))).toBe(true);
      /* The report on the delivered parts judges it the same way. */
      const rep = buildReportOn(r.result.parts, budgeted);
      expect(rep!.flankVerdict).not.toBeNull();
      expect(rep!.flankVerdict!.pass).toBe(true);
      console.log(`[h3b] seed flank ${before.rmsDb.toFixed(3)} → tuned ${after.rmsDb.toFixed(3)} dB rms, HELD inside 1.5 (tuner read ${r.result.net.after.flankRmsDb?.toFixed(3)}); complemented-sum ripple ${r.result.net.before.rippleDb.toFixed(2)} → ${r.result.net.after.rippleDb.toFixed(2)} dB, ${r.result.net.evaluations} evals`);
    } else {
      /* REFUSED: on the flank budget, by name and number, with nothing applied (V31). */
      expect(r.rejection.kinds).toEqual(['budget']);
      expect(r.rejection.reason).toMatch(/target-flank error [\d.]+ dB rms against the stated budget of ≤ 1\.50 dB rms — requirement FAILED/);
      expect(r.result.parts).toEqual([]);
      expect(r.measurements.response).toBeNull();
      console.log(`[h3b] seed flank ${before.rmsDb.toFixed(3)} dB rms; the budgeted tune was REFUSED: ${r.rejection.reason}`);
    }
    /* Either way: nothing above the budget was delivered. */
    expect(r.rejection !== null || r.measurements.flankError!.rmsDb <= 1.5).toBe(true);
  }, 600_000);

  it('a measured-form handover without the measurement is refused by name (P4)', () => {
    const { unmeasured: _u, ...measured } = HANDOVER;
    void _u;
    expect(() => through(tuneInput(seeded.parts, measured))).toThrow(/no measured response was supplied/);
  });

  it('a tune a gate refuses delivers NOTHING (V31): empty parts, the rule named', () => {
    const payload = tuneInput(seeded.parts, HANDOVER);
    /* An amplifier floor no passive two-way can meet: every evaluation is refused. */
    payload.v2 = { ...payload.v2, gates: { ...payload.v2.gates, ampMinLoadOhm: 200 } };
    const r = through(payload);
    expect(r.rejection).not.toBeNull();
    expect(r.rejection!.kinds).toContain('gate');
    expect(r.result.parts).toEqual([]);
    expect(r.measurements.response).toBeNull();
  }, 600_000);
});
