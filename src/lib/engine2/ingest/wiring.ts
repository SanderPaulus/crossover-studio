/**
 * V51 — THE WIRING OF A WAY: how many identical drivers, and how they are
 * connected — as MEASURED and as DESIRED.
 *
 * WHY IT IS AN INGEST FACT AND NOT A SETTING. A way of N identical drivers
 * measured in parallel and built in series is the same drivers and a different
 * loudspeaker: the acoustic level shifts by 20·log10(N), the phase does not
 * move, and the impedance the amplifier sees scales by N². Those are
 * properties of the MEASUREMENT SET as it relates to the intended build, so
 * they are stated per way beside the driver card, and the derivation below is
 * what turns a measurement in one wiring into the response in the other.
 *
 * THE ASSUMPTION, SAID OUT LOUD BECAUSE IT IS ONE. Everything here assumes the
 * N drivers are EQUAL — same sensitivity, same impedance, same phase at the
 * microphone. Two real drivers never quite are, and two drivers at different
 * distances from the microphone are not (casus 1 measured its lower woofer
 * 4–5 dB below the upper one on the same axis, which is geometry, not the
 * driver). The transform therefore carries its assumption in the note, and a
 * caller that applies it publishes that note with the result.
 *
 * WHAT IT DOES ON CASUS 1: NOTHING. The woofer pair is measured parallel and
 * wanted parallel, so the transform is the identity and is not applied. It
 * exists so that a designer who states a DIFFERENT desired wiring gets the
 * derived response rather than a measured one that describes a build nobody
 * intends — and so the report can say what series wiring WOULD deliver.
 */

import { DB_PER_DECADE_AMPLITUDE } from '../constants.ts';

export type WiringKind = 'parallel' | 'series';

export interface WayWiring {
  /** How many IDENTICAL drivers make up the way. 1 = a single driver. */
  count: number;
  /** How the measurement set has them connected. */
  measured: WiringKind;
  /** How the design intends to connect them. */
  desired: WiringKind;
  /** Where these facts came from — shown with every derived number. */
  source?: string;
}

export const WIRING_VERSION = 'way-wiring/1.0';

/**
 * The level N equal drivers in PARALLEL deliver above one of them, dB, at the
 * same amplifier voltage: 20·log10(N). In SERIES each driver sees V/N, so the N
 * of them together deliver exactly what one would — the parallel array sits
 * 20·log10(N) above the series one.
 */
export function parallelGainDb(count: number): number {
  if (!(count >= 1)) return 0;
  return DB_PER_DECADE_AMPLITUDE * Math.log10(count);
}

export interface WiringTransform {
  /** Add to the measured SPL, dB. 0 when the wirings are the same. */
  splOffsetDb: number;
  /** Phase is unchanged for equal drivers: always 0. */
  phaseOffsetDeg: number;
  /** Multiply the measured impedance by this. 1 when the wirings are the same. */
  impedanceFactor: number;
  /** True when nothing changes. */
  identity: boolean;
  /** The assumption and the arithmetic, for whoever reads the derived number. */
  note: string;
}

/**
 * How to turn a response measured in `from` into the response of the same
 * drivers wired `to`. N = 1 or the same wiring is the identity, exactly.
 */
export function wiringTransform(count: number, from: WiringKind, to: WiringKind): WiringTransform {
  const n = Math.max(1, Math.floor(count));
  if (n === 1 || from === to) {
    return {
      splOffsetDb: 0,
      phaseOffsetDeg: 0,
      impedanceFactor: 1,
      identity: true,
      note:
        n === 1
          ? 'a single driver: the wiring makes no difference'
          : `measured and desired wiring are both ${from}: nothing to derive`,
    };
  }
  const g = parallelGainDb(n);
  /* parallel → series: each driver drops from V to V/N, the sum of N of them
   * lands where one driver was: −20·log10(N). Impedance: Z/N → N·Z, factor N².
   * series → parallel is the inverse. */
  const toSeries = from === 'parallel' && to === 'series';
  return {
    splOffsetDb: toSeries ? -g : g,
    phaseOffsetDeg: 0,
    impedanceFactor: toSeries ? n * n : 1 / (n * n),
    identity: false,
    note:
      `${n} drivers measured ${from} and wanted ${to}: SPL ${toSeries ? '−' : '+'}${g.toFixed(2)} dB ` +
      `(20·log10(${n})), phase unchanged, impedance ×${toSeries ? n * n : `1/${n * n}`}. ` +
      'ASSUMES the drivers are EQUAL in sensitivity, impedance and phase at the microphone — ' +
      'two real drivers are not quite, and two drivers at different distances from the microphone ' +
      'are not at all.',
  };
}

/** Apply a transform to a measured response and, when given, to its impedance. */
export function rewireResponse(
  t: WiringTransform,
  db: readonly number[],
  phaseDeg: readonly number[],
  impedanceMagnitude?: readonly number[],
): { db: number[]; phaseDeg: number[]; impedanceMagnitude?: number[] } {
  return {
    db: db.map((v) => v + t.splOffsetDb),
    phaseDeg: phaseDeg.map((v) => v + t.phaseOffsetDeg),
    ...(impedanceMagnitude ? { impedanceMagnitude: impedanceMagnitude.map((v) => v * t.impedanceFactor) } : {}),
  };
}
