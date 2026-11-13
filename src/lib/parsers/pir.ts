/**
 * I-4 — ARTA `.pir` IMPULSE RESPONSES, READ AS WHAT THEY ARE: THE RAW MEASUREMENT.
 *
 * WHY THE MERGE WANTS THESE AND NOT ONLY FRD EXPORTS. An FRD is an impulse
 * response that has already been windowed, shifted and transformed by someone
 * else, and the merge can only take the header's word for what was done. With
 * the impulse itself the merge applies the gate it states, to both halves alike,
 * and it can read the session's time base directly. I-4 found the casus-1 far
 * fields exported from impulses that had been shifted before export (direct
 * sound at 9.2 ms in the `.pir`, reference time 2.5 ms in the FRD), which is
 * exactly the kind of step an FRD cannot report.
 *
 * FORMAT (ARTA, version 0x0101 as written by ARTA 1.9): an 80-byte little-endian
 * header, `infosize` bytes of text, then `length` float32 samples.
 *
 *   0   char[4]  "PIR\0"
 *   4   u32      version
 *   8   i32      infosize          (bytes of text after the header)
 *   12  i32      reserved
 *   16  i32      reserved
 *   20  f32      fskHz             (sample rate in kHz)
 *   24  i32      sampleRate        (Hz)
 *   28  i32      length            (samples)
 *   32  i32      inputDevice       (0 voltage probe, 1 microphone, 2 accelerometer)
 *   36  f32      deviceSens        (V/V, V/Pa or V/(m/s²))
 *   40  i32      measurementType   (0 external excitation, 1 single-channel IR, 2 dual-channel IR)
 *   44  i32      avgType
 *   48  i32      numAvg
 *   52  i32      bFiltered
 *   56  i32      genType
 *   60  f32      peakLeft
 *   64  f32      peakRight
 *   68  i32[3]   reserved
 *
 * Only the fields the merge USES are interpreted; the rest are returned raw so
 * a reader can see them, and nothing here guesses at reserved words.
 */

export class PirParseError extends Error {}

export type PirMeasurementType = 'external-excitation' | 'single-channel' | 'dual-channel' | 'unknown';

export interface PirImpulse {
  sampleRate: number;
  /** The impulse, as stored (float32 widened to float64). Sample 0 is t = 0 of the session's time base. */
  samples: Float64Array;
  /**
   * DUAL-CHANNEL MEANS THE SESSION HAS A TIME BASE: every impulse measured that
   * way shares t = 0 (the reference channel), so arrival times can be compared
   * across drivers and between near and far field. Single-channel impulses carry
   * no such promise and the merge says so.
   */
  measurementType: PirMeasurementType;
  inputDevice: 'voltage' | 'microphone' | 'accelerometer' | 'unknown';
  version: number;
  numAvg: number;
  /** Text block after the header, if any. */
  info: string;
}

const HEADER_BYTES = 80;

export function parsePir(buffer: ArrayBuffer | Uint8Array): PirImpulse {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.byteLength < HEADER_BYTES) throw new PirParseError('Not an ARTA .pir: shorter than its 80-byte header.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sig = String.fromCharCode(bytes[0], bytes[1], bytes[2]);
  if (sig !== 'PIR' || bytes[3] !== 0) throw new PirParseError('Not an ARTA .pir: the file does not start with "PIR".');

  const version = view.getUint32(4, true);
  const infoSize = view.getInt32(8, true);
  const sampleRate = view.getInt32(24, true);
  const length = view.getInt32(28, true);
  const device = view.getInt32(32, true);
  const mType = view.getInt32(40, true);
  const numAvg = view.getInt32(48, true);

  if (!(sampleRate > 0)) throw new PirParseError(`ARTA .pir states sample rate ${sampleRate} Hz.`);
  if (!(length > 0)) throw new PirParseError(`ARTA .pir states ${length} samples.`);
  if (infoSize < 0) throw new PirParseError(`ARTA .pir states a negative info size (${infoSize}).`);
  const dataStart = HEADER_BYTES + infoSize;
  const needed = dataStart + length * 4;
  if (bytes.byteLength < needed) {
    throw new PirParseError(`ARTA .pir is truncated: header says ${length} samples (${needed} bytes), file has ${bytes.byteLength}.`);
  }

  let info = '';
  for (let i = HEADER_BYTES; i < dataStart; i++) if (bytes[i] !== 0) info += String.fromCharCode(bytes[i]);

  const samples = new Float64Array(length);
  for (let i = 0; i < length; i++) samples[i] = view.getFloat32(dataStart + 4 * i, true);

  return {
    sampleRate,
    samples,
    measurementType: mType === 0 ? 'external-excitation' : mType === 1 ? 'single-channel' : mType === 2 ? 'dual-channel' : 'unknown',
    inputDevice: device === 0 ? 'voltage' : device === 1 ? 'microphone' : device === 2 ? 'accelerometer' : 'unknown',
    version,
    numAvg,
    info,
  };
}

/** Build a `.pir` byte image — for tests and for exporting a synthetic impulse. */
export function writePir(opts: {
  sampleRate: number;
  samples: ArrayLike<number>;
  measurementType?: PirMeasurementType;
}): Uint8Array {
  const n = opts.samples.length;
  const out = new Uint8Array(HEADER_BYTES + 4 * n);
  const view = new DataView(out.buffer);
  out.set([0x50, 0x49, 0x52, 0x00], 0);
  view.setUint32(4, 0x0101, true);
  view.setInt32(8, 0, true);
  view.setFloat32(20, opts.sampleRate / 1000, true);
  view.setInt32(24, opts.sampleRate, true);
  view.setInt32(28, n, true);
  view.setInt32(32, 1, true);
  const mt = opts.measurementType ?? 'dual-channel';
  view.setInt32(40, mt === 'external-excitation' ? 0 : mt === 'single-channel' ? 1 : mt === 'dual-channel' ? 2 : 9, true);
  view.setInt32(48, 1, true);
  for (let i = 0; i < n; i++) view.setFloat32(HEADER_BYTES + 4 * i, opts.samples[i], true);
  return out;
}
