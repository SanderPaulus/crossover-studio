/**
 * H-2 — THE HYBRID AS SOMETHING A DESIGNER CAN TICK: the stated active side,
 * read off the form. H-2b — "HYBRID MODE", AND THE LEAN FORM: two measured
 * ways are enough.
 *
 * WHAT H-1 LEFT OPEN. H-1 built the whole of the hybrid route — the stated
 * handover, the modelled branch that joins every ACOUSTIC composition and no
 * ELECTRICAL one, the class-A DSP derivation, the target block — and ended with
 * "the app has no way to state an active side": the only route through it was a
 * fixture and a script. This module is the form's half of that sentence. It
 * decides nothing about physics; it reads the fields and answers one question
 * — is there a hybrid to run here, IN WHICH FORM, and if not, WHICH input is
 * missing.
 *
 * THE FORM FOLLOWS FROM WHAT IS MEASURED — no extra button (H-2b):
 *
 *   · THREE measured ways: the MEASURED form (H-1). The lowest way is the
 *     active side, judged as a modelled branch (its measurement times the
 *     stated low-pass at a derived gain, delay and polarity); the passive
 *     network is the two ways above it.
 *   · TWO measured ways: the LEAN form. The active side is UNMEASURED — not in
 *     the project at all. Nothing models it and nothing is blocked: the
 *     lowest passive way gets its acoustic high-pass target (the stated
 *     frequency and shape), every candidate is judged on its TARGET-FLANK
 *     ERROR, and every figure that needs the sum — ripple, window, lobing, the
 *     DSP gain — is reported as NOT JUDGED rather than left blank (F0).
 *
 * P4 THROUGHOUT. Unticked is not "off by default" in the sense of a value — it
 * is the absence of a statement, and every way is then part of the passive
 * network exactly as it always was. A ticked box with nothing behind it is not
 * a hybrid either: it is a question with its inputs missing, and this module
 * names them rather than guessing one.
 *
 * NO ENGINE IMPORT, on purpose: this is the form's own vocabulary, and the
 * toggle-regression scan lets only the UI entry points reach into `engine2/`.
 * What the ENGINE does with the answer lives in `activeSide.ts` (the
 * derivation and the lean form's complement), `chainChoices.ts` (the seventh
 * chain key) and `dspTarget.ts` (the deliverable).
 */

import { parseHandoverList } from './frequencyList.ts';
import type { BranchRole } from './driverSlots.ts';

/**
 * The roles a MEASURED-form hybrid puts in each part, in the app's own
 * vocabulary.
 *
 * DATA rather than three `if`s in the component, for the reason the placement
 * rule is data: the question "which way does the app declare active" has one
 * answer and several readers — the run, the report settings, the measurement
 * card's note and the panel's own sentence — and three of them reading it from
 * a literal is how the four drift apart. The LEAN form's roles are derived
 * from what is measured (`activeSideRolesFor`), and this constant is the
 * three-measured-ways case of that derivation.
 */
export const ACTIVE_SIDE_ROLES = {
  /** The way the DSP drives. Measured, judged, and in no branch of the netlist. */
  active: 'low',
  /** The lowest way the passive network still carries — the one that gets the high-pass. */
  lowestPassive: 'mid',
  /** The way above it. */
  highest: 'high',
} as const;

/** The roles a hybrid puts in each part, for whichever form what is measured admits. */
export interface ActiveSideRoles {
  /** The active way's role, or null in the lean form: it is not in the project. */
  active: BranchRole | null;
  lowestPassive: BranchRole;
  highest: BranchRole;
}

/**
 * How many measured ways the MEASURED form needs.
 *
 * THREE: one for the active side and two for a passive network that is still
 * a crossover. The LEAN form needs TWO (H-2b) — the passive pair alone, with
 * the active side unmeasured.
 */
export const ACTIVE_SIDE_WAYS_NEEDED = 3;
export const ACTIVE_SIDE_LEAN_WAYS_NEEDED = 2;

