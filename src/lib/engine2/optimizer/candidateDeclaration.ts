/**
 * F4d — THE CANDIDATE'S DECLARATION OVER EVERY CHOICE KEY.
 *
 * Twenty-five at F4d, twenty-six since V30 added `zFloorBarrier`,
 * twenty-seven since V33 added `zFloorBarrierSource`, twenty-eight since
 * V34 added `rSourceProbeSource`, twenty-nine since V37 added
 * `dissipationReferenceSource`, thirty since V38-fix RECLASSIFIED
 * `errorSmoothOct` out of polish, thirty-one since V44 added
 * `phaseAdmission`, thirty-two since V45 added `amplitudeReference` and
 * thirty-three since V47 added `protectionRule` and thirty-four since V48
 * added `seriesInductanceCeilingSource`. The number
 * is not repeated in prose anywhere it could go stale: `declarationCoverage`
 * compares against `CHOICE_KEYS` itself, so a key added upstream lands in no
 * state and fails the build.
 *
 * F4c stated ten of them and wrote the other fifteen into a note beginning
 * "Search choices still inherited from the v1 chain". This module is what
 * removes that sentence, and it removes it by making every key say something
 * rather than by giving every key a value — the difference matters, because
 * seven of the fifteen have no honest value to give:
 *
 *   · `xoRange` names ONE handover, and a design with N of them has no single
 *     one to name. `xoRangePairs` is the same statement made N-way.
 *   · `xoPinHard` belongs to the hold-the-pin repair pass, which runs only
 *     after a pinned axis has escaped. Setting it up front converts every
 *     candidate's soft cage into a wall.
 *   · the solo family (`solo`, `soloSensitivityDb`, `soloTargetLevelDb`)
 *     describes a one-way design. This is not one.
 *   · `branchTargets` is the corridor the DESIGN STEP derives from the
 *     alignment it has just settled. It does not exist before that step runs,
 *     and re-deriving it here would be a second implementation of chain logic —
 *     which is how V21's two descriptions of one hierarchy started to disagree.
 *   · `angleData` and `midBranch` carry measured arrays that are ALREADY in the
 *     payload, as `input.angleData` and `input.m`. Restating them would put a
 *     second copy of the same measurement on the wire, and a second copy is a
 *     second thing that can be wrong.
 *
 * So each of those is DECLARED — absent, or delegated to a named stage, with
 * the reason. `declarationCoverage` asserts the three states cover the key set
 * exactly, and `choiceKeyGuard.test.ts` runs that assertion over what this
 * module produces. "Nothing is inherited any more" is therefore a claim the
 * build checks rather than a sentence someone wrote once.
 *
 * P4 LIVES HERE TOO. A setting the designer never filled in does not become a
 * stated value with an undefined in it — it becomes an ABSENT declaration whose
 * reason is P4. That reads correctly in the run notes ("no amplifier floor was
 * stated, so nothing judges the load") where an omitted key reads as an
 * oversight.
 *
 * NOTHING IS DECIDED HERE. Every value below is one the designer or the
 * generator already settled; this module only files them.
 */

import type { NetOptimizeOptions } from '../../netOptimizer.ts';
import type { Chain3Settings } from '../../threeWayChain.ts';
import { SYNTHESIS_LEAN_DEFAULT_DB } from '../../synthesis.ts';
import { DEFAULT_EQ_BANDS_PER_DRIVER } from '../../vfOptimizer.ts';
import { SEARCH_SMOOTHING_OCTAVES } from '../constants.ts';
import { isImplemented as isImplementedCurve, type TargetCurve } from '../requirements/targetCurve.ts';
import type { ChoiceDeclaration, ChoiceKey } from './choices.ts';
import { coilDcrModelFor, type CoilDcrFit } from '../../coilDcr.ts';
import type { ChainChoiceDeclaration, ChainChoiceKey } from './chainChoices.ts';

/** The values the designer (or the app) has settled, in the tuner's own names. */
export type StatedByDesigner = Partial<
  Pick<
    NetOptimizeOptions,
    | 'band'
    | 'acousticSlopes'
    | 'staged'
    | 'ampTarget'
    | 'powerMetric'
    | 'phaseMetric'
    | 'catalogSnap'
    | 'snapPrefs'
    | 'breakupGuard'
    | 'safety'
    | 'audit'
    | 'loadFloor'
    | 'ampMinLoadOhm'
    | 'rSourceDisqualifyOhm'
    | 'zFloorStrict'
    | 'zFloorBarrier'
    | 'zFloorBarrierSource'
    | 'rSourceProbeSource'
    | 'dissipationReferenceSource'
    | 'errorSmoothOct'
    | 'phaseAdmission'
    | 'amplitudeReference'
    | 'protectionRule'
    | 'seriesInductanceCeilingSource'
    | 'coilDcrModel'
  >
>;

