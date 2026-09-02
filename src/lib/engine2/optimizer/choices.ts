/**
 * F4c — WHAT IS SEARCHED versus HOW IT IS SEARCHED.
 *
 * `NetOptimizeOptions` had 37 top-level keys when F4c classified them — 38
 * since V30 added `zFloorBarrier`, 39 since V31 added `rejectedTuneReport`,
 * 41 since V33 added `zFloorBarrierSource` (choice) beside
 * `zFloorBarrierImpedance` (polish), 42 since V34 added
 * `rSourceProbeSource` (choice), and 44 since V37 added
 * `dissipationReferenceSource` (choice) beside `dissipationReferenceReOhm`
 * (polish). V38-fix adds no key and RECLASSIFIES one: `errorSmoothOct` moves
 * from POLISH to CHOICE, so the total stays 44 and the split becomes 30/5/9.
 * V44 adds two (`phaseAdmission` choice, `phaseAdmissionFacts` polish) for 46
 * and 31/5/10, V45 two more (`amplitudeReference` choice, `amplitudeTargetDb`
 * polish) for 48 and 32/5/11, and V47 ONE — `protectionRule`, a choice with no
 * polish companion, because the requirement it defers to is already on the wire
 * as a GATE — for 49 and 33/5/11.
 * The count is asserted rather than
 * described (`choiceKeyGuard.test.ts`). Until F4c the v2 route set four of
 * them and inherited the other 33 verbatim from whatever the v1 chain happened
 * to build (`audit §2.2`). That is harmless while v1 also chooses the
 * candidates — the options and the candidate come from the same place, so they
 * agree by construction. It stops being harmless the moment v2 supplies its own
 * candidate: a v1 slope target, a v1 cage or a v1 pin would quietly pull that
 * candidate back toward the v1 choice, and nothing would say so.
 *
 * So every key is classified, once, here:
 *
 *   CHOICE  — decides WHAT is searched. Where the handover sits, which flank
 *             gets which order, which slope, whether the catalogue binds, what
 *             the goal is, which band is judged, what is forbidden outright.
 *             On the v2 route these may only come from the candidate.
 *   GREY    — a weight that shapes the scalar, and therefore decides which part
 *             of the field the search ever visits (audit §6.4). Polish in form,
 *             choice in effect. On the v2 route these must be stated
 *             EXPLICITLY, even when the value stated is the one v1 would have
 *             passed — saying "inherited" beats inheriting silently.
 *   POLISH  — decides HOW the search runs inside a given choice: iteration
 *             count, smoothing of the error measure, numerical safety,
 *             instrumentation. These may be inherited.
 *
 * WHAT THIS FILE DOES NOT DO. It does not choose anything. In F4c the candidate
 * object is filled with exactly the values the v1 chain supplies today, so the
 * v2 route's behaviour is unchanged and `f4cRegression.test.ts` proves it on two
 * seeds. The whole delivery is that the values now cross the border NAMED
 * instead of riding along in a spread.
 *
 * THE LISTS ARE DATA, NOT DOCUMENTATION. `choiceKeyGuard.test.ts` reads them to
 * scan `engine2/` for a choice key arriving through a `tuneOptions` spread, and
 * `f4cCoverage.test.ts` asserts that the three lists together are exactly the
 * key set of `NetOptimizeOptions` — a key added upstream without a class fails
 * the build rather than defaulting to "inherit".
 */

import { AMP_FLOOR_BARRIER_WEIGHT, type NetOptimizeOptions } from '../../netOptimizer.ts';

/* ------------------------------------------------------------------ *
 * CHOICE — what is searched
 * ------------------------------------------------------------------ */

/**
 * Every key that decides WHAT is searched.
 *
 * Grouped by the question each one answers, because the grouping is the
 * argument: a reader who disagrees with a classification should be able to see
 * which question it was filed under.
 */
