/**
 * H-2 — THE HYBRID AS SOMETHING A DESIGNER CAN TICK: the stated active side,
 * read off the form.
 *
 * WHAT H-1 LEFT OPEN. H-1 built the whole of the hybrid route — the stated
 * handover, the modelled branch that joins every ACOUSTIC composition and no
 * ELECTRICAL one, the class-A DSP derivation, the target block — and ended with
 * "the app has no way to state an active side": the only route through it was a
 * fixture and a script. This module is the form's half of that sentence. It
 * decides nothing about physics; it reads three fields and answers one question
 * — is there a hybrid to run here, and if not, WHICH input is missing.
 *
 * WHICH WAY IS ACTIVE, AND WHY IT IS NOT A FOURTH ROLE. This app has exactly
 * three branch roles (`low | mid | high`), and a hybrid needs one measured way
 * that is NOT in the passive network. Casus 1h is the shape: the woofer is
 * measured, judged, and driven by its own amplifier, while the passive network
 * is the two ways above it. So a hybrid here is a THREE-WAY PROJECT whose
 * LOWEST way is declared active — the manifest, the ingest, the report and the
 * geometry are untouched, and the only thing that changes is who drives the low
 * way and which ways the passive chain gets. Adding a fourth role so that a
 * THREE-way passive network could have an active side below it is a change to
 * the adapter, the report and every per-role record in the app; it is named
 * here as what is not expressible rather than half-built (P4 applied to the
 * app's own shape).
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
 * derivation), `chainChoices.ts` (the seventh chain key) and `dspTarget.ts`
 * (the deliverable), all written at H-1 and untouched here.
 */

import { parseFrequencyTokens } from './frequencyList.ts';

/**
 * The roles a hybrid puts in each part, in the app's own vocabulary.
 *
 * DATA rather than three `if`s in the component, for the reason the placement
 * rule is data: the question "which way does the app declare active" has one
 * answer and several readers — the run, the report settings, the measurement
 * card's note and the panel's own sentence — and three of them reading it from
 * a literal is how the four drift apart.
 */
export const ACTIVE_SIDE_ROLES = {
  /** The way the DSP drives. Measured, judged, and in no branch of the netlist. */
  active: 'low',
  /** The lowest way the passive network still carries — the one that gets the high-pass. */
  lowestPassive: 'mid',
  /** The way above it. */
  highest: 'high',
} as const;

/**
 * How many measured ways a hybrid needs in this app.
 *
 * THREE, and it is a structural fact rather than a preference: one for the
 * active side and two for a passive network that is still a crossover. With two
 * loaded ways, declaring the lowest active leaves a single passive way and
 * there is no handover left to design.
 */
export const ACTIVE_SIDE_WAYS_NEEDED = 3;

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

/** What the form and the project say, in the terms this module reads them in. */
export interface ActiveSideFormInput {
  /** The tick box: anything other than the empty string is a tick. */
  on: string;
  /** The handover list exactly as typed. */
  handoversRaw: string;
  /** The shape select. */
  shape: string;
  /** How many measured ways the project has (`threeWay` is three). */
  ways: number;
  /** True when the ACTIVE way's on-axis response is loaded. */
  activeWayMeasured: boolean;
  /** True when the lowest PASSIVE way's on-axis response is loaded. */
  passiveWayMeasured: boolean;
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
  shape: ActiveSideShape | null;
  /** True when a hybrid run can be assembled from what is on screen. */
  armed: boolean;
  /** What is missing, by name. Empty exactly when `armed`. */
  off: string[];
  /** What could not be read out of the list, token by token. */
  problems: string[];
}

/** The label the handover list is parsed under, in every problem it produces. */
export const ACTIVE_HANDOVER_LABEL = 'active handover';

/**
 * Read the three fields.
 *
 * ORDER OF THE REASONS is the order a designer can act on them: the ways first
 * (it is the only one that needs another measurement session), then the two
 * measurements, then the two stated fields. Nothing is inferred from anything
 * else — a ticked box with no shape does not become LR4, and a shape with no
 * frequency does not become the middle of a window.
 */
