/**
 * H-1 — THE DSP TARGET BLOCK: what the active side must be set to, for one
 * design.
 *
 * THE DELIVERABLE OF A HYBRID RUN. A passive network is a bill of materials; a
 * hybrid design is a bill of materials AND four numbers somebody types into a
 * processor, and a run that hands over only the first half has not handed over
 * a design. This module is the second half, in two forms — an object for a file
 * and a few lines for a human — built from one report so that the two cannot
 * say different things.
 *
 * IT IS NOT TURNING ADVICE. Every number here is derived from the measurements
 * and the stated shape, and the one thing it insists on is that the final delay
 * is settled in the CABINET, on the reversed-polarity null. The model can say
 * where to start; it cannot hear the room, and the merge fits underneath the
 * measurements carry more uncertainty than the difference this session was
 * chasing (M-4 measured 8-12 degrees of it).
 */

import type { EngineV2Report } from './report.ts';
import { textbookComplementInverted, type ModelBranchSettings } from '../activeSide.ts';

/** The block, as it goes to a file. */
export interface DspTargetBlock {
  /** Which way the active side drives, and which passive way hands over to it. */
  activeWay: string;
  passiveWay: string;
  /** Who stated the handover, and when. */
  statedBy: string;
  /** The low-pass the DSP must realise. */
  lowPass: { kind: string; order: number; hz: number };
  /** The high-pass the PASSIVE network realises — the other half of the same alignment. */
  passiveHighPass: { kind: string; order: number; hz: number };
  /** The settings the design was JUDGED with (class A, fixed before the search). */
  judged: ModelBranchSettings;
  /**
   * What the DELIVERED passive branch would have preferred, fitted the same
   * way. Null without a netlist, or when the fit had no input.
   */
  deliveredRefit: { gainDb: number; delayMs: number; inverted: boolean; handoverWindowDb: number } | null;
  /** The band the level match and the delay fit were read over. */
  fitBandHz: [number, number];
  /**
   * H-2b — WHICH FORM: `measured` (H-1: the active way is a modelled branch)
   * or `unmeasured` (the lean form: nothing is modelled; the gain is NOT
   * JUDGED, the delay is a geometric start value, the polarity the textbook's).
   */
  form: 'measured' | 'unmeasured';
  /**
   * H-2b — the delay START value from the entered acoustic-centre depths, and
   * where it came from (or why there is none). Present in both forms.
   */
  delayStart: { ms: number; source: string } | null;
  /**
   * H-2b — the processor's own latency on the active side, ms, as STATED by
   * the designer (the FA251 with an analogue input is about 0.35 ms). Null
   * when not stated: the dial-in delay then carries it unsubtracted, and the
   * block says so.
   */
  processorLatencyMs: number | null;
  /**
   * H-2b — WHAT TO DIAL IN, after the latency: `delayMs` is the fitted (or
   * geometric) delay MINUS the stated latency; null when neither a fit nor a
   * start value exists. `gainDb` is null in the lean form (not judged).
   */
  dial: { gainDb: number | null; delayMs: number | null; inverted: boolean | null };
  /**
   * H-2b — the lean form's judgement of the lowest passive way's flank against
   * its stated high-pass, on the loaded netlist; null without one.
   */
  flankError: { rmsDb: number; maxAbsDb: number; levelDb: number; bandHz: [number, number] } | null;
  /** How decisive the polarity was, and what the alternative was. */
  polarity: {
    /** How big a margin this project's own measurement uncertainty makes meaningful; null when unstated. */
    decisiveDb: number | null;
    nullMarginDb: number | null;
    otherPolarityNullMarginDb: number | null;
    otherPolarityDelayMs: number | null;
    /** The difference between the two, dB. Small = the data did not decide it. */
    marginDb: number | null;
  };
  /** Everything a reader has to know before typing these numbers in. */
  notes: string[];
}