export const CHOICE_KEYS = [
  /* --- where the handover sits --- */
  'xoRange',
  'xoRangePairs',
  'xoFloorPairs',
  'xoPinHard',
  /* --- what shape each flank has --- */
  'acousticSlopes',
  'branchTargets',
  'staged',
  /* --- which curve is judged, and over what --- */
  'band',
  'ampTarget',
  'powerMetric',
  'phaseMetric',
  /* …and WELKE PUNTEN een fase-oordeel mogen dragen. V44, and a choice for
   * exactly the reason `zFloorBarrierSource` (V33) and `rSourceProbeSource`
   * (V34) are: it names the points at which a judged quantity is measured, and
   * `phaseMetric` beside it cannot state this — both of ITS values average over
   * the overlap window, so the weighting and the admission are two questions.
   * Measured on casus 1: over one and the same network the two admissions read
   * 59.15 deg and 17.05 deg, and the requirement `phase-tracking` judges on
   * this number. A key that can do that is not polish (casebook V40/V44). */
  'phaseAdmission',
  /* …and WAARTEGEN de amplitudeterm vlak is. V45 (A5e.2), and the fifth key of
   * this family: `band` names the frequencies, `ampTarget` names which SUM,
   * `phaseAdmission` names the points, and this names the REFERENCE the
   * amplitude is judged against — horizontal, or the design's stated voicing.
   *
   * It is a choice and not polish because it decides what "flat" means, which
   * is the acceptance question itself. Until V45 a stated target curve moved
   * the shortlist's window and RMS and moved nothing in the search, so a design
   * was searched against horizontal and judged against a plateau; the search
   * has the whole budget and wins that argument every time. */
  'amplitudeReference',
  'angleData',
  /* --- what the topology IS --- */
  'midBranch',
  'solo',
  'soloSensitivityDb',
  'soloTargetLevelDb',
  /* --- whether the catalogue binds --- */
  'catalogSnap',
  'snapPrefs',
  /* --- what is forbidden outright --- */
  'rSourceDisqualifyOhm',
  /* …and WHICH RULE forbids an unprotected upper driver. V47, and it belongs
   * in this family rather than beside `safety` because it does not decide
   * whether the full-band set is watched — it decides what the watching
   * COMPARES AGAINST.
   *
   * `'seed'` is the historic rule: the tuned network's protection deficit may
   * not exceed the SEED's by more than a fixed slack. That is a distance to a
   * network nobody judged against anything this run was asked for (V31, one
   * rule along), and what it permits therefore moves with the seed. `'stated'`
   * drops the comparison, and is only honest when an absolute requirement is
   * enforced elsewhere — on the v2 route the M-C gate, armed from the project's
   * own stated limit.
   *
   * MEASURED ON CASUS 1 AT V47, and both directions occurred in one field: the
   * relative rule refused four of fifteen candidates whose ABSOLUTE drive on
   * the tweeter's resonance was inside the requirement the designer's own
   * filter sets, while designs the same field delivered sat ten decibels the
   * wrong side of it and the rule said nothing, because their seeds were poor
   * too. A key that reorders the field that way is not polish. */
  'protectionRule',
  /* …and WHERE that limit is compared. V34, and it is a choice for exactly the
   * reason `zFloorBarrierSource` is one, one quantity along: it names the
   * frequency a hard limit is measured at. Measured on casus 1 — read at the
   * chain grid's probe the three v1 baselines carry 0.50/0.47/0.68 Ω, read at
   * the woofer's real impedance peak they carry 3.98/4.59/2.55 Ω, against the
   * same 2.0 Ω limit. One source passes all three, the other disqualifies all
   * three, and the designer's own best filter is among them. A key that can do
   * that is not polish (casebook V34). */
  'rSourceProbeSource',
  'loadFloor',
  'ampMinLoadOhm',
  'zFloorStrict',
  /* …and whether that last one STEERS or only vetoes. `zFloorBarrier` is a
   * boolean about a barrier term, which looks like polish and is not: it
   * decides what the search calls good. With it off the tuner optimises a
   * network and is then asked whether the amplifier can drive it; with it on
   * the ohms are part of the answer it is looking for. Two different searches,
   * so a choice (casebook V30). */
  'zFloorBarrier',
  /* …and WHERE that steering is measured. V33, and it is a choice for the
   * same reason `band` is one: it names the band a requirement is judged over.
   * With the evaluation grid the search aims at the |Z| minimum above the
   * far-field span; with the measured sweep it aims at the one M-B/|Z|
   * actually enforces. Same weight, same term, two different searches — and
   * on casus 1 the difference was five candidates whose entire value tune the
   * gate refused for a dip the objective could not see (casebook V33). */
  'zFloorBarrierSource',
  /* …and V37, one term along: WHAT the dissipation term divides by. A choice
   * because it does not tune how the search runs — it DEFINES the quantity a
   * weighted term measures. `dissipationWeight · (R_source/x)²` exists to slow
   * the series-R route to level matching, and the damage that route does is
   * Q_es multiplication, `1 + R_source/R_e` with R_e the DC resistance (A3j
   * row 23, A4 M-E). With `x = Re(Z)` at the probe the term measures something
   * else, and since V34 that probe sits on the low driver's impedance peak:
   * measured on casus 1, 19.31 Ω against a metered 3.05 Ω, squared to 40.1.
   * Two searches that divide by those two numbers are looking for different
   * networks — 3 % of the objective against 0.07 % — so this is the same class
   * as `band`, one quantity along (casebook V37). */
  'dissipationReferenceSource',
  /* …and V38-fix, one step earlier than all of those: WHAT CURVE the amplitude
   * term measures at all. Classified POLISH at F4c on the reading that it
   * "smooths the search error measure; gates and targets stay on the raw grid"
   * — true as a description of the code and wrong about what it costs, which
   * is why it took a measurement to move it.
   *
   * WHAT IT ACTUALLY DOES, measured rather than reasoned. The tuner's amplitude
   * term is the spread of the summed response over the judged band; every
   * downstream judgement reads that same sum, unsmoothed. Smoothing it first
   * does not merely blur it: a Gaussian kernel in log-f reaches ACROSS the band
   * edge, and on a grid that runs past the drivers' measured extent the point
   * beyond the edge is the silent ghost at -400 dB. On casus 1 that drags the
   * last point inside the band from 130.95 to 43.67 dB, so the search's
   * amplitude term reads 9.6-10.9 dB across the whole frozen corpus where the
   * real spread runs 0.60-3.81. It does not offset the objective; it COMPRESSES
   * it — the design the judgement calls worst ranks 16th of 80 on the search
   * measure. Delivered, one key at a time: 0.55 to 2.45 dB on three separate
   * topologies (casebook V38, V38-fix).
   *
   * A key that decides which network wins by two and a half decibels does not
   * decide HOW the search runs. It is the same class as `band`: it names the
   * quantity the amplitude term is a statistic of. So on the v2 route it may
   * only come from the candidate, and it may never migrate back — that is what
   * `choiceKeyGuard.test.ts` pins. */
  'errorSmoothOct',
  /**
   * V48 — WHICH NETWORK THE SERIES-INDUCTANCE CEILING DESCRIBES.
   *
   * A choice by the same test the four pairs before it pass: it decides which
   * QUANTITY bounds the search, not how well the search is polished. The
   * A5d.6 inversion `bump-series-l` turns the LF budget into a ceiling on the
   * lowest way's series inductance at a given path resistance — and the tune
   * moves that resistance. `'seed'` bounds the search by the ceiling of the
   * network it STARTED from; `'tuned'` by the ceiling of the network it is
   * building. On casus 1 that is the difference between a candidate that
   * delivers and one the delivered-network check throws away at the end.
   *
   * ITS DATA IS ALREADY FILED. Unlike V33, V34, V37, V44 and V45 this key has
   * no POLISH twin: the measured near field and sweep the inversion reads
   * travel inside `valueSumCeilings`, which has been polish since F2 for
   * exactly the stated reason — it is a measurement the run already holds.
   */
  'seriesInductanceCeilingSource',
  'breakupGuard',
  'safety',
  'audit',
] as const;