export function activeSideStatement(f: ActiveSideFormInput): ActiveSideStatement {
  const asked = f.on.trim() !== '';
  const parsed = parseFrequencyTokens(f.handoversRaw ?? '', ACTIVE_HANDOVER_LABEL);
  /* De-duplicated, and NOT sorted: the order the designer typed is the order
   * the runs are laid out in, and a list that silently rearranges itself is a
   * list somebody has to check twice. Duplicates are dropped because two
   * identical handovers are one run, not two. */
  const handoversHz = [...new Set(parsed.hz)];
  const shape = activeSideShape(f.shape ?? '');
  const off: string[] = [];
  if (!asked) {
    return { asked, handoversHz, shape, armed: false, off, problems: parsed.problems };
  }
  if (f.ways < ACTIVE_SIDE_WAYS_NEEDED) {
    off.push(
      `this project has ${f.ways} measured way(s). An active side needs ${ACTIVE_SIDE_WAYS_NEEDED}: ` +
        'one for the DSP to drive and two above it that are still a crossover. Load the third ' +
        'response, or design this as an ordinary passive two-way.',
    );
  }
  if (!f.activeWayMeasured) {
    off.push(
      'the active way has no measured on-axis response. It is not in the passive network, but the ' +
        'sum a listener hears contains it, so without the measurement nothing that judges a SUM can ' +
        'see it.',
    );
  }
  if (!f.passiveWayMeasured) {
    off.push('the lowest passive way has no measured on-axis response, so it has no handover to meet.');
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
  return { asked, handoversHz, shape, armed: off.length === 0, off, problems: parsed.problems };
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
  return `${Number.isInteger(hz) ? hz.toFixed(0) : hz.toFixed(1)} Hz`;
}

/* ==================================================================== *
 * The sentences — one home, several readers
 * ==================================================================== */

/**
 * THE MARK ON EVERY NUMBER THE MODELLED BRANCH TOOK PART IN.
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

/** What the mark means, wherever it is explained. */
export const ACTIVE_SIDE_MODEL_NOTE =
  'MODEL — this figure includes the active way as a MODELLED branch: its measured response times ' +
  'the stated low-pass, at the gain, delay and polarity derived from the measurements. It is not ' +
  'a measurement of a built loudspeaker, and the electrical figures beside it (impedance, ' +
  'dissipation, coil current, resistor load) never contain it, because the amplifier this network ' +
  'is designed for does not drive it.';

/** The note beside the ACTIVE way's measurement slot and its driver card. */
export const ACTIVE_WAY_MEASURED_NOTE =
  'This way is driven by its own amplifier and DSP: it is NOT part of the passive network. Its ' +
  'response is measured for the SUM judgement; its impedance is not handed to the passive chain, ' +
  'because the amplifier that chain is designed for never sees it.';

/**
 * What this run IS when the active side was asked for and could not be
 * modelled.
 *
 * REPORTED, NEVER GUESSED (F0), and the wording is precise about the one thing
 * a reader could get wrong here. The run does NOT fall back to "the passive
 * ways alone": it falls back to the run it would have been without the tick —
 * a passive network for EVERY loaded way, the way the way that was going to be
 * active included. That is a different loudspeaker from the one that was asked
 * for, and it has to say so rather than deliver a design under a heading the
 * designer chose.
 *
 * An earlier version of this sentence said the sum was measured over the
 * passive ways alone. It was wrong in both directions: the active way is in the
 * sum (as an ordinary passive branch), and no hybrid was designed.
 */
export function passiveOnlyNotice(off: readonly string[]): string {
  return (
    'An active side was asked for and could not be modelled, so this run is the run it would have ' +
    'been without it: a PASSIVE network for every loaded way, including the one you said is driven ' +
    `actively. Nothing below is about a hybrid. What was missing: ${off.join(' ')}`
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
  if (!s.armed || !s.shape) return passiveOnlyNotice(s.off);
  const list = s.handoversHz.map(formatHandover).join(', ');
  return (
    'Hybrid: the lowest way is driven actively and hands over to the passive network at ' +
    `${list}, acoustic ${s.shape.value} on both flanks. The passive network is the ways above it; ` +
    'the active side is judged as a MODELLED branch and never as an electrical load. Each stated ' +
    'handover is a separate run of the WHOLE passive field, so the runs multiply rather than add.'
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
  'Is one of the ways driven actively (its own amplifier and a DSP)? Then load its measurement with ' +
  'the others, tick “active side below the lowest passive way” in the requirements, and the app ' +
  'designs the passive part and hands you the DSP numbers.';