/**
 * THE MARGIN BELOW WHICH THE POLARITY IS NOT DECIDED BY THE DATA, from the
 * uncertainty of the measurements underneath it.
 *
 * DERIVED AND NOT CHOSEN, and it takes its input rather than carrying one (P6):
 * a merged measurement's phase rests on a FITTED delay, and how far that fit
 * can move is a property of THAT project's merges — M-4 measured 8.2 degrees of
 * model choice and 11.8 degrees of unexplained splice residual on casus 1's
 * mid, and another project's files will say something else. Two branches that
 * far out of phase sum to `2·cos(θ/2)` instead of 2, so the null margin loses
 * exactly `−20·log10(cos(θ/2))` dB. A polarity decided by less than that is
 * decided by the merge fit and not by the loudspeaker.
 *
 * Absent input = no threshold: the block reports the margin and judges it not
 * at all (P4).
 */
export function polarityDecisiveDb(mergeFitUncertaintyDeg: number): number {
  const half = (mergeFitUncertaintyDeg / 2) * (Math.PI / 180); // P6-OK: deg→rad
  return -20 * Math.log10(Math.cos(half)); // P6-OK: amplitude→dB
}

/**
 * The block for one report. Null when the project states no active side.
 *
 * ONE READER OF ONE DERIVATION: everything comes out of `report.activeSide`,
 * which `report.ts` filled from `activeSide.ts`. This module computes no
 * quantity of its own — it arranges them and writes the sentences.
 */