export type ChoiceKey = (typeof CHOICE_KEYS)[number];

/**
 * The candidate, as far as the TUNER is concerned.
 *
 * A5d is the pre-design layer and F4d is what fills this from it; in F4c it is
 * filled from the chain settings the v1 route already carries. Deliberately a
 * `Pick` of the tuner's own option type rather than a parallel vocabulary: a
 * second set of names for the same knobs is a translation layer, and a
 * translation layer is where the two descriptions drift apart.
 */
export type CandidateChoices = Pick<NetOptimizeOptions, ChoiceKey>;

/* ------------------------------------------------------------------ *
 * GREY — weights that are choices in effect
 * ------------------------------------------------------------------ */

/**
 * Weights that shape the scalar and therefore steer which part of the field the
 * search visits (audit §6.4).
 *
 * They are not choices in FORM — none of them names a frequency, an order or a
 * topology — and that is exactly why they were never noticed: a weight looks
 * like a tuning detail right up to the point where it decides that the phase
 * answer beats the dissipation answer. Left inherited, a v2 candidate would be
 * judged by whatever balance the v1 UI happened to be showing.
 */
export const GREY_KEYS = [
  'phasePriority',
  'directivityWeight',
  'powerFoldWeight',
  'dissipationWeight',
  'costWeight',
] as const;

