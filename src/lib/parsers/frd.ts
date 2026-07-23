import type { FrdMeasurement } from '../types.ts';
import { parseTabular } from './tabular.ts';
import { parseRewMetadata } from './rewMeta.ts';

export class FrdParseError extends Error {}

/**
 * Parse an FRD file: `freq  SPL  [phase]`.
 *
 * Phase is optional in the FRD spec; when a file has only two columns we treat
 * phase as unknown (filled with 0) and flag it — a crossover tool is close to
 * useless without phase, so callers should surface this rather than pretend the
 * driver is minimum-phase.
 */
export function parseFrd(text: string): FrdMeasurement & { hasPhase: boolean } {
  const { comments, rows } = parseTabular(text);
  if (rows.length === 0) throw new FrdParseError('No numeric data rows found in FRD file.');

  const width = rows[0].length;
  if (width < 2) throw new FrdParseError('FRD rows need at least freq and SPL columns.');
  const hasPhase = width >= 3;

  const freq: number[] = [];
  const spl: number[] = [];
  const phase: number[] = [];

  for (const [i, row] of rows.entries()) {
    if (row.length < 2) throw new FrdParseError(`FRD row ${i + 1} has too few columns.`);
    freq.push(row[0]);
    spl.push(row[1]);
    phase.push(hasPhase ? row[2] : 0);
  }

  assertAscending(freq, 'FRD');

  return { freq, spl, phase, meta: parseRewMetadata(comments), hasPhase };
}

/** Frequencies must be strictly ascending for interpolation/FFT to be valid. */
export function assertAscending(freq: number[], kind: string): void {
  for (let i = 1; i < freq.length; i++) {
    if (freq[i] <= freq[i - 1]) {
      throw new FrdParseError(
        `${kind} frequencies must be strictly ascending; row ${i + 1} (${freq[i]} Hz) ` +
          `is not greater than row ${i} (${freq[i - 1]} Hz).`,
      );
    }
  }
}