export function dspTargetBlock(
  report: EngineV2Report,
  opts: {
    /**
     * How far the merge fits underneath these measurements can move the phase
     * at the handover, degrees — the project's own measurement, never a
     * default. Absent = the polarity margin is reported and not judged (P4).
     */
    mergeFitUncertaintyDeg?: number;
    /**
     * H-2b — the processor's own latency on the active side, ms, STATED by
     * the designer. Subtracted from the dial-in delay and named apart; absent
     * = the delay is printed unsubtracted and the block says the latency is
     * not stated (P4).
     */
    processorLatencyMs?: number;
  } = {},
): DspTargetBlock | null {
  const a = report.activeSide;
  if (!a) return null;
  const decisiveDb =
    opts.mergeFitUncertaintyDeg !== undefined && opts.mergeFitUncertaintyDeg > 0
      ? polarityDecisiveDb(opts.mergeFitUncertaintyDeg)
      : null;
  const latency =
    opts.processorLatencyMs !== undefined && Number.isFinite(opts.processorLatencyMs) && opts.processorLatencyMs >= 0
      ? opts.processorLatencyMs
      : null;
  const shape = { kind: a.stated.kind, order: a.stated.order, hz: a.stated.hz };
  const notes: string[] = [];
  const margin =
    a.nullMarginDb !== null && a.otherPolarityNullMarginDb !== null
      ? a.nullMarginDb - a.otherPolarityNullMarginDb
      : null;
  const delayStart = a.delayStartMs !== null ? { ms: a.delayStartMs, source: a.delayStartSource } : null;
  const flankError = a.flankError
    ? { rmsDb: a.flankError.rmsDb, maxAbsDb: a.flankError.maxAbsDb, levelDb: a.flankError.levelDb, bandHz: a.flankError.bandHz }
    : null;
  /* THE DELAY BEFORE THE LATENCY: the re-fit on the delivered network where
   * there is one, the class-A fit otherwise (measured form); the geometric
   * start value in the lean form; null when there is nothing. */
  const rawDelayMs =
    a.form === 'unmeasured'
      ? (delayStart?.ms ?? null)
      : a.settings
        ? (a.deliveredRefit ? a.deliveredRefit.settings.delayMs : a.settings.delayMs)
        : null;
  const dial = {
    gainDb: a.form === 'unmeasured' || !a.settings ? null : (a.deliveredRefit?.settings.gainDb ?? a.settings.gainDb),
    delayMs: rawDelayMs === null ? null : rawDelayMs - (latency ?? 0),
    inverted:
      a.form === 'unmeasured'
        ? textbookComplementInverted(a.stated.kind, a.stated.order)
        : a.settings
          ? (a.deliveredRefit?.settings.inverted ?? a.settings.inverted)
          : null,
  };

  if (a.form === 'unmeasured') {
    /* H-2b — THE LEAN FORM: reported, never guessed (F0). */
    notes.push(
      'LEAN FORM: the active side is UNMEASURED and nothing here models it. The GAIN is not judged — ' +
        'the processor realises its half; set it by ear-and-microphone against the passive ways. The ' +
        'POLARITY is the textbook one for this alignment and not a measurement. Verify both with the ' +
        'reversed-polarity null measurement in the cabinet.',
    );
    notes.push(
      'THE FINAL DELAY IS MEASURED IN THE CABINET, not typed from this block. Set the shape and a ' +
        'starting gain, reverse the polarity of ONE way, and sweep the delay for the DEEPEST NULL through ' +
        'the handover; the start value above (where there is one) is geometry and nothing more.',
    );
    if (flankError) {
      notes.push(
        `What IS judged here is the flank of ${a.stated.passiveWay}: ${flankError.rmsDb.toFixed(2)} dB rms ` +
          `from its stated ${shape.kind}${shape.order} high-pass over ${flankError.bandHz[0].toFixed(0)}–` +
          `${flankError.bandHz[1].toFixed(0)} Hz (largest residual ${flankError.maxAbsDb.toFixed(2)} dB), ` +
          `sitting ${flankError.levelDb >= 0 ? '+' : ''}${flankError.levelDb.toFixed(2)} dB from the target on ` +
          'average — the level offset the DSP gain absorbs, the shape error it cannot.',
      );
    }
  } else if (!a.settings) {
    notes.push(`The active side could not be modelled: ${a.off.join('; ')}.`);
  } else {
    notes.push(
      'THE FINAL DELAY IS MEASURED IN THE CABINET, not typed from this block. Set the gain and the ' +
        'shape, reverse the polarity of ONE way, and sweep the delay for the DEEPEST NULL through the ' +
        'handover; that null is what this fit maximised, so the two are the same measurement and the ' +
        'cabinet one is the one that counts.',
    );
    /* THE SIGN, and it is the first thing that will trip somebody up. Read
     * AFTER the latency: that is the number somebody types. */
    const dialMs = dial.delayMs ?? (a.deliveredRefit ? a.deliveredRefit.settings.delayMs : a.settings.delayMs);
    if (dialMs < 0) {
      notes.push(
        `The delay to dial in is NEGATIVE (${dialMs.toFixed(3)} ms): it asks for the ACTIVE side ` +
          'to arrive EARLIER, which no processor can do. Realise it on the other side — delay the ' +
          `passive ways by ${Math.abs(dialMs).toFixed(3)} ms — or add one whole period ` +
          `(${(1000 / a.stated.hz).toFixed(3)} ms at ${a.stated.hz.toFixed(1)} Hz) to the active side, which ` +
          'sums the same on axis at the handover and NOT the same off it.',
      );
    }
    if (decisiveDb !== null) {
      const deg = opts.mergeFitUncertaintyDeg!;
      notes.push(
        `The delay carries the uncertainty of the merges these measurements rest on — this project states ` +
          `${deg.toFixed(1)}° of it, which at ${a.stated.hz.toFixed(0)} Hz is ` +
          `${((deg / 360) * (1000 / a.stated.hz)).toFixed(3)} ms. Read the differences between the stated ` +
          'handovers against that before taking any of them as decisive.',
      );
    } else {
      notes.push(
        'This project states no merge-fit uncertainty, so nothing here says how much of the delay is the ' +
          'measurement rather than the loudspeaker, and the polarity margin is reported and not judged (P4).',
      );
    }
    if (margin !== null && decisiveDb !== null && margin < decisiveDb) {
      notes.push(
        `THE POLARITY IS NOT DECIDED BY THE DATA: ${a.settings.inverted ? 'reversed' : 'normal'} wins by ` +
          `${margin.toFixed(2)} dB of null margin, under the ${decisiveDb.toFixed(2)} dB that the ` +
          `merge-fit uncertainty of this project's own measurements (${opts.mergeFitUncertaintyDeg!.toFixed(1)}°) ` +
          'is worth on its own. The alternative is ' +
          `${a.settings.inverted ? 'normal' : 'reversed'} at ${(a.otherPolarityDelayMs ?? NaN).toFixed(3)} ms. ` +
          'Try both in the cabinet.',
      );
    }
  }
  if (a.deliveredRefit && a.settings) {
    const dd = a.deliveredRefit.settings.delayMs - a.settings.delayMs;
    const dg = a.deliveredRefit.settings.gainDb - a.settings.gainDb;
    notes.push(
      `The DELIVERED network would prefer ${a.deliveredRefit.settings.delayMs.toFixed(3)} ms and ` +
        `${a.deliveredRefit.settings.gainDb.toFixed(2)} dB (${dd >= 0 ? '+' : ''}${dd.toFixed(3)} ms, ` +
        `${dg >= 0 ? '+' : ''}${dg.toFixed(2)} dB against what it was judged with). THE DELAY IS THE ONE TO ` +
        'DIAL IN: the gain above is already levelled against the branch that was built, so a residual there is ' +
        'rounding, but the DELAY was fitted before the network existed and the realised high-pass carries phase ' +
        'the ideal shape does not. Sweeping for the deepest null in the cabinet is what settles it, and this is ' +
        'the model\'s own best estimate of where that sweep lands.',
    );
  }
  /* H-2b — THE PROCESSOR LATENCY, named apart from the delay it is taken off. */
  if (latency !== null) {
    notes.push(
      `The processor's own latency on the active side is stated at ${latency.toFixed(3)} ms and has been ` +
        'SUBTRACTED from the delay to dial in: the processor already delays the active way by that much ' +
        'before any delay you set. ' +
        (rawDelayMs !== null
          ? `Before the subtraction the delay was ${rawDelayMs >= 0 ? '+' : ''}${rawDelayMs.toFixed(3)} ms.`
          : 'There is no delay to subtract it from here.'),
    );
  } else {
    notes.push(
      'No processor latency is stated for the active side, so the delay above is printed WITHOUT it: a ' +
        'processor delays the active way by its own latency before any delay you set (the FA251 with an ' +
        'analogue input is about 0.35 ms), and that comes off the number to dial in. State it in Hybrid mode.',
    );
  }
  /* H-2b — THE GEOMETRIC START VALUE beside a fitted delay, as a cross-check. */
  if (a.form === 'measured' && delayStart && a.settings) {
    notes.push(
      `Geometry alone says ${delayStart.ms >= 0 ? '+' : ''}${delayStart.ms.toFixed(3)} ms (${delayStart.source}); ` +
        'the fitted delay above carries the drivers\' own phase as well, which is why the two differ.',
    );
  } else if (a.form === 'measured' && !delayStart) {
    notes.push(`No geometric start value beside the fit: ${a.delayStartSource}.`);
  }
  notes.push(
    'The active side\'s own excursion, thermal and protection limits belong to its amplifier and its DSP. ' +
      'This app designs the passive network and judges what the main amplifier sees; nothing here is a ' +
      'statement about what the active amplifier may do.',
  );

  return {
    activeWay: a.stated.activeWay,
    passiveWay: a.stated.passiveWay,
    statedBy: a.stated.statedBy,
    lowPass: shape,
    passiveHighPass: shape,
    judged: a.settings ?? { gainDb: NaN, delayMs: NaN, inverted: false },
    deliveredRefit: a.deliveredRefit
      ? {
          gainDb: a.deliveredRefit.settings.gainDb,
          delayMs: a.deliveredRefit.settings.delayMs,
          inverted: a.deliveredRefit.settings.inverted,
          handoverWindowDb: a.deliveredRefit.handoverWindowDb,
        }
      : null,
    fitBandHz: a.fitBandHz,
    form: a.form,
    delayStart,
    processorLatencyMs: latency,
    dial,
    flankError,
    polarity: {
      decisiveDb,
      nullMarginDb: a.nullMarginDb,
      otherPolarityNullMarginDb: a.otherPolarityNullMarginDb,
      otherPolarityDelayMs: a.otherPolarityDelayMs,
      marginDb: margin,
    },
    notes,
  };
}