export type GreyKey = (typeof GREY_KEYS)[number];
export type GreyWeights = Pick<NetOptimizeOptions, GreyKey>;

/* ------------------------------------------------------------------ *
 * POLISH — how the search runs
 * ------------------------------------------------------------------ */

/**
 * Keys that decide HOW, inside a given choice. These may be inherited.
 *
 * `gateViolation`, `valueCeilings` and `valueSumCeilings` are here because the
 * v2 route has owned them since F2 — they are not inherited from anything, and
 * `run.ts` has always overwritten them.
 *
 * "MAY BE INHERITED" IS A CLAIM, AND ONE OF THEM WAS FALSE. `errorSmoothOct`
 * sat in this list from F4c until V38-fix on the reading that a resolution
 * knob cannot change which network wins; measured, it changed it by up to
 * 2.45 dB and it is a CHOICE now. What survives that is worth stating, because
 * it is what makes the remaining entries different in kind rather than merely
 * unmeasured: `onStage` and `onGateEvaluated` return `void` and are never read
 * by the engine, so they cannot alter an outcome by construction — that is a
 * property of their type, not an assumption. `maxIterations` is the one
 * genuine survivor: it decides where the search STOPS, nothing on the v2 route
 * states it unless a determinism budget does, and nobody has measured what it
 * costs. Recorded in casebook V38-fix as the next key to hold to the same
 * standard, and deliberately NOT moved here on suspicion — the whole lesson of
 * this row is that a classification changes when a measurement changes it.
 */
export const POLISH_KEYS = [
  'maxIterations',
  'onStage',
  'onGateEvaluated',
  'gateViolation',
  'valueCeilings',
  'valueSumCeilings',
  /* V31 — instrumentation, and the classification is the argument. It changes
   * no decision anywhere: the safety gate still rejects exactly what it
   * rejected, the seed is still what comes back. All it does is make the
   * rejected tune's metrics and parts readable, so a caller can report a
   * refusal instead of publishing a seed. A key that cannot alter an outcome
   * is not a choice about what is searched. */
  'rejectedTuneReport',
  /* V33 — the measurement the choice above names, handed over by the caller
   * that already holds it. Polish for the same reason `gateViolation` is: it
   * carries no decision. WHICH grid the barrier reads is
   * `zFloorBarrierSource`, a choice; what is ON that grid is the run's own
   * measured sweep, and restating it as a candidate value would put a second
   * copy of one measurement on the wire (the angleData argument, again). */
  'zFloorBarrierImpedance',
  /* V37 — the measurement the choice above names, handed over by the caller
   * that already holds it. Polish for exactly the reason
   * `zFloorBarrierImpedance` is: it carries no decision. WHICH quantity the
   * dissipation term divides by is `dissipationReferenceSource`, a choice; what
   * that quantity IS for a given driver is the run's own resolved R_e, walked
   * once by the ingest pass (A5c.1) and already on the wire as a measured fact.
   * Restating it as a candidate value would put a second copy of one
   * measurement on the wire — and worse, a second opinion about a hierarchy
   * that has one implementation on purpose (F4b leak 1, V21). */
  'dissipationReferenceReOhm',
  /* V44 — the measurement the choice above names, handed over by the caller
   * that already holds it. Polish for the same reason the two entries above
   * are: it carries no decision. WHICH points a phase judgement may rest on is
   * `phaseAdmission`, a choice; the validity band and the silent-ghost
   * convention that those grounds read are the run's own measured facts,
   * derived once by the ingest pass (A5b.1) and already on the wire. A
   * candidate that brought its own validity band would be a second opinion
   * about a hierarchy that has one implementation on purpose. */
  'phaseAdmissionFacts',
  /* V45 — the curve the choice above names, sampled by the caller that already
   * holds it. Polish for the same reason the three entries above are: it
   * carries no decision. WHETHER the amplitude term measures against the target
   * is `amplitudeReference`, a choice; WHAT the target is for this design is
   * the design's own target-curve object (A5e.2), evaluated once and already on
   * the wire. A candidate that brought its own voicing would be a second
   * opinion about which loudspeaker is being designed — and the whole reason
   * the curve hangs on the design rather than on the project is so that two
   * voicings can be COMPARED instead of toggled. */
  'amplitudeTargetDb',
] as const;

