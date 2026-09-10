/**
 * U-5 — WHAT A STATED CROSSING DELIVERS AGAINST THE LIMITS IT IS PAST.
 *
 * `statedCrossings.ts` says, before anything is built, WHICH limits a stated
 * position is past and WHAT each of them asks for in its own unit. This module
 * is the other half: it reads the delivered network and answers each of them.
 *
 * IT LIVES IN THE WORKER FOR ONE REASON. The reading is a branch transfer on
 * the measured impedance sweep, and the worker is the only place that holds a
 * solved network — the main thread would have to solve every candidate a second
 * time just to fill a column, which is how two answers to one question start
 * (A3g). Everything here reads `passbandRelativeLevelDb`, the same convention
 * M-C is, on the same FROZEN passbands the run's gates are held to, so a
 * verdict beside an M-C column cannot come from a different band than the
 * column.
 *
 * WHAT IT DOES NOT DO: it does not judge. A breached limit whose demand the
 * network delivers is not a pass and a breached limit it misses is not a gate.
 * The gates are the gates; a limit somebody STATED is named in `missedStated`
 * so the shortlist can mark the candidate, and a DERIVED limit — the
 * uncalibrated breakup ramp above all — reports and refuses nothing (U-5 rule
 * 4, V9/U-4 for why the ramp is not a requirement).
 */

import type { Netlist } from '../../network.ts';
import { passbandRelativeLevelDb } from '../metrics/electrical.ts';
import type {
  StatedBreachVerdict,
  StatedCrossingMark,
  StatedCrossingReport,
} from '../predesign/statedCrossings.ts';
import { buildAnalysisOrNull, type GateReference, type GateVerdict } from './gates.ts';

/**
 * The verdicts for one candidate's stated mark, measured on the network it
 * delivered.
 *
 * `netlist` is the DELIVERED network — including, for a stated candidate whose
 * tune a rule refused, the network that was refused: U-5's whole point is that
 * the designer sees what their position cost, and a refusal with nothing behind
 * it is the silence the session removes.
 */
export function statedBreachVerdicts(
  netlist: Netlist | null,
  ref: GateReference | null,
  mark: StatedCrossingMark,
  gates: readonly GateVerdict[],
): StatedCrossingReport {
  const analysis =
    netlist && ref?.impedance
      ? buildAnalysisOrNull(netlist, ref.impedance.grid, ref.impedance.driverZ)
      : null;
  const why =
    analysis !== null
      ? null
      : netlist === null
        ? 'this candidate delivered no network at all, so there is nothing to read the limit back from'
        : ref?.impedance
          ? 'the network could not be solved on the measured impedance sweep'
          : (ref?.impedanceAbsent ??
            'no measured impedance sweep reached this run, so no electrical reading was taken');

  const missedStated = new Set<string>();
  const perCrossing = mark.perCrossing.map((c) => ({
    pairLabel: c.pairLabel,
    hz: c.hz,
    insideWindow: c.insideWindow,
    breaches: c.breaches.map((b): StatedBreachVerdict => {
      /* A FREQUENCY LIMIT HAS NOTHING TO MEASURE, and that is an answer rather
       * than a gap: a directivity point, a measurement-validity floor and a
       * transcribed recommendation are frequencies. A stated one that is
       * breached is missed by definition — there is no network reading that
       * could put it right. */
      if (b.demandDb === null || b.subject === null || b.atHz === null) {
        if (b.stated) missedStated.add(`${b.rule} ${b.side} ${b.limitHz.toFixed(0)} Hz`);
        return {
          ...b,
          measuredDb: null,
          readAtHz: null,
          meets: null,
          verdict:
            `${b.sentence} It is a frequency limit, so the delivered network cannot answer it: the ` +
            'breach in hertz is the whole verdict' +
            (b.stated ? ' — and somebody stated it, so this candidate MISSES it.' : '.'),
        };
      }
      const band = ref?.frozenPassbandHz[b.subject] ?? ref?.validHz[b.subject] ?? null;
      const read =
        analysis && band ? passbandRelativeLevelDb(analysis, b.subject, b.atHz, band) : null;
      if (!read) {
        return {
          ...b,
          measuredDb: null,
          readAtHz: null,
          meets: null,
          verdict:
            `${b.sentence} It could NOT be read on this network: ` +
            (band
              ? (why ?? 'the passband holds no grid point')
              : `no passband is known for ${b.subjectLabel ?? b.subject}`) +
            '. Reported as unknown, never as zero (F0).',
        };
      }
      /* The demand is a magnitude of attenuation UNDER the passband, so the
       * measured level meets it when it sits at least that far below. */
      const meets = read.relativeDb <= -b.demandDb;
      if (b.stated && !meets) missedStated.add(`${b.rule} ${b.side} ${b.limitHz.toFixed(0)} Hz`);
      return {
        ...b,
        measuredDb: read.relativeDb,
        readAtHz: read.atHz,
        meets,
        verdict:
          `${b.sentence} MEASURED on the delivered network: ${b.subjectLabel ?? b.subject} sits ` +
          `${read.relativeDb.toFixed(1)} dB under its own passband at ${read.atHz.toFixed(0)} Hz, ` +
          `against the ${b.demandDb.toFixed(1)} dB that limit stands for — ` +
          (meets
            ? 'it DELIVERS what the limit was protecting, at a position the limit forbids. The ' +
              'limit is derived on the bare ladder with the passband at the input; this network ' +
              'has more than a bare ladder.'
            : /* Short by exactly the difference between what it asks and what is
               * there: `demand + relative`, positive precisely when it misses. */
              `it FALLS SHORT by ${(b.demandDb + read.relativeDb).toFixed(1)} dB` +
              (b.stated ? ' — and somebody stated this limit, so this candidate MISSES it.' : '.')),
      };
    }),
  }));

  /* An ARMED gate that failed is a stated requirement missed, by definition: a
   * gate is only armed because the designer stated a limit for it (P4). Named
   * here so the shortlist can mark the candidate without re-deciding what a
   * gate is. */
  for (const g of gates) {
    if (g.active && !g.pass) missedStated.add(g.gate);
  }

  return {
    statedOn: mark.statedOn,
    outsideWindow: mark.outsideWindow,
    perCrossing,
    missedStated: [...missedStated],
  };
}