/**
 * The same block as lines a person reads — and it LEADS WITH WHAT TO DIAL IN.
 *
 * Which is not a formatting choice. The settings the run was JUDGED with are
 * the class-A ones, fitted before the network existed; the settings the built
 * loudspeaker wants are the ones re-fitted on what came out. On casus 1h those
 * two delays differ by up to 0.93 ms, and printing the judged one at the top
 * would hand a designer the wrong number in the largest type on the page. The
 * judged pair stays, one line down, because it is what the corpus was selected
 * on and a reader comparing candidates needs it.
 */
export function describeDspTarget(b: DspTargetBlock): string[] {
  const dB = (v: number) => (Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(2)} dB` : '—');
  const ms = (v: number) => (Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(3)} ms` : '—');
  const latencyTag = b.processorLatencyMs !== null ? ` (processor latency ${b.processorLatencyMs.toFixed(3)} ms subtracted)` : '';
  if (b.form === 'unmeasured') {
    /* H-2b — THE LEAN FORM leads with what it can and cannot say (F0). */
    return [
      `DSP target — active side (unmeasured), handing over to ${b.passiveWay} (passive). LEAN FORM.`,
      `  low-pass   ${b.lowPass.kind}${b.lowPass.order} @ ${b.lowPass.hz.toFixed(1)} Hz`,
      `  gain       ${ACTIVE_SIDE_NOT_JUDGED}`,
      b.dial.delayMs !== null && b.delayStart
        ? `  delay      start value ${ms(b.dial.delayMs)}${latencyTag} — ${b.delayStart.source}; measured in the cabinet`
        : '  delay      no start value — the acoustic-centre depths of the active side and the passive way are not ' +
          'both entered; measured in the cabinet',
      `  polarity   textbook for ${b.lowPass.kind}${b.lowPass.order}: ${b.dial.inverted ? 'REVERSED' : 'normal'} — verify in the cabinet`,
      `  (the passive network realises ${b.passiveHighPass.kind}${b.passiveHighPass.order} @ ${b.passiveHighPass.hz.toFixed(1)} Hz on ${b.passiveWay}; ` +
        `flank judged over ${b.fitBandHz[0].toFixed(1)}–${b.fitBandHz[1].toFixed(1)} Hz; stated by ${b.statedBy})`,
      ...b.notes.map((n) => `  · ${n}`),
    ];
  }
  const dial = b.deliveredRefit ?? { gainDb: b.judged.gainDb, delayMs: b.judged.delayMs, inverted: b.judged.inverted };
  const dialMs = b.dial.delayMs ?? dial.delayMs;
  return [
    `DSP target — ${b.activeWay} (active), handing over to ${b.passiveWay} (passive).`,
    `  low-pass   ${b.lowPass.kind}${b.lowPass.order} @ ${b.lowPass.hz.toFixed(1)} Hz`,
    `  gain       ${dB(dial.gainDb)}`,
    `  delay      ${ms(dialMs)}${latencyTag}`,
    `  polarity   ${dial.inverted ? 'REVERSED' : 'normal'}`,
    b.deliveredRefit
      ? `  (re-fitted on the DELIVERED network; the run was JUDGED with ${dB(b.judged.gainDb)} / ` +
        `${ms(b.judged.delayMs)} / ${b.judged.inverted ? 'reversed' : 'normal'} — see the notes)`
      : '  (no network loaded, so these are the stated shape\'s own numbers and nothing was re-fitted)',
    `  (the passive network realises ${b.passiveHighPass.kind}${b.passiveHighPass.order} @ ${b.passiveHighPass.hz.toFixed(1)} Hz on ${b.passiveWay}; ` +
      `fitted over ${b.fitBandHz[0].toFixed(1)}–${b.fitBandHz[1].toFixed(1)} Hz; stated by ${b.statedBy})`,
    ...b.notes.map((n) => `  · ${n}`),
  ];
}

/**
 * H-2b — THE SENTENCE ON EVERY SUM FIGURE OF A LEAN-FORM RUN. One home, several
 * readers: the DSP block's gain line, the shortlist's sum columns, the run
 * notes. Reported and never blank (F0).
 */
export const ACTIVE_SIDE_NOT_JUDGED =
  'not judged — active side unmeasured; the processor realises its half, verify with the ' +
  'reversed-polarity null measurement';