export type PolishKey = (typeof POLISH_KEYS)[number];

/** What a v2 caller may still hand over as ordinary tuner options. */
export type InheritableTuneOptions = Omit<NetOptimizeOptions, ChoiceKey | GreyKey>;

/* ------------------------------------------------------------------ *
 * Fingerprint
 * ------------------------------------------------------------------ */

/**
 * The stated choices and weights, as a fingerprint ingredient.
 *
 * Only keys that are actually SET appear, and functions are recorded by
 * presence rather than by identity — `onStage` is a different closure on every
 * run and hashing it would make every run unique, which is the opposite of what
 * a fingerprint is for. Arrays and objects go in as-is; the ingredient is
 * digested afterwards.
 */
export function choicesKey(
  choices: Partial<CandidateChoices> | undefined,
  weights: Partial<GreyWeights> | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const put = (target: string, keys: readonly string[], src: Record<string, unknown> | undefined) => {
    const bag: Record<string, unknown> = {};
    for (const k of [...keys].sort()) {
      const v = src?.[k];
      if (v === undefined) continue;
      bag[k] = typeof v === 'function' ? 'set' : v;
    }
    out[target] = bag;
  };
  put('choices', CHOICE_KEYS, choices as Record<string, unknown> | undefined);
  put('weights', GREY_KEYS, weights as Record<string, unknown> | undefined);
  const grey = greyValues(choices);
  if (Object.keys(grey).length > 0) out.greyValues = grey;
  return out;
}

/* ------------------------------------------------------------------ *
 * GREY VALUES — numbers inside the tuner that a v2 choice switches on
 * ------------------------------------------------------------------ */

/**
 * Numbers that are not options and are not v2-derived, but that a stated
 * choice hands the search anyway.
 *
 * `GREY_KEYS` covers weights the caller can SET. This covers the other kind:
 * a constant that lives inside `netOptimizer.ts`, was tuned there for a
 * different purpose, and becomes load-bearing on the v2 route the moment a
 * candidate arms the choice that reads it. `AMP_FLOOR_BARRIER_WEIGHT` is the
 * first — 1200, tuned for the repair pass, and nothing has ever measured
 * whether that stiffness is right for a full search (casebook V30).
 *
 * It travels in the fingerprint WITH its provenance, not as a bare number.
 * Two runs that differ only in this weight must be distinguishable, and a
 * reader who meets it in a stamp must be able to tell an inherited constant
 * from a derived one — the confusion V21, V22 and V25 each ended up being
 * about. Recorded only when the choice that reads it is actually stated: an
 * unarmed barrier does not hand the search anything.
 */