/** One acoustic target shape a designer may state for the handover. */
export interface ActiveSideShape {
  /** The value the select stores. */
  value: string;
  kind: 'LR';
  order: 2 | 4;
  label: string;
}

/**
 * The shapes the form offers.
 *
 * TWO, and they are the two the design step's own library holds for this
 * question (`AUTO_STRUCTS` restricted to LR, which is what casus 1 and casus 1h
 * both state). The shape is the ACOUSTIC target of BOTH flanks — naming LR4
 * says the passive way must arrive at an acoustic LR4 high-pass and the DSP at
 * its low-pass mirror — so it is stated once and read twice, never twice.
 */
export const ACTIVE_SIDE_SHAPES: readonly ActiveSideShape[] = [
  { value: 'LR4', kind: 'LR', order: 4, label: 'LR4 (24 dB/oct)' },
  { value: 'LR2', kind: 'LR', order: 2, label: 'LR2 (12 dB/oct)' },
];

/** The stated shape, or null when nothing usable was stated (P4). */
export function activeSideShape(value: string): ActiveSideShape | null {
  return ACTIVE_SIDE_SHAPES.find((s) => s.value === value.trim()) ?? null;
}

/** One way of the project, and whether its on-axis response is loaded. */
export interface ActiveSideWay {
  role: BranchRole;
  measured: boolean;
}

/** What the form and the project say, in the terms this module reads them in. */
export interface ActiveSideFormInput {
  /** The tick box: anything other than the empty string is a tick. */
  on: string;
  /** The handover list exactly as typed. */
  handoversRaw: string;
  /** The shape select. */
  shape: string;
  /** The processor latency exactly as typed; '' = not stated. */
  latencyRaw?: string;
  /** H-3b — the flank-error budget exactly as typed (dB rms); '' = not stated, the flank is reported and not judged. */
  flankBudgetRaw?: string;
  /** The project's ways, LOW TO HIGH, with whether each has a measured response. */
  ways: readonly ActiveSideWay[];
}

/** What the form amounts to, and what is missing when it amounts to nothing. */
export interface ActiveSideStatement {
  /**
   * The ACT: the designer ticked the box. True even when the run cannot be
   * assembled, because "you asked for this and here is what is missing" is a
   * different answer from "nobody asked" (P4), and the app owes the first.
   */
  asked: boolean;
  /** The stated handovers, Hz, verbatim and in the order they were typed. */
  handoversHz: number[];
  /** The list read back, exactly as the app understood it ("read: 362.3 · 400 Hz"), or null when empty. */
  read: string | null;
  shape: ActiveSideShape | null;
  /** The stated processor latency, ms, or null when not stated or unreadable. */
  processorLatencyMs: number | null;
  /**
   * H-3b — the stated flank-error budget, dB rms over the handover band, or
   * null when not stated or unreadable. A JUDGEMENT input and not a nice one:
   * stated, it is a hard requirement on every delivered or tuned network of a
   * hybrid run (`ActiveHandover.flankBudgetDbRms`); blank, the flank is
   * measured and reported and nothing judges it (P4). It arms and disarms
   * nothing about the hybrid itself.
   */
  flankBudgetDbRms: number | null;
  /**
   * H-2b — WHICH FORM what is measured admits: `measured` (three ways, the
   * active side modelled), `unmeasured` (two ways, the lean form), or null
   * when neither can be assembled.
   */
  form: 'measured' | 'unmeasured' | null;
  /** The roles of the form, or null when there is none. */
  roles: ActiveSideRoles | null;
  /** True when a hybrid run can be assembled from what is on screen. */
  armed: boolean;
  /** What is missing, by name. Empty exactly when `armed`. */
  off: string[];
  /** What could not be read out of the list or the latency, token by token. */
  problems: string[];
}