export interface CandidateDeclarationInput {
  /** The candidate's own cage per adjacent pair, low to high. */
  cages: readonly (readonly [number, number] | null)[];
  /**
   * The A5d.3 window FLOOR per adjacent pair — the floor that steered this
   * candidate.
   *
   * This is the key row of the whole delivery. `xoFloorPairs` used to carry the
   * v1 physics floor (near-field/far-field splice, the lower driver), which is
   * a different question answered on a different measurement (audit §6.3). On
   * the v2 route the candidate states the floor it was generated against, and
   * the v1 floor is reported beside it as a counter-judgement rather than
   * applied silently (`predesign/floorComparison.ts`).
   */
  windowFloorsHz: readonly (number | null)[];
  stated: StatedByDesigner;
  /**
   * A5e.3 — the COIL FAMILY the project states per way (driver model →
   * family id), and the catalogue's fits to resolve them with. Both present
   * and at least one family resolving ⇒ the candidate declares `coilDcrModel`;
   * anything less ⇒ ABSENT with the reason. A way whose family is not among
   * the fits is named in the absent reason rather than silently lossless.
   * Never derived from nothing (P4) and never a default family (P6).
   */
  coilDcrFamilyByWay?: Readonly<Record<string, string>>;
  coilDcrFits?: readonly CoilDcrFit[];
  /** Where those fits came from, for a reader of the declaration and the notes. */
  coilDcrCatalogLabel?: string;
  /** True when this design has more than one way — i.e. is not a solo design. */
  multiWay: boolean;
  /**
   * A5e.2 — the design's own target curve, when it carries one that can
   * actually be evaluated.
   *
   * The OBJECT rather than a boolean, because the derivation below has to
   * distinguish three states and a boolean can hold two: no curve at all, a
   * curve that is `flat` (the neutral reference, which is the identity), and a
   * curve that says something. Absent = the first.
   */
  targetCurve?: TargetCurve;
  /**
   * V47 — the project's stated maximum drive on a driver's own resonance, dB,
   * when it states one.
   *
   * The NUMBER rather than a boolean, for the same reason `targetCurve` is the
   * object: the derivation below has to be able to say, in the absent case,
   * what was missing. It is never passed on as a tuner option — the limit
   * itself travels as `v2.gates.maxDriveOnFsDb` and is enforced by the gate
   * machinery. All this input decides is which of the two protection rules the
   * full-band safety gate applies.
   */
  driveOnFsLimitDb?: number;
  /**
   * V50 — the same figure stated PER WAY (keyed by driver model), beside the
   * single figure above. Any way with a stated figure is an absolute
   * requirement the safety gate can defer to, exactly like the single one.
   */
  driveOnFsLimitDbByDriver?: Record<string, number>;
  /**
   * V49 — TRUE when the report derived an excursion ceiling for at least one
   * way (M-C v2.0). An absolute requirement exists then even with no stated dB
   * figure, so the safety gate's seed comparison has something to defer to
   * and `protectionRule` derives `'stated'` exactly as it does for a stated
   * figure. The ceilings themselves travel as a measured fact
   * (`driveCeilingDbByModel`), never through the declaration.
   */
  driveCeilingDerived?: boolean;
  /**
   * V48 — the project's stated LF-lift budget, dB, when it states one.
   *
   * The NUMBER rather than a boolean for the same reason `driveOnFsLimitDb` is
   * one: the absent case has to be able to say what was missing. It is never
   * passed on as a tuner option — the budget travels as
   * `v2.budgets.lfBumpBudgetDb` and is what `invertBudgets` inverts. All this
   * input decides is whether the ceiling that inversion produces follows the
   * tune or describes the seed.
   */
  lfBumpBudgetDb?: number;
}

/** A key the designer left empty, filed with the P4 reason. */
const p4 = (key: ChoiceKey, what: string) => ({
  key,
  why:
    `the designer stated no ${what}, and absent is absent (P4) — a stated nothing judges nothing, ` +
    'here and in the tuner',
});

