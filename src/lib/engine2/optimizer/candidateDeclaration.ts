/**
 * F4d — THE CANDIDATE'S DECLARATION OVER EVERY CHOICE KEY.
 *
 * Twenty-five at F4d, twenty-six since V30 added `zFloorBarrier`,
 * twenty-seven since V33 added `zFloorBarrierSource`, twenty-eight since
 * V34 added `rSourceProbeSource`, twenty-nine since V37 added
 * `dissipationReferenceSource`, thirty since V38-fix RECLASSIFIED
 * `errorSmoothOct` out of polish and thirty-one since V44 added
 * `phaseAdmission`. The number
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
import type { ChoiceDeclaration, ChoiceKey } from './choices.ts';
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
  /** True when this design has more than one way — i.e. is not a solo design. */
  multiWay: boolean;
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
    stated.zFloorBarrierSource = 'safety';
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
export type StatedByDesignerChain = Partial<Pick<Chain3Settings, 'eqBands' | 'leanTargetDb'>>;

export interface ChainDeclarationInput {
  stated: StatedByDesignerChain;
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
  /* Always empty today, and kept as a state rather than dropped: the shape is
   * what `chainDeclarationCoverage` checks, and a third key that DOES have an
   * absent case must have somewhere to go without changing this signature. */
  const absent: { key: ChainChoiceKey; why: string }[] = [];
  stated.eqBands = s.eqBands ?? DEFAULT_EQ_BANDS_PER_DRIVER;
  stated.leanTargetDb = s.leanTargetDb ?? SYNTHESIS_LEAN_DEFAULT_DB;
  return { stated, absent };
}