/** The label the handover list is parsed under, in every problem it produces. */
export const ACTIVE_HANDOVER_LABEL = 'active handover';

/** The label the latency is parsed under. */
export const ACTIVE_LATENCY_LABEL = 'processor latency';

/** H-3b — the label the flank-error budget is parsed under. */
export const ACTIVE_FLANK_BUDGET_LABEL = 'flank-error budget';

/**
 * H-3b — the sentence beside a flank figure on a hybrid run that states NO
 * budget: reported, judged by nothing (P4). One home, two readers (the panel's
 * statement and the result area).
 */
export const ACTIVE_SIDE_FLANK_UNJUDGED =
  'the target-flank error is measured and reported on every hybrid run; no flank-error budget is stated, so nothing judges it';

/**
 * H-2b — WHICH FORM the measured ways admit, and the roles of it.
 *
 * Measured ways are read LOW TO HIGH. Three measured: the lowest is active,
 * the two above are the passive pair. Exactly two measured, and they are the
 * two HIGHEST roles of the project: the lean form — the passive pair is those
 * two, and the active side is the unmeasured lowest role when the project has
 * one, or no role at all when it has only two. Anything else is no form, and
 * the caller names why.
 */
export function activeSideRolesFor(ways: readonly ActiveSideWay[]): { form: 'measured' | 'unmeasured'; roles: ActiveSideRoles } | null {
  const measured = ways.filter((w) => w.measured);
  if (measured.length >= ACTIVE_SIDE_WAYS_NEEDED) {
    const [a, p, h] = measured;
    return { form: 'measured', roles: { active: a.role, lowestPassive: p.role, highest: h.role } };
  }
  if (measured.length === ACTIVE_SIDE_LEAN_WAYS_NEEDED) {
    const topTwo = ways.slice(-2);
    if (!topTwo.every((w) => w.measured)) return null;
    const below = ways.slice(0, -2);
    return {
      form: 'unmeasured',
      roles: {
        active: below.length > 0 ? below[below.length - 1].role : null,
        lowestPassive: topTwo[0].role,
        highest: topTwo[1].role,
      },
    };
  }
  return null;
}

/**
 * Read the fields.
 *
 * ORDER OF THE REASONS is the order a designer can act on them: the ways first
 * (it is the only one that needs another measurement session), then the two
 * stated fields. Nothing is inferred from anything else — a ticked box with no
 * shape does not become LR4, and a shape with no frequency does not become the
 * middle of a window.
 */
export function activeSideStatement(f: ActiveSideFormInput): ActiveSideStatement {
  const asked = f.on.trim() !== '';
  const parsed = parseHandoverList(f.handoversRaw ?? '', ACTIVE_HANDOVER_LABEL);
  /* De-duplicated, and NOT sorted: the order the designer typed is the order
   * the runs are laid out in, and a list that silently rearranges itself is a
   * list somebody has to check twice. Duplicates are dropped because two
   * identical handovers are one run, not two. */
  const handoversHz = [...new Set(parsed.hz)];
  const read = handoversHz.length > 0 ? `read: ${formatHandoverList(handoversHz)}` : null;
  const shape = activeSideShape(f.shape ?? '');
  const problems = [...parsed.problems];
  const latency = readLatency(f.latencyRaw ?? '');
  if (latency.problem) problems.push(latency.problem);
  const flankBudget = readNonNegative(f.flankBudgetRaw ?? '', ACTIVE_FLANK_BUDGET_LABEL, 'a number of dB rms');
  if (flankBudget.problem) problems.push(flankBudget.problem);
  const which = activeSideRolesFor(f.ways);
  const off: string[] = [];
  const base = {
    asked,
    handoversHz,
    read,
    shape,
    processorLatencyMs: latency.ms,
    flankBudgetDbRms: flankBudget.value,
    form: which?.form ?? null,
    roles: which?.roles ?? null,
    problems,
  };
  if (!asked) return { ...base, armed: false, off };
  if (!which) {
    const n = f.ways.filter((w) => w.measured).length;
    const top = f.ways.slice(-2).map((w) => w.role);
    off.push(
      n < ACTIVE_SIDE_LEAN_WAYS_NEEDED
        ? `this project has ${n} measured way(s). Hybrid mode needs at least ${ACTIVE_SIDE_LEAN_WAYS_NEEDED}: ` +
            'the passive pair above the active side (the lean form, with the active side unmeasured), or ' +
            `${ACTIVE_SIDE_WAYS_NEEDED} with the active side measured and modelled.`
        : `the two measured ways are not the two highest (${top.join(' and ')}) of this project, so they ` +
            'are not a passive pair above an active side. Load the response of the way in between, or ' +
            'load the two ways that form the passive network into the top two slots.',
    );
  }
  if (handoversHz.length === 0) {
    off.push(
      'no handover frequency is stated. The active side realises its filter in a processor, so the ' +
        'app cannot search for that handover — it has to be told.',
    );
  }
  if (!shape) {
    off.push(
      'no acoustic target shape is stated, so neither flank has an alignment to meet: the passive ' +
        'high-pass and the DSP low-pass are two halves of ONE stated shape.',
    );
  }
  return { ...base, armed: off.length === 0, off };
}