export function declareCandidateChoices(input: CandidateDeclarationInput): ChoiceDeclaration {
  const s = input.stated;
  const stated: Partial<NetOptimizeOptions> = {};
  const absent: { key: ChoiceKey; why: string }[] = [];
  const delegated: { key: ChoiceKey; to: string; why: string }[] = [];

  /* ---- what the CANDIDATE decided ------------------------------------- */
  stated.xoRangePairs = input.cages.map((c) => (c ? [c[0], c[1]] : null));
  const floors = input.windowFloorsHz.map((f) => (f !== null && f > 0 ? f : null));
  if (floors.some((f) => f !== null)) {
    stated.xoFloorPairs = floors;
  } else {
    absent.push({
      key: 'xoFloorPairs',
      why:
        'no A5d.3 window floor could be derived for any handover, so the candidate states none. ' +
        'The v1 physics floor is NOT substituted here: it answers a different question and is ' +
        'reported beside this field as a counter-judgement (audit §6.3)',
    });
  }

  /* ---- what the DESIGNER decided, or did not -------------------------- */
  const put = <K extends keyof StatedByDesigner & ChoiceKey>(key: K, what: string) => {
    const v = s[key];
    if (v === undefined) absent.push(p4(key, what));
    else (stated as Record<string, unknown>)[key] = v;
  };
  put('band', 'evaluation band');
  put('acousticSlopes', 'acoustic slope target');
  put('staged', 'ripple/phase target for the staged pass');
  put('ampTarget', 'amplitude target curve (on-axis or listening window)');
  put('powerMetric', 'power-response metric');
  put('phaseMetric', 'phase metric');
  put('catalogSnap', 'catalogue-snap choice');
  put('snapPrefs', 'snap preferences');
  put('breakupGuard', 'breakup-guard choice');
  put('safety', 'full-band safety set');
  put('audit', 'part-audit settings');
  put('loadFloor', 'derived amplifier-load floor');
  put('ampMinLoadOhm', 'amplifier minimum load');
  put('rSourceDisqualifyOhm', 'source-resistance disqualification limit');
  put('zFloorStrict', 'strict impedance-floor setting for the repair pass');

  /* ---- A5e.3: WHAT PHYSICS THE COILS ARE JUDGED ON ---------------------
   *
   * Derived from a STATED family per way and the catalogue's fits, in the V51b
   * shape (the numbers travel inside the value). An explicit model wins. With
   * families but no fit for any of them — no catalogue, or a family the
   * catalogue does not stock — the key is ABSENT and the reason names the
   * families that could not be resolved, so "lossless" is never mistaken for
   * "nobody said". With nothing stated it is ABSENT with P4: every coil is
   * lossless, which every built loudspeaker is not, and the notes say so. */
  if (s.coilDcrModel !== undefined) {
    stated.coilDcrModel = s.coilDcrModel;
  } else {
    const families = input.coilDcrFamilyByWay ?? {};
    const named = Object.entries(families).filter(([, v]) => typeof v === 'string' && v !== '');
    if (named.length > 0 && input.coilDcrFits && input.coilDcrFits.length > 0) {
      const { model, missing } = coilDcrModelFor(families, input.coilDcrFits, input.coilDcrCatalogLabel);
      if (model) {
        stated.coilDcrModel = model;
      } else {
        absent.push({
          key: 'coilDcrModel',
          why:
            'a coil family is stated for ' +
            named.map(([w, f]) => `${w} (${f})`).join(', ') +
            ' but the catalogue handed over has no fit for any of them (' +
            missing.map((m) => m.family).join(', ') +
            '), so every coil stays lossless — a deviation from any built loudspeaker, and a catalogue ' +
            'question rather than a design one',
        });
      }
    } else if (named.length > 0) {
      absent.push({
        key: 'coilDcrModel',
        why:
          'a coil family is stated for ' +
          named.map(([w, f]) => `${w} (${f})`).join(', ') +
          ' but no catalogue fits reached this run (no catalogue imported), so every coil stays ' +
          'lossless — a deviation from any built loudspeaker',
      });
    } else {
      absent.push({
        key: 'coilDcrModel',
        why:
          'no coil family is stated for any way, so every continuous coil is lossless: the search ' +
          'and every gate judge a network whose coils have no copper, which no built loudspeaker ' +
          'has. Absent rather than a default family (P6/P4): which wire a way is wound with is the ' +
          "designer's statement, and nothing here may make it for them",
      });
    }
  }

  /* ---- V30: is the stated floor a SEARCH GOAL, or only a veto? ---------
   *
   * The only choice key on this route whose value is DERIVED from another
   * key rather than read off a form, and the derivation is the whole finding:
   * a floor that exists but does not steer produced a field of fifteen
   * candidates of which thirteen came back byte-identical to a run where no
   * floor existed at all (V30). So a candidate that carries a floor arms the
   * barrier by default — stating a limit and then searching as though it were
   * not there is the behaviour the entry exists to end.
   *
   * P4 on both sides. No floor ⇒ ABSENT with the reason, never `false`: a
   * false here would read as "the designer decided the floor should not
   * steer", and nobody decided anything. And an explicit value still wins, so
   * the before/after measurement the entry rests on is a run that can be
   * asked for rather than a build that has to be patched. */
  if (s.zFloorBarrier !== undefined) {
    stated.zFloorBarrier = s.zFloorBarrier;
  } else if (s.ampMinLoadOhm !== undefined) {
    stated.zFloorBarrier = true;
  } else {
    absent.push({
      key: 'zFloorBarrier',
      why:
        'there is no amplifier floor on this design, so there is nothing for the search to aim ' +
        'at — a barrier without a rating has no distance to be short of. Absent rather than ' +
        'false (P4): false would say someone decided the floor should not steer, and with no ' +
        'floor stated nobody decided anything',
    });
  }

  /* ---- V33: WHERE THE STEERING IS MEASURED ----------------------------
   *
   * The second half of V30's derivation, and it only exists because the first
   * one worked. A barrier that steers has to steer at the number that will be
   * enforced, and since V32 that number is read over the drivers' whole
   * measured extent rather than over the chain's analysis grid. Casus 1
   * measured what the mismatch costs: five of fifteen candidates had their
   * whole value tune refused by `M-B/|Z|` for a dip at ~82 Hz, which is below
   * the far-field span the evaluation grid starts at, and delivered their seed.
   *
   * `'safety'` AND NOT `'sweep'`, AND THE REASON IS A MEASUREMENT. Both cover
   * the drivers' full extent and both go through the same reader, so both end
   * the blindness; they differ in RESOLUTION, and the difference between them
   * is held against the floor slack on every frozen netlist
   * (`frozenNetlistGates.test.ts`). What they do not share is price — the
   * sweep's grid is the analysis resolution and the barrier runs inside the
   * objective, which on casus 1 is a chain run of eleven minutes against one.
   * A default nobody can afford to run is a default nobody runs.
   *
   * Two keys rather than one because they answer different questions — whether
   * the floor steers, and over what band — and V30 and V33 are two separate
   * entries precisely because collapsing them hides which one moved.
   *
   * P4 on both sides, exactly as above: barrier not armed ⇒ ABSENT with the
   * reason, never a source for a term nobody switched on. And an explicit
   * value still wins, so the before/after this entry rests on is a run that can
   * be asked for. */
  if (s.zFloorBarrierSource !== undefined) {
    stated.zFloorBarrierSource = s.zFloorBarrierSource;
  } else if (stated.zFloorBarrier === true) {
    /* A5e.3b (c2) — `'safety-extended'` and no longer `'safety'`: the safety
     * grid spans the drivers' RESPONSE extent, the sweeps the gate judges on
     * reach further (10 Hz against 20.5 on the merged set), and the A5e.3-veld
     * field delivered a design whose minimum sits between the two floors
     * (KAND_V2_2, 2.55 Ω at 10.07 Hz) — passed within the tolerance because
     * the barrier could not see it. The extended source is the same reader
     * over the union of the two extents, at the safety resolution where the
     * responses live and the gate's own points where only the sweeps do. An
     * explicit `'safety'` still wins, which is what keeps the A5e.3-veld
     * corpus reproducible as the run its generator made. */
    stated.zFloorBarrierSource = 'safety-extended';
  } else {
    absent.push({
      key: 'zFloorBarrierSource',
      why:
        'the barrier is not armed on this design, so there is no reading for it to take and no ' +
        'band to take it over. Absent rather than a stated default (P4): naming a source for a ' +
        'term nobody switched on would read as a decision about where to aim',
    });
  }

  /* ---- V34: WHERE THE SOURCE-RESISTANCE PROBE READS -------------------
   *
   * Derived, like V30's and V33's, and derived from the same fact: the probe
   * is asking about the low driver's box tuning, and a resonance below the
   * analysis grid cannot be read on the analysis grid. The safety set spans
   * the drivers' whole measured extent — it is the only band this route holds
   * where the question is answerable — so a candidate that carries one probes
   * on it.
   *
   * WHY THIS IS NOT A DETAIL. The probe feeds a hard disqualification, a
   * search constraint, a structure-move guard, an audit tier and one objective
   * term. Measured on casus 1 at V34: on the chain grid the probe lands on
   * grid[24] = 640.2 Hz, which is the top of its OWN search window rather than
   * a resonance, and the three v1 baselines read 0.50/0.47/0.68 Ω there
   * against 3.98/4.59/2.55 Ω at the woofer's real peak. Same networks, same
   * limit, opposite verdicts.
   *
   * P4 on the other side, and the reason is stated rather than implied: with
   * no safety set there is no wider band to probe on, so the candidate states
   * nothing and the tuner reads its own grid — which is the pre-V34 reading,
   * named as such instead of inherited in silence. */
  if (s.rSourceProbeSource !== undefined) {
    stated.rSourceProbeSource = s.rSourceProbeSource;
  } else if (s.safety !== undefined) {
    stated.rSourceProbeSource = 'safety';
  } else {
    absent.push({
      key: 'rSourceProbeSource',
      why:
        'this candidate carries no full-band safety set, so there is no grid wider than the ' +
        'evaluation grid for the probe to read on, and naming one whose data never arrives would ' +
        'switch the probe off altogether. The tuner therefore reads its own grid — the pre-V34 ' +
        'reading, stated as absent rather than inherited in silence (P4)',
    });
  }

  /* ---- V37: WHAT THE DISSIPATION TERM DIVIDES BY ----------------------
   *
   * STATED UNCONDITIONALLY, and that is the one derivation in this module that
   * does not hang on another setting. The reason is that the question is not
   * conditional. `dissipationWeight` is a GREY key (A3j): a v2 candidate always
   * states it explicitly, never inherits it and never silently zeroes it — so
   * the term is always live on this route, and a live term always has a
   * quantity it measures.
   *
   * WHICH quantity is settled by what the term is FOR. A4 M-E and A3j row 23
   * both name it: series resistance in the lowest path multiplies Q_es by
   * `1 + R_source/R_e`, with R_e the DC resistance — the same number M-E
   * publishes and `maxSeriesResistanceFromQes` inverts the budget with. Until
   * V37 the tuner divided by `Re(Z)` at the probe instead, which is the branch's
   * impedance there and not its DC resistance. Since V34 that probe sits ON the
   * low driver's impedance peak, so the two are furthest apart exactly where
   * the reading is taken: 19.31 Ω against a metered 3.05 Ω on casus 1, squared
   * to a factor 40.1.
   *
   * P4 IS ANSWERED ONE LAYER DOWN, and deliberately so. This module cannot see
   * whether a resolved R_e reached the run — that is a measured fact, not a
   * designer setting. So the candidate names the quantity and the TUNER reports
   * the absence: with no resolved R_e for the lowest branch there is no ratio
   * at all, the term adds nothing, and `dissipationRefNote` says which input
   * was missing. No fallback to the peak height, for the third time and the
   * same reason as V32, V33 and V34.
   *
   * An explicit value still wins, so V37's before/after is a run someone can
   * ask for rather than a build that has to be patched. */
  stated.dissipationReferenceSource = s.dissipationReferenceSource ?? 're';

  /* ---- V38-fix: WHAT CURVE THE AMPLITUDE TERM MEASURES -----------------
   *
   * STATED UNCONDITIONALLY, the second derivation here that hangs on nothing
   * else, and for the same shape of reason as V37's: the question is not
   * conditional. Every candidate is judged on the amplitude of its complex sum
   * — `judgeResponse`'s RMS deviation, the SPL window, the staged targets and
   * every gate all read that one curve — so every candidate has to say which
   * curve its SEARCH minimises the spread of, and there is one honest answer.
   *
   * WHY THE INHERITED ANSWER WAS NOT IT. Smoothing the search measure is not a
   * blur of the judged curve: a Gaussian kernel in log-f reaches ACROSS the
   * judged band's edge, and on a grid that runs past the drivers' measured
   * extent the point beyond it is the silent ghost at -400 dB. Measured on
   * casus 1: the last point inside the band drops from 130.95 dB to 43.67, the
   * search's amplitude term reads 9.6-10.9 dB across the whole frozen corpus
   * where the real spread runs 0.60-3.81, and the design the judgement calls
   * worst ranks 16th of 80 on that measure. Delivered, one key at a time: 0.55
   * to 2.45 dB on three separate topologies (casebook V38, V38-fix). That is
   * not a resolution detail; it is the whole distance between the generated
   * field and the designer's own filter.
   *
   * ZERO IS NOT A CASUS-1 NUMBER, and that matters because a v2 default that
   * was one would be P6's exact failure. It is "measure the curve that will be
   * judged": any width above zero reaches over the same edge. Smoothing the SUM
   * after it exists was the other candidate repair and it was MEASURED rather
   * than reasoned about — it leaves the same 43 dB standing, because the ghost
   * is in the sum too. It stays unbuilt, noted in V38-fix.
   *
   * WHAT THIS DOES NOT TOUCH. `WINDOW_SMOOTHING_OCTAVES` (A5e.1) is the
   * acceptance width and is unchanged; the two are different questions and F3c
   * built the line that says so. And an explicit value still wins, so V38-fix's
   * before/after is a run someone can ask for rather than a build to patch. */
  stated.errorSmoothOct = s.errorSmoothOct ?? SEARCH_SMOOTHING_OCTAVES;

  /* ---- V44: WHICH POINTS MAY CARRY A PHASE JUDGEMENT -------------------
   *
   * STATED UNCONDITIONALLY, the third derivation here that hangs on nothing
   * else, and for the same shape of reason as V37's and V38-fix's: the question
   * is not conditional. Every candidate is judged on phase — the requirement
   * `phase-tracking` reads this number per handover, the objective carries it
   * with `phasePriority`, and the panel prints it — so every candidate has to
   * say which points that judgement rests on, and there is one honest answer.
   *
   * WHY THE INHERITED ANSWER WAS NOT IT. The historic set admits a point when
   * the two branches lie within the overlap window of EACH OTHER, and nothing
   * else: no clip on measurement validity, no floor under the silent ghost.
   * Measured over the whole casebook (V40): of the 1048 points that set added
   * beyond the report's, 911 sat below the validity floor the measurement files
   * themselves declare, and 14 were points where both branches were dead and
   * the phase difference came from the FILTERS alone. On `V38FIX_KAND_5` that
   * is 15 of 30 points carrying 101 deg against 17 deg on the shared ones —
   * 59.15 against 17.05 over one and the same network.
   *
   * WHY NOT THE REPORT'S OLD SET EITHER, and this is why the answer is a third
   * thing rather than one of the two: the octave window admits points where one
   * branch is long gone and its phase cannot move the sum. On `V28_KAND_1` M-T
   * that is thirteen points of 146 deg average, and the report read 90.7 deg
   * where the sum saw 29.7.
   *
   * 'MEASURED' IS NOT A CASUS-1 NUMBER. It states no frequency and no limit:
   * the three grounds are the measurement's own validity band, the caller's own
   * ghost convention, and the overlap window that already lived in
   * `integration.ts`. The facts those grounds read travel as POLISH beside it,
   * because they are the run's measurements and not the candidate's opinion.
   *
   * An explicit value still wins, so V44's before/after is a run someone can
   * ask for rather than a build that has to be patched. */
  stated.phaseAdmission = s.phaseAdmission ?? 'measured';

  /* ---- V45 (A5e.2): WHAT THE AMPLITUDE TERM IS FLAT AGAINST -------------
   *
   * DERIVED, like V30's `zFloorBarrier` and for the same finding one axis
   * along: a reference that exists but does not steer is a reference that
   * changes nothing. Until V45 a design could state a voicing, have the
   * shortlist judge its window and its RMS deviation against it, and have the
   * SEARCH flatten it toward horizontal the whole time — and the search has the
   * whole iteration budget, so it wins and the verdict merely records the loss.
   * A design that carries an evaluable target therefore searches against it.
   *
   * THREE STATES, NOT TWO, and that is why the input is the curve and not a
   * flag. No curve at all and a `flat` curve both leave this ABSENT: `flat` is
   * the neutral reference, subtracting it is the identity, and arming a
   * mechanism that provably cannot move anything is how a run comes to carry a
   * key nobody can point at a consequence of (V23). The third state — a curve
   * that says something and whose parameters arrived — arms it.
   *
   * ABSENT AND NEVER `'flat'` (P4). A stated `'flat'` would read as "somebody
   * decided the voicing should not steer the search"; with no voicing stated,
   * nobody decided anything. An explicit value still wins, so V45's before/after
   * is a run that can be asked for rather than a build that has to be patched.
   *
   * IT STATES NO CASUS-1 NUMBER. The depth and the step frequency live in the
   * curve object, which travels as POLISH beside this key for the same reason
   * the phase-admission facts do: they are the design's own data, not a second
   * opinion the candidate brought along. */
  if (s.amplitudeReference !== undefined) {
    stated.amplitudeReference = s.amplitudeReference;
  } else if (input.targetCurve && input.targetCurve.type !== 'flat' && isImplementedCurve(input.targetCurve)) {
    stated.amplitudeReference = 'target';
  } else {
    absent.push({
      key: 'amplitudeReference',
      why:
        input.targetCurve === undefined
          ? 'this design states no target curve, so there is no voicing for the amplitude term to ' +
            'be flat against. Absent rather than a stated \'flat\' (P4): naming the neutral ' +
            'reference here would read as a decision that the voicing must not steer, and with ' +
            'no voicing stated nobody decided anything'
          : input.targetCurve.type === 'flat'
            ? 'this design states the FLAT target, which is the neutral reference and therefore ' +
              'the identity — subtracting it from the response would change no evaluation. ' +
              'Absent rather than armed: a mechanism that provably cannot move anything should ' +
              'not appear in a run as though it might have'
            : `this design states the "${input.targetCurve.type}" target curve, and it cannot be ` +
              'evaluated on the data handed over — an unimplemented shape, or a stated shape ' +
              'whose parameters did not arrive. A curve nothing can sample steers nothing, and ' +
              'saying so beats searching against a voicing that was silently taken as flat',
    });
  }

  /* ---- V47: WHICH RULE FORBIDS AN UNPROTECTED UPPER DRIVER -------------
   *
   * DERIVED, like V30's `zFloorBarrier` and V45's `amplitudeReference`, and
   * from the same shape of fact: a stated requirement that another rule
   * silently overrides is a requirement that does not decide anything. The
   * full-band safety gate refuses a whole tune whose upper-driver protection
   * deficit sits more than a fixed slack above the SEED's. That is a distance
   * to a network nobody judged against this run's goal (V31, one rule along),
   * so what it permits moves with whatever the seed happened to carry — and it
   * is applied INSTEAD of the stated requirement, not beside it.
   *
   * MEASURED ON CASUS 1, and both directions occurred in the same field of
   * fifteen. Four candidates were refused with "tweeter protection got worse"
   * while their absolute M-C reading was inside the requirement the designer's
   * own filter sets; two candidates the same field DELIVERED sat ten decibels
   * the wrong side of it and the rule said nothing, because their seeds were no
   * better. The relative rule is therefore not a stricter version of the
   * absolute one — it is a different, seed-shaped ordering of the field.
   *
   * WHY 'stated' IS NOT A WEAKENING. The requirement is still enforced, and
   * more strictly than before: `gateViolation` consults M-C at EVERY point a
   * pass accepts a network, and a run that finds nothing admissible comes back
   * as a refusal with the measured value and the limit rather than as a seed
   * (V31/V33). What is dropped is the comparison to the seed, and only when
   * there is something absolute to drop it in favour of.
   *
   * ABSENT AND NEVER `'seed'` (P4), which is the same rule V45 applies to
   * `'flat'`: a stated `'seed'` would read as "somebody decided the seed
   * comparison is the right rule here", and with no requirement stated nobody
   * decided anything. The tuner then reads its own default, which IS the seed
   * comparison — named as absent rather than inherited in silence, and kept
   * because a seed comparison without a requirement is still better than no
   * comparison at all. An explicit value still wins, so V47's before/after is a
   * run somebody can ask for rather than a build that has to be patched. */
  if (s.protectionRule !== undefined) {
    stated.protectionRule = s.protectionRule;
  } else if (
    input.driveOnFsLimitDb !== undefined ||
    Object.keys(input.driveOnFsLimitDbByDriver ?? {}).length > 0 ||
    input.driveCeilingDerived === true
  ) {
    stated.protectionRule = 'stated';
  } else {
    absent.push({
      key: 'protectionRule',
      why:
        'this design states no maximum drive on a driver\'s own resonance, so there is no ' +
        'absolute requirement for the safety gate to defer to. The tuner therefore keeps its own ' +
        'rule — the comparison against the seed — which is the pre-V47 behaviour, stated as ' +
        'absent rather than inherited in silence (P4). A stated \'seed\' would claim somebody ' +
        'chose that rule, and with nothing stated nobody chose anything',
    });
  }

  /* ---- V48: WHICH NETWORK THE SERIES-INDUCTANCE CEILING DESCRIBES ------
   *
   * DERIVED, like V45's `amplitudeReference` and V47's `protectionRule`, and
   * from the same shape of fact one rule along: a bound solved for a network
   * the search has already left is a bound that stops describing what it
   * bounds. `bump-series-l` inverts the LF budget into a ceiling on the lowest
   * way's series inductance AT A GIVEN PATH RESISTANCE, and that resistance is
   * one of the things the tune moves.
   *
   * V45 wrote the gap down and argued it was safe in one direction, correctly:
   * more series R damps the resonant half, so a ceiling solved at a LOWER path
   * resistance than the tune ends at is merely too strict. What that argument
   * leaves out is a tune that lowers the resistance — and then the ceiling is
   * PERMISSIVE. Measured on Sander's browser run of 01-09-2026: two of nine
   * candidates delivered 2.29 and 1.61 dB of resonant lift against a stated
   * 1.4. The delivered-network check caught both, which is what it is for, but
   * catching is losing — those were legitimate candidates that a ceiling
   * describing their own network would have steered instead of discarded.
   *
   * 'TUNED' IS NOT A CASUS-1 NUMBER. It states no resistance, no inductance
   * and no frequency: it says the inversion is asked at the point being
   * evaluated rather than at the point the search started from. The measured
   * inputs it is asked on travel as POLISH inside the sum group, for the same
   * reason the phase-admission facts do — they are the run's measurements, not
   * the candidate's opinion.
   *
   * ABSENT AND NEVER `'seed'` (P4), the same rule V45 applies to `'flat'` and
   * V47 to `'seed'`: with no budget stated there is no inversion, no ceiling
   * and nothing to track, so naming the seed reading would claim somebody
   * chose it. An explicit value still wins, so V48's before/after is a run
   * somebody can ask for rather than a build that has to be patched. */
  if (s.seriesInductanceCeilingSource !== undefined) {
    stated.seriesInductanceCeilingSource = s.seriesInductanceCeilingSource;
  } else if (input.lfBumpBudgetDb !== undefined) {
    stated.seriesInductanceCeilingSource = 'tuned';
  } else {
    absent.push({
      key: 'seriesInductanceCeilingSource',
      why:
        'this design states no LF-lift budget, so nothing inverts to a series-inductance ceiling ' +
        'and there is no ceiling for the tune to move underneath. Absent rather than a stated ' +
        '\'seed\' (P4): naming the seed reading would claim somebody chose which network the ' +
        'ceiling should describe, and with no budget stated nobody chose anything',
    });
  }

  /* ---- what has no value on a design of this shape -------------------- */
  absent.push({
    key: 'xoRange',
    why:
      'it pins ONE handover, and this design has ' +
      `${input.cages.length}. The same statement is made N-way by xoRangePairs, which the ` +
      'candidate does state; naming one axis here would leave the reader guessing which',
  });
  absent.push({
    key: 'xoPinHard',
    why:
      'the stiff crossing barrier belongs to the hold-the-pin repair pass, which runs only after a ' +
      'pinned axis has escaped its window. Arming it up front turns every candidate\'s cage into a ' +
      'wall, and a cage is bookkeeping rather than a promise',
  });
  if (input.multiWay) {
    for (const key of ['solo', 'soloSensitivityDb', 'soloTargetLevelDb'] as const) {
      absent.push({
        key,
        why: 'the solo family describes a single-way design, and this design has several ways',
      });
    }
  } else {
    for (const key of ['solo', 'soloSensitivityDb', 'soloTargetLevelDb'] as const) {
      absent.push({
        key,
        why:
          'this route does not generate solo candidates yet, so the candidate states nothing about ' +
          'the solo family rather than inventing a level target for it',
      });
    }
  }

  /* ---- what another named stage owns ---------------------------------- */
  delegated.push({
    key: 'branchTargets',
    to: 'the chain\'s design step',
    why:
      'the per-branch corridor is derived from the alignment and the knees that step has just ' +
      'settled, so it does not exist until it has run. Re-deriving it here would be a second ' +
      'implementation of chain logic, which is exactly how two descriptions of one thing start to ' +
      'disagree (V21, one layer up)',
  });
  delegated.push({
    key: 'angleData',
    to: 'the chain input',
    why:
      'the measured angle sets already travel in the payload as `input.angleData`. Restating them ' +
      'would put a second copy of the same measurement on the wire, and the copy is a second thing ' +
      'that can be wrong. Whether they travel at all is the app\'s decision and is visible there',
  });
  delegated.push({
    key: 'midBranch',
    to: 'the chain input',
    why:
      'the mid branch\'s response and adjustment are the payload\'s own `input.m` and `midAdjust`. ' +
      'Same argument as angleData: one copy of a measurement, not two',
  });

  return { stated: stated as ChoiceDeclaration['stated'], absent, delegated };
}

