import type { ZmaMeasurement } from '../types.ts';
import { parseTabular } from './tabular.ts';
import { parseRewMetadata } from './rewMeta.ts';
import { assertAscending, FrdParseError } from './frd.ts';

export class ZmaParseError extends Error {}

/**
 * Parse a ZMA file: `freq  |Z|(ohms)  phase(degrees)`.
 *
 * ZMA always carries phase (it is the whole point of an impedance measurement),
 * so a two-column file here is an error rather than a degraded case. The
 * impedance is later used as the *measured* driver load in the MNA solver — it
 * must not be collapsed to a resistor.
 */
export function parseZma(text: string): ZmaMeasurement {
  const { comments, rows } = parseTabular(text);
  if (rows.length === 0) throw new ZmaParseError('No numeric data rows found in ZMA file.');
  if (rows[0].length < 3) {
    throw new ZmaParseError('ZMA rows need freq, magnitude and phase columns.');
  }

  const freq: number[] = [];
  const magnitude: number[] = [];
  const phase: number[] = [];

  for (const [i, row] of rows.entries()) {
    if (row.length < 3) throw new ZmaParseError(`ZMA row ${i + 1} has too few columns.`);
    freq.push(row[0]);
    magnitude.push(row[1]);
    phase.push(row[2]);
  }

  try {
    assertAscending(freq, 'ZMA');
  } catch (e) {
    // Re-home the error type so callers can catch ZmaParseError uniformly.
    if (e instanceof FrdParseError) throw new ZmaParseError(e.message);
    throw e;
  }

  return { freq, magnitude, phase, meta: parseRewMetadata(comments) };
}
