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
import type { DemoBranch, DemoBundle, DemoFile } from './lib/demoBundle.ts';

/* U-3 — the two shapes have one home now (`lib/demoBundle.ts`); these two
 * aliases keep the names this module has always exported. */
export type { DemoFile, DemoBranch } from './lib/demoBundle.ts';

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
  /* U-3b — THE CABINET AND RIG, STRIPPED TO WHAT A FILTER IS BUILT FROM.
   *
   * A demo is generic practice material, so it ships the MEASUREMENTS and the
   * GEOMETRY and nothing else (Sander, 09-09-2026). What was here until U-3b
   * and is not any more, with what each one cost:
   *
   *  · `gateMs: '4.5'` — a GLOBAL window override. Every file of this bundle
   *    states its own window in its own header, and A3h forbids a typed field
   *    standing in for a file's own property; that substitution once put an
   *    evaluation band 53 Hz too high. It also read as "the gate you typed
   *    here" in the honesty line, over files that state a 5.021 ms window.
   *  · `micElevationDeg: '0'` — a stated zero that behaves exactly like blank
   *    (`Number(...) || 0`), so it stated nothing and looked like a decision.
   *  · `listenDistanceM` / `listenEarHeightMm` — Sander's own room. A demo
   *    cannot know where anyone sits, and no filter is built from it.
   *  · `depthMm` per driver (50 / 17 / 0) — the acoustic centre behind the
   *    baffle. It never reaches the engine's geometry (the adapter reads
   *    `v2Meas[role].zMm` or the baffle position), and on the woofer pair the
   *    app's own cross-check disagreed with the 50 mm — an open question about
   *    a pair of cones 276 mm apart, and not one a demo should answer.
   *  · `enclosure` / `fbHz` (ported 31 Hz, sealed 89 Hz) — box facts, not
   *    geometry. The impedance sweep in this very bundle carries the corner,
   *    and the app offers it with an "use it" button beside the field.
   *
   * WHAT STAYS, and why each is geometry a filter is built from: the mic
   * distance (the far-field check and the honest-down-to line), the front
   * panel (the baffle step, and the drawing), the reference point (the origin
   * every driver position is measured from — without it the app draws the
   * drivers off the panel), and per driver its position, how many there are
   * and how far apart. The positions are Sander's own entry for this cabinet,
   * which is the SOURCE casus 1's manifest cites for the baffle block; they
   * are deliberately not replaced by the manifest's own z-offsets, which
   * disagree by up to 15 mm and whose difference is a recorded finding of the
   * E-2 replay (382.4 mm against 261 mm). */
  cabinet: {
    micDistanceMm: '1000',
    micElevationDeg: '',
    gateMs: '',
    baffleWidthMm: '260',
    baffleHeightMm: '1124',
    cabinetDepthMm: '',
    refFromTopMm: '244',
    refHeightMm: '900',
    listenDistanceM: '',
    listenEarHeightMm: '',
    refDriver: '',
    drivers: {
      low: { xMm: '0', yMm: '-448.4', enclosure: 'unknown', fbHz: '', count: '2', spacingMm: '275.75', depthMm: '', facing: 'front', tiltDeg: '0', opposed: false },
      mid: { xMm: '0', yMm: '-66', enclosure: 'unknown', fbHz: '', count: '', spacingMm: '', depthMm: '', facing: 'front', tiltDeg: '0', opposed: false },
      high: { xMm: '0', yMm: '74', enclosure: 'unknown', fbHz: '', count: '', spacingMm: '', depthMm: '', facing: 'front', tiltDeg: '0', opposed: false },
    },
  },
  /** Datasheet cone area per SINGLE driver (the pair is `count: 2`). It is the
   *  one datasheet number a bundle keeps: S_d is what gives the effective
   *  piston diameter, and without it the beaming ceiling of every window falls
   *  back to a nominal size this bundle does not state either. X_max left with
   *  it until U-3b and is gone — it judges (the excursion floor), and a demo
   *  judges nothing. */
  sdCm2: { low: '255', mid: '69', high: '5.6' },
} as const;

/**
 * U-3 — THE SAME BUNDLE IN THE SHARED SHAPE, so one loader and two guards can
 * read both demos. Every block a bundle can carry beyond the measurements and
 * the geometry is EMPTY here — the stated requirements, the A5a measurement
 * facts, the amplifier floor, the voicing, X_max, the nominal size — and
 * saying it with an empty block rather than a missing one is what lets the
 * loader assign them and stop a previously loaded demo owning them.
 *
 * U-3b made that emptiness the RULE rather than an accident of this bundle's
 * age: a demo is practice material, so it may state measurements and geometry
 * and nothing that judges. `BUNDLE_CARRIED_ROWS` in `demoBundle.ts` is that
 * rule as data, and the guard reads it for BOTH bundles.
 */
export const KOAN_3WAY_BUNDLE: DemoBundle = {
  id: 'koan-3way',
  label: KOAN_3WAY_DEMO.label,
  provenance: {
    source: 'Sander Somers — KOAN 2951, the finished cabinet',
    measured: '15 Aug 2026, 0–60° at 1 m, near fields and LIMP impedances',
  },
  branches: {
    low: KOAN_3WAY_DEMO.low,
    mid: KOAN_3WAY_DEMO.mid,
    high: KOAN_3WAY_DEMO.high,
  },
  cabinet: KOAN_3WAY_DEMO.cabinet,
  sdCm2: KOAN_3WAY_DEMO.sdCm2,
  xmaxMm: {},
  sizeInch: {},
  engineV2: {},
  v2Measurement: {},
  ampMinLoadOhm: null,
  targetCurve: null,
};
