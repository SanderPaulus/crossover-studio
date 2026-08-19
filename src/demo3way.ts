/**
 * The 3-WAY demo: Sander's KOAN 2951 as measured on 15 Aug 2026 — two
 * woofers (measured together, W1+W2 complex-summed by ARTA), a midrange and a
 * tweeter, 0–60° horizontal at 1 m, near-field cones + port, and LIMP
 * impedances (the woofers in parallel). This is the SAME loudspeaker as the
 * classic KOAN 2-way demo (which is the 2023 mid+tweeter prototype); this set
 * is the finished cabinet.
 *
 * Kept as its own module and loaded with a dynamic import so the ~300 kB of
 * measurement text becomes a separate chunk that only downloads when someone
 * clicks the button. The fixtures are the ARTA exports resampled to a log
 * grid (500 pts far field, 250 pts near field; dB + unwrapped phase in log-f,
 * complex-exact for a delay-carrying response) — see the header comment in
 * every file for the source and its original range.
 */
import wf0 from './lib/parsers/fixtures/koan-3way/woofer-pair-hor0.frd?raw';
import wf15 from './lib/parsers/fixtures/koan-3way/woofer-pair-hor15.frd?raw';
import wf30 from './lib/parsers/fixtures/koan-3way/woofer-pair-hor30.frd?raw';
import wf45 from './lib/parsers/fixtures/koan-3way/woofer-pair-hor45.frd?raw';
import wf60 from './lib/parsers/fixtures/koan-3way/woofer-pair-hor60.frd?raw';
import md0 from './lib/parsers/fixtures/koan-3way/mid-hor0.txt?raw';
import md15 from './lib/parsers/fixtures/koan-3way/mid-hor15.txt?raw';
import md30 from './lib/parsers/fixtures/koan-3way/mid-hor30.txt?raw';
import md45 from './lib/parsers/fixtures/koan-3way/mid-hor45.txt?raw';
import md60 from './lib/parsers/fixtures/koan-3way/mid-hor60.txt?raw';
import tw0 from './lib/parsers/fixtures/koan-3way/tweeter-hor0.txt?raw';
import tw15 from './lib/parsers/fixtures/koan-3way/tweeter-hor15.txt?raw';
import tw30 from './lib/parsers/fixtures/koan-3way/tweeter-hor30.txt?raw';
import tw45 from './lib/parsers/fixtures/koan-3way/tweeter-hor45.txt?raw';
import tw60 from './lib/parsers/fixtures/koan-3way/tweeter-hor60.txt?raw';
import wfNear from './lib/parsers/fixtures/koan-3way/woofer-near.txt?raw';
import mdNear from './lib/parsers/fixtures/koan-3way/mid-near.txt?raw';
import portNear from './lib/parsers/fixtures/koan-3way/port-near.txt?raw';
import zWoofers from './lib/parsers/fixtures/koan-3way/woofers-parallel.zma?raw';
import zMid from './lib/parsers/fixtures/koan-3way/mid.zma?raw';
import zTweeter from './lib/parsers/fixtures/koan-3way/tweeter.zma?raw';

export interface DemoFile {
  name: string;
  raw: string;
}
export interface DemoBranch {
  /** 0° file first; `hor` in degrees. */
  angles: { hor: number; file: DemoFile }[];
  impedance: DemoFile;
  nearCone?: DemoFile;
  nearPort?: DemoFile;
}

const f = (name: string, raw: string): DemoFile => ({ name, raw });

export const KOAN_3WAY_DEMO = {
  label: 'KOAN 2951 3-way (Aug 2026)',
  low: {
    angles: [
      { hor: 0, file: f('woofer-pair-hor0.frd', wf0) },
      { hor: 15, file: f('woofer-pair-hor15.frd', wf15) },
      { hor: 30, file: f('woofer-pair-hor30.frd', wf30) },
      { hor: 45, file: f('woofer-pair-hor45.frd', wf45) },
      { hor: 60, file: f('woofer-pair-hor60.frd', wf60) },
    ],
    impedance: f('woofers-parallel.zma', zWoofers),
    nearCone: f('woofer-near.txt', wfNear),
    nearPort: f('port-near.txt', portNear),
  } satisfies DemoBranch,
  mid: {
    angles: [
      { hor: 0, file: f('mid-hor0.txt', md0) },
      { hor: 15, file: f('mid-hor15.txt', md15) },
      { hor: 30, file: f('mid-hor30.txt', md30) },
      { hor: 45, file: f('mid-hor45.txt', md45) },
      { hor: 60, file: f('mid-hor60.txt', md60) },
    ],
    impedance: f('mid.zma', zMid),
    nearCone: f('mid-near.txt', mdNear),
  } satisfies DemoBranch,
  high: {
    angles: [
      { hor: 0, file: f('tweeter-hor0.txt', tw0) },
      { hor: 15, file: f('tweeter-hor15.txt', tw15) },
      { hor: 30, file: f('tweeter-hor30.txt', tw30) },
      { hor: 45, file: f('tweeter-hor45.txt', tw45) },
      { hor: 60, file: f('tweeter-hor60.txt', tw60) },
    ],
    impedance: f('tweeter.zma', zTweeter),
  } satisfies DemoBranch,
  /** The cabinet and rig as Sander entered them (his project of 16 Aug 2026):
   *  front 260 × 1124 mm, reference point (mic aim) 244 mm below the top and
   *  900 mm above the floor, mic at 1 m, gate 4.5 ms; tweeter 74 mm above the
   *  reference, mid 66 mm below, the woofer pair centred 448 mm below with
   *  276 mm between the two cones; ported box tuned at 31 Hz, sealed mid
   *  chamber at 89 Hz; mounting depths tweeter 0 and mid 17 as the app itself
   *  derives them from the measured excess delays ("Your 17.0 mm agrees").
   *  Woofers 50 mm (Sander: measured, the acoustic centre of an 8" cone) —
   *  the delay-derived value on THIS set reads ~0 mm behind the tweeter, so
   *  the woofer card opens on the honest cross-check "one of the two is
   *  wrong". That is a real open question about the pair (two cones 276 mm
   *  apart, summed by ARTA), not something a demo should paper over. Listening position 3.4 m / ear 980 mm — his
   *  room, kept because he entered it. */
  cabinet: {
    micDistanceMm: '1000',
    micElevationDeg: '0',
    gateMs: '4.5',
    baffleWidthMm: '260',
    baffleHeightMm: '1124',
    cabinetDepthMm: '',
    refFromTopMm: '244',
    refHeightMm: '900',
    listenDistanceM: '3.4',
    listenEarHeightMm: '980',
    refDriver: '',
    drivers: {
      low: { xMm: '0', yMm: '-448.4', enclosure: 'ported', fbHz: '31', count: '2', spacingMm: '275.75', depthMm: '50', facing: 'front', tiltDeg: '0', opposed: false },
      mid: { xMm: '0', yMm: '-66', enclosure: 'sealed', fbHz: '89', count: '', spacingMm: '', depthMm: '17', facing: 'front', tiltDeg: '0', opposed: false },
      high: { xMm: '0', yMm: '74', enclosure: 'unknown', fbHz: '', count: '', spacingMm: '', depthMm: '0', facing: 'front', tiltDeg: '0', opposed: false },
    },
  },
  /** Datasheet: Sd per SINGLE driver (the pair is `count: 2`), Xmax one-way. */
  sdCm2: { low: '255', mid: '69', high: '5.6' },
  xmaxMm: { low: '8.5', mid: '5', high: '1' },
} as const;
