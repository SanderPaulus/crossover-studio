/**
 * THE 2-WAY DEMO: casus 1b — KOAN 2951's midrange and tweeter as a two-way,
 * measured 22 Aug 2026. MEASUREMENTS AND GEOMETRY ONLY (U-3b).
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
 * without its woofers, the mid in its closed pod as the lowest way and the
 * waveguide tweeter above it. So the demo a newcomer opens is the case the
 * guards, the golden references and a live chain run all describe.
 *
 * WHAT U-3b TOOK OUT, AND WHY. Until U-3b this bundle also carried casus 1b's
 * REQUIREMENT SHEET — the amplifier peak and its load, the X_max margin, the
 * resistor class and margin and thermal power, the amplifier floor, a per-way
 * M-C figure, Bl and M_ms and the coil family and the wiring, and a voicing.
 * A demo is generic practice material (Sander, 09-09-2026): loading one
 * pre-armed eight gates with somebody else's numbers about somebody else's
 * amplifier, and the panel then reported judgements the viewer never made.
 * That is P4 broken at the screen rather than in the engine — the same failure
 * E-2 removed from the placeholders — and it made the demo the wrong lesson,
 * because the shortlist could not say which requirements judged nothing when
 * they were all stated. The numbers are not lost: they are casus 1b's, in
 * `test-fixtures/casus1b/golden_refs_casus1b.json`, where the guards read them.
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
 * demo's do. No listening position: a demo cannot know where anyone sits.
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

export const KOAN_2WAY_DEMO: DemoBundle = {
  id: 'koan-2way',
  label: 'KOAN 2951 2-way — mid + tweeter (casus 1b, Aug 2026)',
  provenance: {
    source: "casus 1b — casus 1's midrange and tweeter, test-fixtures/casus1/ via scripts/build-demo2way.ts",
    measured: '22 Aug 2026 (the merged midrange response was built from that session on 4 Sep 2026, M-1)',
    note:
      'Measurements and geometry only (U-3b): a demo is practice material, so it states no ' +
      'requirement, no amplifier floor and no voicing. Casus 1b\'s own requirement sheet lives ' +
      'in test-fixtures/casus1b/golden_refs_casus1b.json, where the guards read it.',
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

  /* GEOMETRY, and geometry only (U-3b). Casus 1b's own record
   * (`manifest_en_geometrie.geometrie`): the KOAN prototype front, 260 × 1124
   * mm, the two ways symmetric about the mic aim at ±64.6 mm (centre-to-centre
   * 129.2).
   *
   * THE REFERENCE POINT IS NEW AT U-3b AND IT IS WHY THE POSITIONS WERE WRONG.
   * Casus 1b states none, so the bundle stated none, so `refFromTopMm` was ''
   * — and the app's drawing falls back to `Number(cabinet.refFromTopMm) || 0`,
   * which puts a driver at y +64.6 sixty-five millimetres ABOVE the top of the
   * panel. The positions themselves were right and unreadable. The reference
   * point is the same cabinet's: the mic aim of the KOAN prototype, 244 mm
   * below the top and 900 mm above the floor, which is what the three-way
   * demo's own entry records for this front panel.
   *
   * A DISAGREEMENT THAT IS REAL AND IS NOT PAPERED OVER: with 244 mm the
   * tweeter lands 179.4 mm below the top here, where the three-way demo's own
   * entry puts it at 170. Casus 1's manifest (±64.6, c-t-c 129.2) and Sander's
   * typed cabinet (−66 / +74, c-t-c 140) differ by up to 15 mm on the same
   * loudspeaker. Each bundle uses its own record and neither is silently
   * corrected to the other; the replay script already names that difference.
   *
   * GATE DELIBERATELY EMPTY: every file states its own window, and A3h forbids
   * a global field standing in for a file's own property. Mic elevation,
   * cabinet depth, listening position, mounting depths and the chamber are
   * empty for the reason U-3b gives in `demo3way.ts`: none of them is
   * geometry a filter is built from, and the impedance sweep in this bundle
   * carries the mid's closed-pod corner (88.8 Hz) with an "use it" button
   * beside the field. */
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
      low: {
        xMm: '0',
        yMm: '-64.6',
        enclosure: 'unknown',
        fbHz: '',
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

  /** Datasheet cone area per driver (`driverkaart.S_d_cm2`) — the one
   *  datasheet number a bundle keeps, because S_d is what gives the effective
   *  piston diameter and with it the beaming ceiling of the window. */
  sdCm2: { low: '69', high: '5.7' },
  /** X_max is EMPTY since U-3b: it judges (the excursion floor, and M-C's
   *  allowed voltage on f_s) and a demo judges nothing. */
  xmaxMm: {},
  /** Empty on purpose: S_d gives the piston diameter, so the beaming ceiling
   *  is measured and does not need a nominal size. */
  sizeInch: {},

  /* NOTHING BELOW IS STATED, AND THAT IS THE POINT (U-3b).
   *
   * Until U-3b this bundle carried casus 1b's whole requirement sheet: the
   * amplifier peak and its load, the X_max margin, the continuous power, the
   * resistor class and margin and thermal design power, the amplifier floor
   * (2.6 Ω), a per-way M-C figure on the tweeter, Bl and M_ms and the coil
   * family and the wiring on both ways, and a flat voicing. Ten of the
   * fifteen judgement rows of the I-1 register.
   *
   * WHY THEY ARE GONE. A demo is GENERIC PRACTICE MATERIAL (Sander,
   * 09-09-2026), and a requirement is a decision about one loudspeaker and one
   * amplifier in one room. Loading a demo pre-armed eight gates with somebody
   * else's numbers, and the panel then reported judgements the viewer never
   * made — which is P4 broken at the screen rather than in the engine, the
   * same failure E-2 removed from the placeholders. It also made the demo the
   * wrong lesson: the shortlist could not say "these requirements are not
   * stated" because they all were.
   *
   * WHAT THE VIEWER GETS INSTEAD is the run this app is for: an exploration on
   * measurements and geometry alone, a shortlist, and a line naming every
   * requirement that judged nothing. Stating one is then a decision the viewer
   * makes, marked with their own name and date.
   *
   * The numbers themselves are not lost — they are casus 1b's, in
   * `test-fixtures/casus1b/golden_refs_casus1b.json`, where the guards read
   * them. */
  engineV2: {},
  v2Measurement: {},
  /** The amplifier's minimum load is the OWNER'S preference about a rack, not
   *  a fact about this loudspeaker. A demo states none. */
  ampMinLoadOhm: null,
  /** No voicing: flat is what a design without one is judged against, and a
   *  demo does not choose the target curve of somebody else's loudspeaker. */
  targetCurve: null,
};

/* U-3b — `KOAN_2WAY_STATED` IS GONE, and the mechanism it used is not.
 * `V2StatedBy` exists so a value can name whoever stated it instead of the
 * viewer; with no bundle stating a requirement there is nobody to name, so the
 * loader passes `null` and every field arrives empty and unattributed. The
 * mechanism stays where it is (`v2Settings.ts`), still pinned by
 * `v2Settings.test.ts`, ready for the first project or bundle that needs it. */