/**
 * What the designer has settled at the CHAIN layer, in the chain's own names.
 *
 * Two keys, and both of them may legitimately be empty — see
 * `declareCandidateChainChoices` for what happens then, which is not the same
 * thing for both.
 */
export type StatedByDesignerChain = Partial<
  Pick<Chain3Settings, 'eqBands' | 'leanTargetDb' | 'lowestWayLevelWork' | 'lowestWayCoilMaxHenry'>
>;

export interface ChainDeclarationInput {
  stated: StatedByDesignerChain;
  /**
   * V51 — TRUE when the project STATES that its lowest way may carry no level
   * work (`gestelde_eisen.geen_niveauwerk_op_laagste_weg` on casus 1; the
   * "no level work on the lowest way" field in the app). A boolean rather than
   * the key's value on purpose: the derivation below turns a stated requirement
   * into `'none'` and turns NOTHING into an ABSENT declaration — never into a
   * stated `'allowed'`, which would claim somebody decided the woofer may be
   * padded (P4, the same rule V45 applies to `'flat'`).
   */
  lowestWayLevelWorkForbidden?: boolean;
  /**
   * V51b — the stated MAXIMUM series resistance on the lowest way, ohms
   * (`gestelde_eisen.max_serie_R_laagste_weg_ohm` on casus 1; the "max series R
   * on lowest way" field in the app). A stated maximum is the NARROWER
   * statement — it says which part of "no level work" is relaxed and by how
   * much — so it wins over `lowestWayLevelWorkForbidden` when both are given,
   * and the derivation then declares `{ kind: 'series-r-max', maxOhm }`. Never
   * derived from nothing (P4).
   */
  lowestWaySeriesRMaxOhm?: number;
  /**
   * A5e.3b — the single-part SPAN of the lowest way's stated coil family,
   * henry (`rangeH[1]` of its fit, A5e.3). Resolved by the caller from the
   * stated model, because this layer must not read a catalogue: what it
   * derives is the FOURTH chain key, `lowestWayCoilMaxHenry` — a ceiling on
   * every coil the design and synthesis steps may propose on that way. Absent
   * = no family stated = no span = the key is absent (P4).
   */
  lowestWayCoilSpanH?: number;
  /**
   * A5e.3b — TRUE when the project STATES the stack exception: coils above the
   * single-part span may be built as a stack (two in series add L and DCR),
   * so the span caps nothing and the out-of-range flag does the talking. A
   * stated act, never a default: the derivation then declares the key ABSENT
   * with this reason rather than deriving a cap the designer lifted.
   */
  coilStackAllowed?: boolean;
}

