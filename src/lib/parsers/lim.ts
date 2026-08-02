import type { ZmaMeasurement } from '../types.ts';
import { assertAscending, FrdParseError } from './frd.ts';

export class LimParseError extends Error {}

/**
 * Parse a LIMP `.lim` file — ARTA's binary impedance measurement.
 *
 * Reverse-engineered from real measurements (jul 2026) and cross-validated by
 * physics: the fixture set carries a woofer, a tweeter, and the two measured
 * IN PARALLEL, and the complex parallel combination of the first two matches
 * the third within measurement repeatability (~2–5%). That only works if the
 * magnitude and phase columns are what we think they are — swapped columns
 * make complex parallel arithmetic fall apart completely.
 *
 * Layout (little-endian):
 *   0x00  "LIM\0" magic (then two version-ish bytes we deliberately ignore)
 *   0x0C  int32   number of points
 *   0x18  float32 sample rate (informational; kept in the comments)
 *   0x1C  n × [freq Hz, |Z| Ω, phase °]  — float32 triplets
 *
 * Files in the wild carry a few trailing bytes after the last triplet, so the
 * length check is `enough room`, not `exact fit`.
 */
export function parseLim(buf: ArrayBuffer): ZmaMeasurement {
  const view = new DataView(buf);
  if (buf.byteLength < 28) throw new LimParseError('File too short to be a LIMP measurement.');
  if (
    view.getUint8(0) !== 0x4c || // L
    view.getUint8(1) !== 0x49 || // I
    view.getUint8(2) !== 0x4d || // M
    view.getUint8(3) !== 0x00
  ) {
    throw new LimParseError('Not a LIMP file (missing "LIM" signature).');
  }

  const count = view.getInt32(12, true);
  if (count < 2) throw new LimParseError(`LIMP point count ${count} is not a measurement.`);
  const need = 28 + count * 12;
  if (buf.byteLength < need) {
    throw new LimParseError(
      `LIMP file truncated: header promises ${count} points (${need} bytes), file has ${buf.byteLength}.`,
    );
  }

  const sampleRate = view.getFloat32(24, true);

  const freq: number[] = [];
  const magnitude: number[] = [];
  const phase: number[] = [];
  for (let i = 0; i < count; i++) {
    const o = 28 + i * 12;
    const f = view.getFloat32(o, true);
    const m = view.getFloat32(o + 4, true);
    const p = view.getFloat32(o + 8, true);
    if (!Number.isFinite(f) || !Number.isFinite(m) || !Number.isFinite(p)) {
      throw new LimParseError(`LIMP point ${i + 1} is not finite — corrupt file?`);
    }
    // |Z| ≤ 0 is physically impossible; catching it here turns a mis-decoded
    // file into a loud error instead of a quietly insane driver load.
    if (m <= 0) throw new LimParseError(`LIMP point ${i + 1} has |Z| = ${m} Ω (impossible).`);
    freq.push(f);
    magnitude.push(m);
    phase.push(p);
  }

  try {
    assertAscending(freq, 'LIMP');
  } catch (e) {
    if (e instanceof FrdParseError) throw new LimParseError(e.message);
    throw e;
  }

  return {
    freq,
    magnitude,
    phase,
    meta: { rawComments: [`LIMP binary, ${count} points, sample rate ${sampleRate} Hz`] },
  };
}

/**
 * Serialize a parsed LIMP measurement as canonical ZMA text.
 *
 * This is the whole integration strategy: the app stores raw files as TEXT
 * (autosave, project files, the VituixCAD folder export all assume it), so a
 * binary format is converted once at the import boundary and everything
 * downstream — persistence, re-parsing on restore, VituixCAD hand-off —
 * keeps working unchanged on a plain .zma. VituixCAD cannot read .lim
 * anyway, so the exported folder is *better* off with the conversion.
 */
export function limToZmaText(m: ZmaMeasurement, sourceName: string): string {
  const lines = [
    `* Converted from LIMP binary "${sourceName}" by SD Acoustics Crossover Studio`,
    ...m.meta.rawComments.map((c) => `* ${c}`),
    '* freq(Hz) |Z|(ohm) phase(deg)',
  ];
  for (let i = 0; i < m.freq.length; i++) {
    lines.push(`${m.freq[i]} ${m.magnitude[i]} ${m.phase[i]}`);
  }
  return lines.join('\n') + '\n';
}
