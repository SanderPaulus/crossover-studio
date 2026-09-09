/**
 * THE 2-WAY DEMO: casus 1b — KOAN 2951's midrange and tweeter as a two-way,
 * measured 22 Aug 2026, with every requirement its casebook states.
 *
 * WHAT IT REPLACED, AND WHY (U-3). The two-way demo used to be the 2023 KOAN
 * prototype: twelve `*_mettape.txt` exports, 0–75° for both ways, and a
 * VituixCAD project. Those exports carry NO header — no window, no merge block,
 * nothing — so `readGateHeader` answered `absent` on all twelve and the app
 * refused to optimise with its own honest message ("states no measurement
 * window, so there is no way to know how low it is honest"). The demo blocked
 * its own route. Writing a window back into a file that never carried one is
 * inventing a measurement (A3h), and the 2023 session's headed originals no
 * longer exist, so the fix is a different session. The twelve files stay where
 * they are as parser and optimizer fixtures; only the demo moved.
 *
 * WHY CASUS 1b. It is the two-way this project already reasons about: casus 1
 * without its woofers, the mid in its closed pod (f_c 88.8 Hz) as the lowest
 * way and the waveguide tweeter above it, with every requirement of casus 1
 * that is stated on the system or on those two drivers
 * (`test-fixtures/casus1b/golden_refs_casus1b.json`). So the demo a newcomer
 * opens is the case the guards, the golden references and a live chain run all
 * describe — and every number below can be traced to a line of that file.
 *
 * WHAT THE FILES ARE. Casus 1's own measurements, resampled to a grid small
 * enough to ship by `scripts/build-demo2way.ts`, with their ORIGINAL headers
 * copied verbatim: the ARTA window on the gated tweeter and the 30° mid, the
 * M-1 merge block on the merged mid. Four of them are byte-identical in their
 * data rows to the three-way demo's — the same session, so they must be, and
 * `demoBundle.test.ts` pins that rather than leaving two copies to drift.
 *
 * WHAT IT DELIBERATELY DOES NOT CARRY. No 0–75° directivity set: casus 1
 * measured the mid at 0° and 30° and the tweeter on axis only, and inventing
 * angles to match the old demo's shape would be inventing measurements. No
 * VituixCAD project: the impedances stand on their own, as the three-way
 * demo's do. No listening position and no reference-point height: casus 1b
 * states neither, and the cabinet form is for what was measured.
 *
 * Its own module, dynamically imported, so its measurement text is a chunk that
 * only downloads when someone asks for it.
 */

import type { DemoBundle } from './lib/demoBundle.ts';

import midMerged from './lib/parsers/fixtures/koan-2way/mid-merged-hor0.frd?raw';
import midHor30 from './lib/parsers/fixtures/koan-2way/mid-hor30.txt?raw';
import midNear from './lib/parsers/fixtures/koan-2way/mid-near.txt?raw';
import midZ from './lib/parsers/fixtures/koan-2way/mid.zma?raw';
import tweeterHor0 from './lib/parsers/fixtures/koan-2way/tweeter-hor0.txt?raw';
import tweeterZ from './lib/parsers/fixtures/koan-2way/tweeter.zma?raw';

const f = (name: string, raw: string) => ({ name, raw });

/** The day casus 1b's requirements were carried over from casus 1 (E-3). */
const STATED_ON = '2026-09-06';
/** Whose numbers these are. Shown beside every field the bundle fills. */
const STATED_BY = 'the KOAN 2951 demo (Sander Somers, casus 1b)';