/** The latency field, read: a non-negative number of milliseconds, or nothing, or a named problem. */
function readLatency(raw: string): { ms: number | null; problem: string | null } {
  const r = readNonNegative(raw, ACTIVE_LATENCY_LABEL, 'a number of milliseconds');
  return { ms: r.value, problem: r.problem };
}

/**
 * H-3b — ONE reader for a stated non-negative number (decimal comma or point,
 * the H-2b grammar): the latency and the flank budget read through it. Blank
 * is nothing; anything else that is not a number is a NAMED problem and is
 * used nowhere (A3h — "1,5dB" does not become 1.5).
 */
function readNonNegative(raw: string, label: string, unit: string): { value: number | null; problem: string | null } {
  const t = raw.trim();
  if (t === '') return { value: null, problem: null };
  if (!/^\d+(?:[.,]\d+)?$/.test(t)) {
    return { value: null, problem: `${label}: “${t}” is not ${unit} and was ignored.` };
  }
  const v = Number(t.replace(',', '.'));
  return Number.isFinite(v) && v >= 0 ? { value: v, problem: null } : { value: null, problem: `${label}: “${t}” was ignored.` };
}

/**
 * The label of one hybrid candidate: a passive candidate at one stated handover.
 *
 * The field is the PRODUCT — the passive positions the generator derived, times
 * the handovers the designer stated — because the active handover is not in the
 * field and cannot be (casus 1h's own note: "a search that moved it would be
 * searching a filter this app does not program"). Every label has to stay
 * unique, because the scan table, the shortlist and the load-into-Working
 * button all key on it.
 */
export function hybridLabel(candidateLabel: string, handoverHz: number): string {
  return `${candidateLabel} · active ${formatHandover(handoverHz)}`;
}

/** A stated handover as it is printed: enough digits to tell 362.3 from 362. */
export function formatHandover(hz: number): string {
  return `${formatHandoverNumber(hz)} Hz`;
}

/** The number alone, the digits the designer would recognise. */
function formatHandoverNumber(hz: number): string {
  return Number.isInteger(hz) ? hz.toFixed(0) : hz.toFixed(1);
}

/** H-2b — the list as the app read it, shown back beside the field: "362.3 · 400 Hz". */
export function formatHandoverList(hz: readonly number[]): string {
  return `${hz.map(formatHandoverNumber).join(' · ')} Hz`;
}

/* ==================================================================== *
 * The sentences — one home, several readers
 * ==================================================================== */