export function greyValues(
  choices: Partial<CandidateChoices> | undefined,
): Record<string, { value: number; origin: string }> {
  const out: Record<string, { value: number; origin: string }> = {};
  if (choices?.zFloorBarrier === true) {
    out.zFloorBarrierWeight = {
      value: AMP_FLOOR_BARRIER_WEIGHT,
      origin:
        'overgenomen uit v1, niet v2-afgeleid — de stijfheid van de reparatiebarrière, daar ' +
        'gemeten voor een lokale reparatiepas en hier hergebruikt als zoekterm (V30)',
    };
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * F4d — the candidate's DECLARATION over the choice keys
 * ------------------------------------------------------------------ */

/**
 * WHY A DECLARATION AND NOT JUST A VALUE BAG.
 *
 * F4c stated ten of the twenty-five choice keys and named the other fifteen in
 * a note that began "still inherited from the v1 chain". That note was the
 * honest thing to write at the time and it is exactly what F4d has to remove —
 * but removing it by giving all fifteen a value is not possible, and pretending
 * otherwise would be worse than the note. Three of them do not HAVE a value on
 * a three-way handover design (the solo family), one is a repair-pass barrier
 * nobody sets up front (`xoPinHard`), two carry measurement arrays that are
 * already in the payload (`angleData`, `midBranch`), and one is computed inside
 * the design step out of the alignment it just chose (`branchTargets`).
 *
 * So a key is in exactly one of three states, and the state itself is the
 * declaration:
 *
 *   STATED    — the candidate carries a value. It wins over whatever the chain
 *               built, because the hook merges last.
 *   ABSENT    — the candidate declares that this key has no value on this
 *               design, WITH THE REASON. Different from undefined: undefined is
 *               indistinguishable from nobody having thought about it, which is
 *               the failure mode row 39 of the V26 table records.
 *   DELEGATED — the candidate declares that another named stage owns this key,
 *               WITH THE REASON. `branchTargets` is delegated to the design
 *               step because re-deriving it here would be a second
 *               implementation of chain logic, and two descriptions of one
 *               thing is how V21 happened.
 *
 * `choiceKeyGuard.test.ts` asserts that the three states together cover
 * `CHOICE_KEYS` exactly, with no key in two of them and none in none. That is
 * what makes "no choice is inherited any more" a claim the build can check
 * rather than a sentence in a commit message.
 */
export interface ChoiceDeclaration {
  /** Keys the candidate carries a value for. */
  stated: Partial<CandidateChoices>;
  /** Keys that have no value on this design, each with the reason. */
  absent: readonly { key: ChoiceKey; why: string }[];
  /** Keys another named stage owns, each with the stage and the reason. */
  delegated: readonly { key: ChoiceKey; to: string; why: string }[];
}

/** What a declaration says about the key set — the guard reads this. */
export interface DeclarationCoverage {
  /** Keys in no state at all. Non-empty means something is still inherited. */
  missing: ChoiceKey[];
  /** Keys claimed by more than one state. */
  duplicated: ChoiceKey[];
  complete: boolean;
}

export function declarationCoverage(d: ChoiceDeclaration): DeclarationCoverage {
  const seen = new Map<string, number>();
  const bump = (k: string) => seen.set(k, (seen.get(k) ?? 0) + 1);
  for (const k of Object.keys(d.stated)) bump(k);
  for (const a of d.absent) bump(a.key);
  for (const g of d.delegated) bump(g.key);
  const missing = CHOICE_KEYS.filter((k) => !seen.has(k));
  const duplicated = CHOICE_KEYS.filter((k) => (seen.get(k) ?? 0) > 1);
  return { missing, duplicated, complete: missing.length === 0 && duplicated.length === 0 };
}

/**
 * The declaration as a fingerprint ingredient.
 *
 * The REASONS travel too, and not for readability: a key that moves from
 * delegated to absent is a different run even when no value changed, because
 * something else is now deciding it. Values go through `choicesKey` so the two
 * halves are digested the same way.
 */
export function declarationKey(
  d: ChoiceDeclaration | undefined,
  weights: Partial<GreyWeights> | undefined,
): Record<string, unknown> {
  const base = choicesKey(d?.stated, weights);
  return {
    ...base,
    absent: [...(d?.absent ?? [])]
      .map((a) => [a.key, a.why] as const)
      .sort((x, y) => (x[0] < y[0] ? -1 : 1)),
    delegated: [...(d?.delegated ?? [])]
      .map((g) => [g.key, g.to, g.why] as const)
      .sort((x, y) => (x[0] < y[0] ? -1 : 1)),
  };
}