/**
 * V41 — THE CANDIDATE'S DECLARATION OVER THE TWO CHAIN-LEVEL CHOICE KEYS.
 *
 * Both are stated UNCONDITIONALLY, which makes them the third and fourth
 * derivations in this module that hang on nothing else — the company of V37's
 * `dissipationReferenceSource` and V38-fix's `errorSmoothOct`, and for the same
 * shape of reason: the question is not conditional. Every candidate's topology
 * is designed by a step that may or may not propose corrections and built by a
 * step that may or may not decline them, so every candidate has to say what
 * those two steps were allowed to do. There is no design on which the question
 * has no answer, and therefore no honest ABSENT.
 *
 * NEITHER VALUE IS A CASUS-1 NUMBER, and that matters because a v2 default that
 * was one would be P6's exact failure.
 *
 *  · `eqBands` is `DEFAULT_EQ_BANDS_PER_DRIVER` — the app's own control default
 *    and the greedy design stage's own default, one constant with one home
 *    (`vfOptimizer.ts`). What the v2 route inherited instead was not a smaller
 *    number but NO number, and `Chain3Settings.eqBands` unstated means a silent
 *    nought inside `designThreeWay`. That is the inverse of P4: absent reads as
 *    a decision to forbid every correction, which nobody took.
 *
 *  · `leanTargetDb` is `SYNTHESIS_LEAN_DEFAULT_DB` — `synthesize`'s own
 *    threshold, the value it uses when nobody says otherwise, and it predates
 *    every casus in this book. What the chain substituted was `targets.rippleDb`,
 *    the staged pass's STOP GOAL: a number about when the tuner may stop
 *    escalating, borrowed as a number about when a driver behaves resistively
 *    enough to need no correction. Two different questions, one number, and the
 *    borrowed one is five times as wide.
 *
 * WHAT THIS DOES NOT TOUCH, and it is the same boundary V38-fix drew. The other
 * two readers of `targets.rippleDb` on this route are JUDGEMENTS — `staged`
 * (the tuner's prune and escalation goal) and `rankChain3Results` — and they
 * still read `targets`, unchanged. Only the synthesis reading moves, because
 * only the synthesis reading was measured to be the wrong question. And an
 * explicit value still wins on both keys, so V41's before/after is a run
 * somebody can ask for rather than a build that has to be patched.
 */