/**
 * THE MARK ON EVERY NUMBER THE MODELLED BRANCH TOOK PART IN (measured form).
 *
 * Not decoration. A hybrid's sum contains a branch that is not in the netlist
 * and whose gain, delay and polarity are a MODEL of a processor nobody has set
 * yet; a ripple figure that includes it is a different kind of number from one
 * that does not, and a reader who cannot tell them apart will take the first
 * for a measurement of something built.
 */
export const ACTIVE_SIDE_MODEL_MARK = 'MODEL';

/**
 * The shortlist columns the MODELLED branch takes part in, by key.
 *
 * A NAMED SET and not "everything except the electrical ones", for the reason
 * this project has re-learned on three separate guards: a complement grows on
 * its own, and the day a column is added it joins whichever side nobody chose.
 * Every key here reads the SUM of the branches, which on a hybrid contains the
 * active way; every key NOT here reads the netlist and only the netlist —
 * `zmin`, `epdr`, `diss`, `rmax`, `vfs` and `bom` are properties of the
 * components the passive amplifier drives, and none of them can see the active
 * way at all. That separation is structural in `report.ts` (H-1) rather than
 * remembered; this list only says which of the two each column is on.
 */
export const ACTIVE_SIDE_SUM_COLUMNS: readonly string[] = [
  'rms',
  'window',
  'phase',
  'phase-ctl',
  'peak',
  'lobing',
];

/**
 * H-2b — THE COLUMNS A LEAN-FORM RUN DOES NOT JUDGE, by key.
 *
 * The sum columns MINUS the phase pair: `phase` and `phase-ctl` read the
 * tuner's own M-K on the PASSIVE pair (the two ways that are in the netlist),
 * which the lean form measures exactly as an ordinary two-way does. What it
 * cannot measure is anything that needs the sum with the active side — the
 * ripple, the window, the peak, the vertical dip — and those read the
 * NOT-JUDGED sentence instead of a number or a blank (F0).
 */
export const ACTIVE_SIDE_LEAN_UNJUDGED_COLUMNS: readonly string[] = ['rms', 'window', 'peak', 'lobing'];

/** H-2b — the lean form's own column: the target-flank error. */
export const ACTIVE_SIDE_FLANK_COLUMN = 'flank';

/** What the mark means, wherever it is explained. */
export const ACTIVE_SIDE_MODEL_NOTE =
  'MODEL — this figure includes the active way as a MODELLED branch: its measured response times ' +
  'the stated low-pass, at the gain, delay and polarity derived from the measurements. It is not ' +
  'a measurement of a built loudspeaker, and the electrical figures beside it (impedance, ' +
  'dissipation, coil current, resistor load) never contain it, because the amplifier this network ' +
  'is designed for does not drive it.';

/**
 * H-2b — THE SENTENCE ON EVERY SUM FIGURE OF A LEAN-FORM RUN. The same words
 * `dspTarget.ts` prints on the gain line; this copy is the form's, because
 * the form may not import the engine. `v2ActiveSide.test.ts` pins the two
 * equal.
 */
export const ACTIVE_SIDE_NOT_JUDGED =
  'not judged — active side unmeasured; the processor realises its half, verify with the ' +
  'reversed-polarity null measurement';

/** H-2b — what a lean-form run IS, on the run notes and the DSP fold. */
export const ACTIVE_SIDE_LEAN_NOTE =
  'LEAN FORM — the active side is unmeasured and nothing models it. The lowest passive way is ' +
  'designed to its stated acoustic high-pass and every candidate is judged on its target-flank error ' +
  '(the realised flank against that target, dB rms over the handover band). Ripple, window, peak and ' +
  'vertical dip are NOT JUDGED: they need the sum with a way this project has no measurement of. ' +
  'The processor realises its half; verify the handover with the reversed-polarity null measurement.';

/** The note beside the ACTIVE way's measurement slot and its driver card (measured form). */
export const ACTIVE_WAY_MEASURED_NOTE =
  'This way is driven by its own amplifier and DSP: it is NOT part of the passive network. Its ' +
  'response is measured for the SUM judgement; its impedance is not handed to the passive chain, ' +
  'because the amplifier that chain is designed for never sees it.';

