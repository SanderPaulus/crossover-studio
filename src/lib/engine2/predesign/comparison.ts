/**
 * F4d — THE COMPARISON BLOCK: v2 candidates beside the designs that already
 * exist, on the metric library's own numbers.
 *
 * The whole delivery of F4d is that v2 now PROPOSES where the handover goes.
 * A proposal a designer cannot compare against what they already have is a
 * number in a vacuum, so this block puts the generated candidates and the
 * baseline designs in one table, column for column, computed by exactly the
 * same assembly.
 *
 * WHAT IT DOES NOT DO, and the omission is the design:
 *
 *   · IT DOES NOT RANK. There is no score, no total, no "best" column and no
 *     ordering by any of the values. The rows come back in the order they were
 *     given — baselines first, because that is what the designer is comparing
 *     AGAINST — and the caller may re-sort for presentation exactly as the
 *     shortlist may. A5e.1: the engine delivers the field, the human picks.
 *   · IT DOES NOT AGGREGATE. No column is a function of another column. The
 *     moment two of these numbers are combined into one, the combination has a
 *     weight in it, and `noWeights.test.ts` exists because that is how it
 *     always starts.
 *   · IT DOES NOT HIDE A MISSING VALUE. A metric that could not be computed on
 *     one design shows as absent WITH ITS REASON rather than as a blank, so a
 *     designer never reads "no dissipation problem" off a row where the
 *     dissipation was simply never computed (P4, and V23's whole lesson).
 *
 * WHY IT LIVES IN `predesign/`. It compares CANDIDATES, which is what this
 * layer produces; and it is pure, so the panel and any test read the same
 * object. Nothing in it knows about React.
 */

import { PERCENT } from '../constants.ts';
import type { EngineV2Report } from '../report.ts';

/** One value in the table. */
export interface ComparisonCell {
  /** The number, or null when it could not be computed on this design. */
  value: number | null;
  /** What the unit is — shown, never assumed from the column name. */
  unit: string;
  /** Why it is absent. Null when it is present. */
  absentReason: string | null;
  /** The band or the subject the number belongs to, when it has one. */
  qualifier: string | null;
}

/** One design in the table. */
export interface ComparisonRow {
  label: string;
  /** A design the designer already had, or one this run proposed. */
  origin: 'baseline' | 'v2-candidate';
  /** Where a v2 candidate came from (A5d). Null for a baseline. */
  provenance: string | null;
  cells: Record<string, ComparisonCell>;
}

export interface ComparisonColumn {
  key: string;
  /** The metric's register name, so a reader can look it up. */
  metric: string;
  title: string;
  unit: string;
}

export interface ComparisonTable {
  columns: ComparisonColumn[];
  rows: ComparisonRow[];
  /** The sentence that travels with the table. */
  note: string;
}

export interface ComparisonEntry {
  label: string;
  origin: 'baseline' | 'v2-candidate';
  report: EngineV2Report;
  provenance?: string | null;
}

/**
 * The columns, and every one of them is a metric the register defines.
 *
 * Deliberately not "everything the report holds": a table nobody can read is a
 * table nobody reads. These are the quantities the casebook itself tabulates
 * for its three candidates, which is the comparison a designer is actually
 * making.
 */
export const COMPARISON_COLUMNS: ComparisonColumn[] = [
  { key: 'minZ', metric: 'M-B', title: 'min |Z|', unit: 'Ω' },
  { key: 'minEpdr', metric: 'M-B', title: 'min EPDR', unit: 'Ω' },
  { key: 'dissipationPct', metric: 'M-A', title: 'dissipation, total', unit: '%' },
  { key: 'largestResistorW', metric: 'M-A', title: 'largest resistor', unit: 'W' },
  { key: 'driveOnFsDb', metric: 'M-C', title: 'drive at f_s, worst way', unit: 'dB' },
  { key: 'lfBumpDb', metric: 'M-D', title: 'LF lift added', unit: 'dB' },
  { key: 'qMultiplier', metric: 'M-E', title: 'Q multiplier, lowest way', unit: '×' },
  { key: 'splWindowDb', metric: 'A5e.1', title: 'SPL window', unit: '±dB' },
  { key: 'rmsFlatnessDb', metric: 'A5e.1', title: 'RMS deviation', unit: 'dB' },
  { key: 'phaseWorstDeg', metric: 'A5e.1', title: 'phase tracking, worst pair', unit: '°' },
];

const absent = (why: string): ComparisonCell => ({
  value: null,
  unit: '',
  absentReason: why,
  qualifier: null,
});
const cell = (value: number, unit: string, qualifier: string | null = null): ComparisonCell => ({
  value,
  unit,
  absentReason: null,
  qualifier,
});