export function declareCandidateChainChoices(
  input: ChainDeclarationInput,
): ChainChoiceDeclaration {
  const s = input.stated;
  const stated: Partial<Pick<Chain3Settings, ChainChoiceKey>> = {};
  /* Empty until V51, and kept as a state for exactly the third key that now
   * uses it: `lowestWayLevelWork` has an honest absent case, the two above do
   * not. */
  const absent: { key: ChainChoiceKey; why: string }[] = [];
  stated.eqBands = s.eqBands ?? DEFAULT_EQ_BANDS_PER_DRIVER;
  stated.leanTargetDb = s.leanTargetDb ?? SYNTHESIS_LEAN_DEFAULT_DB;

  /* ---- V51: MAY THE LOWEST WAY CARRY LEVEL WORK -------------------------
   *
   * DERIVED, like V30's `zFloorBarrier`, V45's `amplitudeReference` and V47's
   * `protectionRule`, and from the same shape of fact: a requirement that is
   * stated and does not reach the step that could honour it is a requirement
   * that decides nothing. The level of the lowest way against the anchor is
   * settled in the DESIGN step (its trim) and realised in the SYNTHESIS step
   * (its pad) — both before the tuner exists — so a project that forbids level
   * work there has to say so at this layer or the woofer is padded before any
   * gate can see it.
   *
   * MEASURED ON CASUS 1 AT V50: every delivered design paid the woofer's
   * surplus over the mid in a series resistor, 14–35 W in one part at 100 W
   * continuous, and the resistor requirement then condemned all of them. That
   * is not a filter fault but a configuration fact, and this key is what lets
   * the configuration be stated instead of discovered in a watt column.
   *
   * ABSENT AND NEVER `'allowed'` (P4), the same rule V45 applies to `'flat'`
   * and V47 to `'seed'`: a stated `'allowed'` would read as "somebody decided
   * the lowest way may be padded", and with no requirement stated nobody
   * decided anything. The chain then reads its own default, which IS allowed —
   * named as absent rather than inherited in silence. An explicit value still
   * wins, so V51's before/after is a run somebody can ask for. */
  if (s.lowestWayLevelWork !== undefined) {
    stated.lowestWayLevelWork = s.lowestWayLevelWork;
  } else if (
    typeof input.lowestWaySeriesRMaxOhm === 'number' &&
    Number.isFinite(input.lowestWaySeriesRMaxOhm) &&
    input.lowestWaySeriesRMaxOhm >= 0
  ) {
    /* V51b — the stated maximum: series resistance up to this total, no pad.
     * The narrower statement, so it goes before the blanket prohibition. */
    stated.lowestWayLevelWork = { kind: 'series-r-max', maxOhm: input.lowestWaySeriesRMaxOhm };
  } else if (input.lowestWayLevelWorkForbidden === true) {
    stated.lowestWayLevelWork = 'none';
  } else {
    absent.push({
      key: 'lowestWayLevelWork',
      why:
        'this project states no requirement about level work on its lowest way, so the design ' +
        'and synthesis steps keep their own behaviour — the lowest way is trimmed down to the ' +
        'quietest way and padded to realise it. Absent rather than a stated \'allowed\' (P4): ' +
        'naming it here would claim somebody decided the lowest way may be padded, and with ' +
        'nothing stated nobody decided anything',
    });
  }

  /* ---- A5e.3b: THE COIL-SPAN CEILING OF THE LOWEST WAY ------------------
   *
   * DERIVED from the stated coil family (A5e.3), in the shape every other
   * derivation here takes: a family that is stated and whose span never
   * reaches the step that seeds the coils is a statement that decides
   * nothing — the A5e.3-veld corpus seeded 22–36 mH traps against a family
   * whose largest single part is 22.0 mH, flagged them out-of-range and built
   * them anyway. An explicit value wins; the STACK EXCEPTION is a stated act
   * and produces an absent key with that reason (a lifted cap is a decision,
   * not a hole); no family, no span, absent with the P4 reason. */
  if (s.lowestWayCoilMaxHenry !== undefined) {
    stated.lowestWayCoilMaxHenry = s.lowestWayCoilMaxHenry;
  } else if (input.coilStackAllowed === true) {
    absent.push({
      key: 'lowestWayCoilMaxHenry',
      why:
        'the project states the STACK EXCEPTION (A5e.3b): coils above the family\'s single-part ' +
        'span may be built as a series stack, so no span ceiling is derived and the ' +
        'out-of-range flag on each coil says when a value needs one',
    });
  } else if (
    typeof input.lowestWayCoilSpanH === 'number' &&
    Number.isFinite(input.lowestWayCoilSpanH) &&
    input.lowestWayCoilSpanH > 0
  ) {
    stated.lowestWayCoilMaxHenry = input.lowestWayCoilSpanH;
  } else {
    absent.push({
      key: 'lowestWayCoilMaxHenry',
      why:
        'this project states no coil family for its lowest way (A5e.3), so there is no ' +
        'catalogue span to cap the coils with — the design and synthesis steps keep their own ' +
        'behaviour and every coil value is free (P4)',
    });
  }
  return { stated, absent };
}