/**
 * What this run IS when Hybrid mode was asked for and could not be assembled.
 *
 * REPORTED, NEVER GUESSED (F0), and the wording is precise about the one thing
 * a reader could get wrong here. The run does NOT fall back to "the passive
 * ways alone": it falls back to the run it would have been without the tick —
 * a passive network for EVERY loaded way. That is a different loudspeaker from
 * the one that was asked for, and it has to say so rather than deliver a
 * design under a heading the designer chose.
 */
export function passiveOnlyNotice(off: readonly string[]): string {
  return (
    'Hybrid mode was asked for and could not be assembled, so this run is the run it would have ' +
    'been without it: a PASSIVE network for every loaded way. Nothing below is about a hybrid. ' +
    `What was missing: ${off.join(' ')}`
  );
}

/**
 * What this run IS, in one sentence — on the form, before anything has run.
 *
 * It names the PRODUCT out loud without pretending to know its size: the cost
 * of a hybrid run is the thing a designer is least likely to predict, because
 * three stated handovers do not ADD three runs, they MULTIPLY the passive field
 * by three. How big that field is depends on the windows the measurements
 * admit, and the form does not know them yet — so this says the shape of the
 * arithmetic and `describeHybridField` below says the number, once there is
 * one (F0: a count nobody has is not a count).
 */
export function describeActiveSide(s: ActiveSideStatement): string {
  if (!s.armed || !s.shape || !s.roles) return passiveOnlyNotice(s.off);
  const list = formatHandoverList(s.handoversHz);
  /* H-3b — what holds the flank: a stated budget (a hard requirement on every
   * delivered or tuned network, refused with the number) or nothing (P4). */
  const flank =
    s.flankBudgetDbRms !== null
      ? ` The target-flank error is held to a STATED budget of ${s.flankBudgetDbRms.toFixed(2)} dB rms over the ` +
        'handover band: a network above it is refused, never delivered quietly.'
      : ` No flank-error budget is stated: ${ACTIVE_SIDE_FLANK_UNJUDGED}.`;
  if (s.form === 'unmeasured') {
    return (
      `Hybrid mode, LEAN FORM: the active side is unmeasured. The lowest measured way (${s.roles.lowestPassive}) ` +
      `is designed to an acoustic ${s.shape.value} high-pass at ${list} and judged on its target-flank error; ` +
      'nothing that needs the sum with the active side is judged. Each stated handover is a separate run of ' +
      'the WHOLE passive field, so the runs multiply rather than add.' +
      flank
    );
  }
  return (
    `Hybrid mode: the lowest way (${s.roles.active}) is driven actively and hands over to the passive network at ` +
    `${list}, acoustic ${s.shape.value} on both flanks. The passive network is the ways above it; ` +
    'the active side is judged as a MODELLED branch and never as an electrical load. Each stated ' +
    'handover is a separate run of the WHOLE passive field, so the runs multiply rather than add.' +
    flank
  );
}

/** The same, once the field exists and the multiplication has a number. */
export function describeHybridField(s: ActiveSideStatement, passiveCandidates: number): string {
  const total = passiveCandidates * s.handoversHz.length;
  return (
    `${s.handoversHz.length} stated handover(s) × ${passiveCandidates} passive candidate(s) = ` +
    `${total} run(s).`
  );
}

/** The one line the guided "how many ways" question carries. */
export const ACTIVE_SIDE_GUIDED_LINE =
  'Is one of the ways driven actively (its own amplifier and a DSP)? Then tick “Hybrid mode” in the ' +
  'requirements: with the active way measured beside the others the app models it and judges the whole ' +
  'sum; with only the passive pair measured it designs that pair to the stated handover and hands you the ' +
  'DSP numbers it can honestly give.';