function cellsFor(r: EngineV2Report): Record<string, ComparisonCell> {
  const out: Record<string, ComparisonCell> = {};

  const epdr = r.metrics.epdr;
  out.minZ = epdr
    ? cell(epdr.minZOhm, 'Ω', `at ${epdr.minZAtHz.toFixed(0)} Hz`)
    : absent('no filter was loaded, so there is no input impedance to read');
  out.minEpdr = epdr
    ? cell(epdr.minOhm, 'Ω', `at ${epdr.atHz.toFixed(0)} Hz`)
    : absent('no filter was loaded, so there is no input impedance to read');

  const dis = r.metrics.dissipation;
  out.dissipationPct = dis
    ? cell(
        dis.totalFraction * PERCENT,
        '%',
        `over ${dis.bandHz[0].toFixed(0)}–${dis.bandHz[1].toFixed(0)} Hz`,
      )
    : absent('no filter was loaded, so no element currents exist');
  /* The largest DISCRETE resistor. Parasitics are excluded on purpose: A4's
   * headline number is the discrete total, and a coil's DCR is not a part a
   * designer buys a wattage for. The list arrives sorted by fraction, so the
   * first discrete entry is the largest. */
  const worstR = dis?.elements.find((e) => !e.parasitic) ?? null;
  out.largestResistorW =
    dis && worstR && worstR.watts !== null && worstR.watts !== undefined
      ? cell(worstR.watts, 'W', `${worstR.id} (${worstR.ohm.toFixed(2)} Ω)`)
      : absent(
          dis
            ? 'the amplifier power is a project setting and this project states none, so a ' +
              'fraction cannot be turned into watts (P4)'
            : 'no filter was loaded',
        );

  /* M-C: the WORST way, and worst means least attenuated. Taking the worst
   * rather than averaging is the same argument the gate makes — a way that is
   * protected does not make up for one that is not. */
  const drives = r.metrics.driveVoltage;
  const worstDrive = drives.length ? drives.reduce((a, b) => (b.db > a.db ? b : a)) : null;
  out.driveOnFsDb = worstDrive
    ? cell(worstDrive.db, 'dB', `${worstDrive.driver} at ${worstDrive.fsHz.toFixed(0)} Hz`)
    : absent('no way is high-pass protected on this design, so M-C has no subject');

  const bumps = r.metrics.lfBump;
  const worstBump = bumps.length
    ? bumps.reduce((a, b) => (b.result.extraDb > a.result.extraDb ? b : a))
    : null;
  out.lfBumpDb = worstBump
    ? cell(worstBump.result.extraDb, 'dB', `${worstBump.driver} at ${worstBump.result.atHz.toFixed(0)} Hz`)
    : absent('M-D needs a near-field measurement of the way it evaluates');

  const thev = r.metrics.thevenin.filter((t) => t.qMultiplier !== null);
  const worstQ = thev.length ? thev.reduce((a, b) => (b.qMultiplier! > a.qMultiplier! ? b : a)) : null;
  out.qMultiplier = worstQ
    ? cell(worstQ.qMultiplier!, '×', worstQ.driver)
    : absent('M-E needs R_e per driver, and none was resolved for any way');

  const resp = r.system.response;
  out.splWindowDb = resp
    ? cell(resp.windowPlusMinusDb, '±dB', `smoothed ${(resp.smoothingOctaves * 6).toFixed(0)}/6 oct`)
    : absent('no filter was loaded, so there is no summed response to judge');
  out.rmsFlatnessDb = resp
    ? cell(resp.rmsDeviationDb, 'dB', 'against the design\'s target curve')
    : absent('no filter was loaded, so there is no summed response to judge');

  const pt = r.system.phaseTracking;
  const worstPair = pt.length ? pt.reduce((a, b) => (b.meanAbsDeg > a.meanAbsDeg ? b : a)) : null;
  out.phaseWorstDeg = worstPair
    ? cell(worstPair.meanAbsDeg, '°', `${worstPair.lower} → ${worstPair.upper}`)
    : absent('phase tracking needs at least one crossing between two ways');

  return out;
}

/**
 * The table.
 *
 * Row order: baselines in the order given, then candidates in the order given.
 * That is not a ranking — it is the reading order of the comparison ("what I
 * have" against "what was proposed") — and it does not change with the numbers.
 */
export function compareDesigns(entries: readonly ComparisonEntry[]): ComparisonTable {
  const ordered = [
    ...entries.filter((e) => e.origin === 'baseline'),
    ...entries.filter((e) => e.origin === 'v2-candidate'),
  ];
  return {
    columns: COMPARISON_COLUMNS,
    rows: ordered.map((e) => ({
      label: e.label,
      origin: e.origin,
      provenance: e.provenance ?? null,
      cells: cellsFor(e.report),
    })),
    note:
      'Reporting only. Nothing in this table is ranked, totalled or weighted, and no column is a ' +
      'function of another: which of these designs is better is a question about what this ' +
      'loudspeaker is for, and the engine has no opinion about that (A5e.1). A missing value says ' +
      'why it is missing rather than reading as a good one.',
  };
}