export const KOAN_2WAY_DEMO: DemoBundle = {
  id: 'koan-2way',
  label: 'KOAN 2951 2-way — mid + tweeter (casus 1b, Aug 2026)',
  provenance: {
    source: "casus 1b — casus 1's midrange and tweeter, test-fixtures/casus1/ via scripts/build-demo2way.ts",
    measured: '22 Aug 2026 (the merged midrange response was built from that session on 4 Sep 2026, M-1)',
    note:
      'The requirements are casus 1b\'s own (golden_refs_casus1b.json → gestelde_eisen, driverkaart); ' +
      'the ones casus 1 states on its WOOFER are deliberately not carried, because a two-way without ' +
      'a woofer has nothing to judge with them.',
  },

  /* The LOWEST way sits in the app's woofer slot — that is what a two-way is
   * here — so the midrange is `low` and the tweeter is `high`. */
  branches: {
    low: {
      angles: [
        { hor: 0, file: f('mid-merged-hor0.frd', midMerged) },
        { hor: 30, file: f('mid-hor30.txt', midHor30) },
      ],
      impedance: f('mid.zma', midZ),
      /* The cone near field the merge was made from. The on-axis file already
       * declares that merge, so the app's live splice steps over it (I-2) and
       * the file sits there as the ingredient it is — enough to redo the merge
       * from the Drivers tab and read the same block back. */
      nearCone: f('mid-near.txt', midNear),
    },
    high: {
      angles: [{ hor: 0, file: f('tweeter-hor0.txt', tweeterHor0) }],
      impedance: f('tweeter.zma', tweeterZ),
    },
  },

  /* The cabinet as casus 1b records it (manifest_en_geometrie.geometrie): the
   * KOAN prototype front, 260 × 1124 mm, the two ways symmetric about the mic
   * aim at ±64.6 mm (centre-to-centre 129.2). GATE DELIBERATELY EMPTY: every
   * file states its own window, and A3h forbids a global field standing in for
   * a file's own property — that substitution is what put an evaluation band
   * 53 Hz too high once already. Mounting depths, reference height and
   * listening position are equally empty: casus 1b states none of them. */
  cabinet: {
    micDistanceMm: '1000',
    micElevationDeg: '0',
    gateMs: '',
    baffleWidthMm: '260',
    baffleHeightMm: '1124',
    cabinetDepthMm: '',
    refFromTopMm: '',
    refHeightMm: '',
    listenDistanceM: '',
    listenEarHeightMm: '',
    refDriver: '',
    drivers: {
      low: {
        xMm: '0',
        yMm: '-64.6',
        // Its own closed pod; 88.8 Hz is what the measured impedance says, and
        // the app proposes exactly that from the sweep.
        enclosure: 'sealed',
        fbHz: '88.8',
        count: '1',
        spacingMm: '',
        depthMm: '',
        facing: 'front',
        tiltDeg: '0',
        opposed: false,
      },
      high: {
        xMm: '0',
        yMm: '64.6',
        // A dome's rear chamber is not a designed box; f_s 924.3 Hz belongs to
        // the driver and the sweep already carries it.
        enclosure: 'unknown',
        fbHz: '',
        count: '1',
        spacingMm: '',
        depthMm: '',
        facing: 'front',
        tiltDeg: '0',
        opposed: false,
      },
    },
  },

  /** Datasheet, per driver: S_d and the ONE-WAY X_max (driverkaart). */
  sdCm2: { low: '69', high: '5.7' },
  xmaxMm: { low: '3', high: '1' },
  /** Empty on purpose: S_d gives the piston diameter, so the beaming ceiling
   *  is measured and does not need a nominal size. */
  sizeInch: {},

  /* THE STATED REQUIREMENTS — gestelde_eisen, each with its own line there.
   * What is empty is empty because casus 1b states nothing: the LF-bump budget
   * and the Q_es ceiling are woofer-bound and explicitly not carried
   * (`niet_overgenomen`), the coil class is empty with casus 1's finding that
   * the C-Coil documentation names no saturation current, and the level-work
   * rule does not apply to a two-way whose lowest way is the one the rule says
   * you MAY pad. The taste requirements (SPL window, phase tracking) and the
   * dissipation and EPDR gates are not stated either. P4 all the way down. */
  engineV2: {
    // M-C v2.0 (V49): the amplifier peak, the load it is specified into, and
    // the fraction of X_max a design may use.
    amplifierPeakPowerW: '160',
    amplifierNominalLoadOhm: '8',
    xmaxMarginFraction: '0.8',
    // The continuous power the watt columns are reported at (V50).
    amplifierPowerW: '100',
    // Buildability (V50/V51): resistor class and margin, judged at the thermal
    // design power rather than at the amplifier's continuous rating.
    resistorClassW: '10',
    resistorPowerMargin: '0.5',
    resistorThermalPowerW: '10',
    coilClassA: '',
    // The single M-C figure stays empty: casus 1b states one PER WAY, and the
    // per-way field wins (V50).
    maxDriveOnFsDb: '',
  },

  /* A5a — what the measurement session knows about each way (driverkaart).
   * `driveVoltageV` is empty with casus 1's finding attached: the far-field
   * drive voltage is not documented, so M-C's acoustic counter-proof stays off
   * rather than assuming 2.83 V. `reOhm` is empty because nobody put a meter on
   * these drivers: the datasheet R_e is not a meter reading, and the engine
   * resolves R_e from the sweep and says which reading it used. */
  v2Measurement: {
    low: {
      rotSym: 'yes',
      blTm: '4.9',
      mmsG: '7.2',
      wiringMeasured: 'parallel',
      wiringDesired: 'parallel',
      coilFamily: 'jantzen|air core wire coil|1',
      // No stated figure for the mid: only the derived excursion ceiling (V49).
      driveOnFsMaxDb: '',
    },
    high: {
      rotSym: 'yes',
      blTm: '2.6',
      mmsG: '0.15',
      wiringMeasured: 'parallel',
      wiringDesired: 'parallel',
      coilFamily: 'jantzen|air core wire coil|1',
      // The tweeter carries the −20 dB convention (V47b/V50).
      driveOnFsMaxDb: '-20',
    },
  },

  /** The amplifier's minimum load, Ω. Written only when the viewer has none of
   *  their own — it describes a rack, not this loudspeaker. */
  ampMinLoadOhm: 2.6,

  /** M-1: the filter is designed on a FLAT plateau, and a stated 0 dB offset
   *  IS the flat reference — not the absence of a voicing. */
  targetCurve: { type: 'flat' },
};

/** When and by whom every field above was stated — see `V2StatedBy`. */
export const KOAN_2WAY_STATED = { on: STATED_ON, by: STATED_BY };
