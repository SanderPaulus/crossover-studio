/**
 * CASUS 1 (Koan 2951, 22-08-2026) as an engine-v2 input, built from the files
 * in `test-fixtures/casus1/` and the manifest inside
 * `test-fixtures/golden_refs_casus1.json`.
 *
 * This lives beside the engine rather than inside a test file because THREE
 * tests need it — the golden references, the new-measurement test and the
 * coverage test — and three copies of a fixture loader is three chances for
 * them to disagree about what casus 1 is.
 *
 * It reads from disk, so it is only ever imported from tests; nothing in the
 * app's import graph reaches it, and `toggleRegression.test.ts` pins that.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrd } from '../parsers/frd.ts';
import { parseLim } from '../parsers/lim.ts';
import { crossoverToNetlist } from '../vxpNetwork.ts';
import { deserializeFilter } from '../filterFile.ts';
import type { VxpCrossover } from '../parsers/vxp.ts';
import { parseArtaHeader, type Manifest, type ManifestEntry, type MeasurementKind } from './ingest/manifest.ts';
import type { MeasurementFile } from './ingest/derive.ts';
import type { FilterInput } from './report.ts';
import type { DriverCard, Geometry } from './metrics/types.ts';
import { baffleStepHz } from '../cabinet.ts';
import { FLAT_TARGET, type TargetCurve } from './requirements/targetCurve.ts';
import { ctcKey } from './metrics/types.ts';
import type { WayWiring, WiringKind } from './ingest/wiring.ts';
import type { LowestWayLevelWork } from '../levelWork.ts';

export const CASUS1_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'test-fixtures',
  'casus1',
);
export const GOLDEN_PATH = join(CASUS1_DIR, '..', 'golden_refs_casus1.json');

export interface GoldenRefs {
  /**
   * Every tolerance class, INCLUDING the ones derived at F1. They live in the
   * reference file rather than in the test that reads them: a tolerance is
   * part of the reference, and a test carrying its own could relax one
   * without the reference ever noticing. The motivation per class sits beside
   * them in `toleranties_toelichting`.
   */
  toleranties: {
    frequenties_pct: number;
    dB: number;
    graden: number;
    ohm: number;
    Q_pct: number;
    exponent_pct: number;
    watt_pct: number;
    lambda_pct: number;
    procentpunten: number;
    /**
     * F3b — the measured quality of the motional R_e fit is itself a reference.
     * See `toleranties_toelichting.fit_kwaliteit_pct`: a deterministic solver
     * owes these numbers back, so a change that moves them has to fail loudly
     * rather than shift quietly.
     */
    fit_kwaliteit_pct: number;
  };
  toleranties_toelichting: Record<string, string>;
  /** Why five references were revised at F1 — see V13/V14/V15 in the casebook. */
  herziening_F1_toelichting: string[];
  afgeleide_parameters: Record<string, Record<string, unknown>>;
  /**
   * A5d.4's anchored gaps. Typed since V45 for the reason the withdrawn M-C
   * block is typed: the golden suite runs a standing test off these numbers AND
   * off the bridge beside them, and evidence has to stay checkable.
   */
  verankerde_gaps_dB: Record<string, unknown> & {
    anker: string;
    woofer_tov_mid: number;
    tweeter_tov_mid: number;
    status: string;
    /** The values this block carried before A5e.2 closed — the V15 bridge. */
    _waarden_voor_A5e2: {
      sessie_25_08_2026: { woofer_tov_mid: number; tweeter_tov_mid: number };
      engine_op_kale_niveaus: { woofer_tov_mid: number; tweeter_tov_mid: number };
    };
    parameters: Record<string, unknown> & {
      /** V45 — the target curve these levels were adjusted by (A5d.4a). */
      doelcurve: {
        type: string;
        plateau_diepte_dB: number;
        overgang_hz: number;
        verschuiving_per_weg_dB: Record<string, number>;
      };
    };
  };
  kandidaten: Record<string, Record<string, unknown>> & {
    /**
     * The WITHDRAWN 25-08 M-C values, together with the session parameters
     * they were computed with.
     *
     * Typed rather than left as loose JSON because the golden suite runs a
     * standing test off it: reproducing those values from those parameters is
     * the evidence that the band choice was the whole explanation, and the
     * evidence has to stay checkable. This is also the process rule the case
     * produced — a reference that depends on a band, an average or a grid
     * records them, or it is not reproducible and therefore not a reference.
     */
    _V_tweeter_op_fs_dB_sessie_25_08: {
      waarden: Record<string, number>;
      band_hz: { tweeter: [number, number]; mid: [number, number] };
      middeling: string;
      grid: { van_hz: number; tot_hz: number; punten: number; verdeling: string };
      fs_hz: { tweeter: number; mid: number };
      fs_afronding: string;
    };
  };
  kruisvensters: Record<string, Record<string, unknown>>;
  /**
   * A5d.6's bound inversions, with the parameters each one was computed with.
   *
   * Typed rather than left as loose JSON for the same reason the withdrawn
   * M-C block is: the golden suite asserts on these, and the V15 process rule
   * says a reference that depends on a band, an averaging or a grid records
   * them. A shape the compiler checks is a record that cannot quietly lose a
   * field.
   */
  grens_inversies: {
    maxRs_Qmult1_3_ohm: number;
    maxRs_Qmult1_5_ohm: number;
    maxRs_Qmult2_0_ohm: number;
    /* V43 — the LIVE bound, on the RESONANT half of M-D's lift and against the
     * re-derived 1.4 dB budget. The V42 form (2.432 mH on `extraDb` at 2.5 dB)
     * stays beside it as a bridge; both are asserted, and the pair is what
     * makes the redefinition checkable rather than merely announced. */
    maxL_bij_Rs0_5_budget1_4dB_opslingering_mH: number;
    _maxL_op_de_som_V42: {
      waarde: number;
      grootheid: string;
      budget_dB: number;
      pad_R_ohm: number;
      /** What the ceiling WOULD have become if only the quantity had moved. */
      waarde_zonder_herijking: number;
      waarom_ingetrokken: string;
    };
    _maxL_sessie_25_08: {
      waarde: number;
      band_hz: [number, number];
      referentie_hz: number;
      pad_R_ohm: number;
      budget_dB: number;
      herkomst: string;
      reproductie: string;
    };
    max_padR_tweeter_gap_ohm: number;
    parameters: {
      maxRs_Qmult: { formule: string; R_e_ohm: number; R_e_herkomst: string; q_max: number };
      maxL_bult: {
        grootheid: string;
        formule: string;
        budget_dB: number;
        budget_herkomst: string;
        pad_R_ohm: number;
        /** V43 — the two halves of the lift at this path resistance. */
        decompositie: {
          resistief_equivalent: string;
          lift_bij_L0_dB: number;
          lift_bij_L0_waarom: string;
          som_bij_de_grens_dB: number;
          som_waarom: string;
        };
        tegenvoorbeeld_pad_R_ohm: number;
        tegenvoorbeeld_waarom: string;
        band: string;
        f_p_hz: number;
        assert: string;
      };
      max_padR: {
        formule: string;
        Z_referentie: string;
        doorlaatband_hz: [number, number];
        budget_dB: number;
        budget_herkomst: string;
        demping_marge_dB: number;
        gemeten: number;
      };
      voorbound_serie_C: {
        Z_ohm: number;
        f_s_hz: number;
        verzwakking_dB: number;
        gerealiseerd_uF: number;
        gerealiseerd_orde: number;
        casusboek: string;
      };
    };
    herziening_F2: string;
  };
  vensterinteractie: Record<string, unknown>;
  /**
   * A5c.1's motional R_e fit, with the parameters it was computed with.
   *
   * Typed for the same reason the withdrawn M-C block and the bound inversions
   * are: the golden suite asserts on these, and the V15 process rule says a
   * reference that depends on a BAND, an AVERAGING or a GRID records them. All
   * three apply here — the fit has a band, a weighting and a fixed start list.
   */
  re_fit_parameters: {
    band_multiple: number;
    sensitivity_band_multiples: number[];
    exponent_starts: number[];
    coefficient_starts: number[];
    kwaliteitsgrenzen: {
      max_relatief_residu: number;
      max_bandgevoeligheid_fractie: number;
    };
  };
  manifest_en_geometrie: {
    bestanden: Record<string, { drv: string; typ: string; hoek?: number }>;
    ff_headers: Record<string, number>;
    geometrie: {
      D_inch: Record<string, number>;
      z_offset_mm: Record<string, number>;
      ctc_mm: Record<string, number>;
      /**
       * A5e.2 — the cabinet front, mm. A MEASURED dimension, in this block for
       * the same reason `ctc_mm` is; the baffle-step frequency the target curve
       * centres its transition on is derived from `breedte` and from nothing
       * else (P6).
       */
      baffle_mm?: { breedte: number; hoogte: number };
      rotatiesymmetrisch: Record<string, boolean>;
    };
    netlists: Record<string, string>;
  };
}

export function loadGolden(): GoldenRefs {
  return JSON.parse(readFileSync(GOLDEN_PATH, 'utf-8')) as GoldenRefs;
}

/** Read one measurement file and pair it with its manifest tags. */
export function loadMeasurement(entry: ManifestEntry): MeasurementFile {
  const path = join(CASUS1_DIR, entry.file);
  if (entry.kind === 'Z') {
    const buf = readFileSync(path);
    const z = parseLim(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
    return {
      entry,
      impedance: { freq: z.freq, magnitude: z.magnitude, phaseDeg: z.phase },
    };
  }
  const text = readFileSync(path, 'latin1');
  const f = parseFrd(text);
  return {
    entry: { ...entry, header: parseArtaHeader(f.meta.rawComments) },
    response: { freq: f.freq, spl: f.spl, phaseDeg: f.phase },
  };
}

/**
 * Build the manifest exactly as the golden file describes it — including the
 * near-field diameters, which the manifest carries as tags and which Keele's
 * ceiling is derived from.
 */
/**
 * WHICH MEASUREMENT SET (M-1).
 *
 * `'merged'` — THE v2 SET since M-1 (04-09-2026): the on-axis far fields of the
 * woofers and the mid are replaced by their NF/FF MERGES
 * (`manifest_en_geometrie.gemergde_set`), each carrying a merge block the
 * parser reads (`Merge = NF/FF`, `Valid from = …`), so the woofer is valid from
 * 20.5 Hz and the mid from 60 Hz instead of from the 2.5 ms gate at 397 Hz.
 * Everything else — impedances, near fields, the 30° mid, the tweeter — is the
 * 22-08-2026 session unchanged. This is the DEFAULT: what the v2 route, the
 * corpus and every class-A/B reference read.
 *
 * `'gated'` — the 22-08-2026 session as measured, gated far fields and all.
 * Kept for the v1 route (byte-identical, it never reads engine2) and for the
 * tests that exercise the HEADER-FLOOR machinery itself (1/T, the advisory
 * FF/NF detector, the manual window): those claims are about a gated file and
 * have to be made on one. A test that reads it says so at the call.
 */
export type Casus1MeasurementSet = 'merged' | 'gated';

/** The merged files, keyed by name, with the gated file each one REPLACES. */
export interface MergedSetEntry {
  drv: string;
  typ: string;
  hoek?: number;
  vervangt: string;
}

export function casus1MergedSet(golden: GoldenRefs = loadGolden()): Record<string, MergedSetEntry> {
  const block = (golden.manifest_en_geometrie as unknown as {
    gemergde_set?: { bestanden?: Record<string, MergedSetEntry> };
  }).gemergde_set;
  return block?.bestanden ?? {};
}

export function casus1Manifest(
  golden: GoldenRefs = loadGolden(),
  set: Casus1MeasurementSet = 'merged',
): Manifest {
  const g = golden.manifest_en_geometrie;
  const merged = set === 'merged' ? casus1MergedSet(golden) : {};
  const replacedBy = new Map<string, [string, MergedSetEntry]>();
  for (const [file, tag] of Object.entries(merged)) replacedBy.set(tag.vervangt, [file, tag]);
  const entries: ManifestEntry[] = Object.entries(g.bestanden).map(([gatedFile, gatedTag]) => {
    /* The merged file takes the gated file's PLACE — same driver, same kind,
     * same angle, same position in the list — so the manifest reads as one
     * session with three files swapped and not as a second session. */
    const swap = replacedBy.get(gatedFile);
    const [file, tag] = swap ?? [gatedFile, gatedTag];
    const kind = tag.typ as MeasurementKind;
    const entry: ManifestEntry = { file, driver: tag.drv, kind };
    if (tag.hoek !== undefined) entry.angleDeg = tag.hoek;
    if (kind === 'NF') {
      const d = g.geometrie.D_inch[tag.drv];
      if (d !== undefined) entry.diameterInch = d;
    }
    return entry;
  });
  if (set === 'merged') {
    for (const [file, tag] of Object.entries(merged)) {
      if (!(tag.vervangt in g.bestanden)) {
        throw new Error(`gemergde_set: ${file} replaces ${tag.vervangt}, which the 22-08 manifest does not list`);
      }
    }
  }
  return { sessionId: set === 'merged' ? 'koan2951-2026-08-22-M1-merge' : 'koan2951-2026-08-22', entries };
}

export function casus1Files(manifest: Manifest): MeasurementFile[] {
  return manifest.entries.map(loadMeasurement);
}

/**
 * Geometry from the golden file's own manifest block.
 *
 * The centre-to-centre map is keyed by DRIVER PAIR, and the woofer pair's own
 * internal spacing (`woofer_woofer`) is deliberately not a crossover pair: it
 * describes an array inside one way, which is a different question from the
 * handover between two ways.
 */
export function casus1Geometry(golden: GoldenRefs = loadGolden()): Geometry {
  const g = golden.manifest_en_geometrie.geometrie;
  return {
    ctcMm: {
      [ctcKey('woofer', 'mid')]: g.ctc_mm['woofer_mid'],
      [ctcKey('mid', 'tweeter')]: g.ctc_mm['mid_tweeter'],
    },
    // F3c: casus 1's spacings are the CASEBOOK's, not the app project's, and
    // the two are far enough apart to put the worst lobing zone on opposite
    // sides of a crossover ceiling. Saying so here is what keeps a reader from
    // comparing a fixture band against a band the running app produced.
    ctcSource: {
      [ctcKey('woofer', 'mid')]: 'casebook geometry (golden_refs_casus1.json)',
      [ctcKey('mid', 'tweeter')]: 'casebook geometry (golden_refs_casus1.json)',
    },
    // The two woofers are one way, measured as one source. Their own spacing is
    // still a real source separation, so it is given as an array spacing.
    arraySpacingMm: { woofer: g.ctc_mm['woofer_woofer'] },
    /* WHERE EACH RADIATOR ACTUALLY IS (V20).
     *
     * The golden file has carried the two woofer positions separately all
     * along — `woofer_boven` and `woofer_onder` — and the fixture used to
     * average them away before the metrics ever saw them. That average is
     * still right for the vertical synthesis, which wants one acoustic centre
     * per branch; it is wrong for the λ fractions, which exist precisely
     * because a way with two radiators sits at more than one distance from its
     * neighbour. Both are built from the same block, and neither derives the
     * other.
     *
     * Amplitudes are left unstated on purpose: the pair is wired in parallel,
     * so equal is right, and the metric says out loud that it took them as
     * equal rather than quietly writing 1 here. */
    waySources: {
      woofer: [
        { id: 'woofer boven', zMm: g.z_offset_mm['woofer_boven'] },
        { id: 'woofer onder', zMm: g.z_offset_mm['woofer_onder'] },
      ],
      mid: [{ id: 'mid', zMm: g.z_offset_mm['mid'] }],
      tweeter: [{ id: 'tweeter', zMm: g.z_offset_mm['tweeter'] }],
    },
    // The woofer is a PAIR measured as one source; its acoustic centre for the
    // vertical synthesis is the midpoint of the two, which is what the golden
    // file's two woofer offsets average to.
    zOffsetMm: {
      woofer: (g.z_offset_mm['woofer_boven'] + g.z_offset_mm['woofer_onder']) / 2,
      mid: g.z_offset_mm['mid'],
      tweeter: g.z_offset_mm['tweeter'],
    },
    rotationallySymmetric: {
      mid: g.rotatiesymmetrisch['mid'] ?? false,
      tweeter: g.rotatiesymmetrisch['tweeter'] ?? false,
      woofer: false,
    },
    /* A5e.2 — the baffle width, which until now nothing in engine2 read. It is
     * spread rather than assigned so a casus that states no cabinet leaves the
     * KEY absent: the target curve then has no measured step frequency to
     * centre a transition on, and must produce none rather than one at a
     * default (P4, P6). */
    ...(g.baffle_mm?.breedte !== undefined ? { baffleWidthMm: g.baffle_mm.breedte } : {}),
  };
}

/**
 * MEASURED DC resistance of the woofer PAIR in parallel, ohms.
 *
 * A project input, not a derivation: A4 lists R_e as M-E's declared data need
 * precisely because the derived value cannot be trusted here. V8d documents
 * why - this sweep starts at 10 Hz, less than an octave under f_L = 16.5 Hz,
 * so Re(Z) at the bottom of it still carries motional impedance and reads
 * 3.81 ohm against a real ~3 ohm. The number below is the reference analysis's
 * own meter reading of the pair (docs/prototype/compare.py, `Re_w`).
 */
export const CASUS1_WOOFER_DC_OHM = 3.05;

/**
 * The amplifier floor the DESIGNER stated for casus 1, ohms — read from the
 * reference file, never written here.
 *
 * WHY IT IS A LOOKUP AND NOT A CONSTANT. It is a project number: it describes
 * the rack this loudspeaker will hang on, not the loudspeaker. P6 says such a
 * number is derived from project data or from an explicit project setting, and
 * this is the second kind. A `const CASUS1_AMP_MIN_LOAD = 2.6` two lines above
 * would satisfy the letter of the lint (it is under the ≥ 20 threshold) and
 * break the rule outright: there would then be two places holding the floor,
 * and the day the designer changes the manifest the fixture would keep tuning
 * against the old one. So it lives in `manifest_en_geometrie.gestelde_eisen`
 * and everything reads it from there.
 *
 * Null when the project states none, and that is P4 rather than a fallback:
 * a casus without a stated floor must arm no gate at all, which is exactly
 * what casus 1 itself looked like until the floor was stated.
 */
export function casus1AmpMinLoadOhm(golden: GoldenRefs = loadGolden()): number | null {
  const stated = (golden.manifest_en_geometrie as unknown as {
    gestelde_eisen?: { versterkervloer_ohm?: unknown };
  }).gestelde_eisen;
  const v = stated?.versterkervloer_ohm;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * V42/V43 — the LF-lift budget the DESIGNER stated for casus 1, dB. Same shape
 * as the floor above, same reason, and the differences are the interesting
 * part.
 *
 * IT ARMS AN INVERSION, NOT A GATE. The floor is a limit on a delivered
 * network and `M-B/|Z|` judges it. M-D has no gate id at all — it is a
 * REPORTING metric in A4 — so a stated lift budget cannot condemn anything.
 * What it does instead is give `invertBudgets` its `bump-series-l` rule an
 * input, which turns into a ceiling on the lowest way's series inductance:
 * the search is bounded rather than the outcome judged. That is the whole
 * point of the session that added it — the lift stops being a property one
 * reads off the result and becomes a limit the search respects.
 *
 * IT IS ON THE RESONANT HALF SINCE V43, and the field is named for it
 * (`lf_opslingering_budget_dB`). V42 stated 2.5 dB on `extraDb`, the SUM of the
 * broad resistive lift and the narrow resonant amplification, and that turned
 * out to be the wrong quantity twice over: it condemned level work (all three
 * reference filters exceeded it while their coils added nothing) and above
 * roughly 1.5 Ω of path resistance it was spent before any coil existed, so the
 * inversion produced no ceiling at all. The stated number was re-derived on the
 * new quantity from the designer's own coil rule and is 1.4 dB; the manifest
 * carries the derivation.
 *
 * Null when the project states none, and that is P4: no budget, no inversion,
 * no ceiling, and the notes say which input was missing. No fallback to the
 * V42 field name either — the golden refs live in this repository, so a
 * fallback would only ever hide a botched rename.
 */
export function casus1LfResonantBudgetDb(golden: GoldenRefs = loadGolden()): number | null {
  const stated = (golden.manifest_en_geometrie as unknown as {
    gestelde_eisen?: { lf_opslingering_budget_dB?: unknown };
  }).gestelde_eisen;
  const v = stated?.lf_opslingering_budget_dB;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * V45 (A5e.2) — the BASS-PLATEAU DEPTH the designer stated for casus 1, dB.
 * Same shape as the floor and the LF budget above, same reason, and one
 * difference that is written down in the manifest rather than here: this number
 * is STATED and not measured, because on this measurement set it cannot be
 * measured at all. The far-field validity floor is 396.7 Hz — nearly three
 * octaves above the woofer's f_p — so the plateau lives entirely below what a
 * 2.5 ms gate can see, and reconstructing it needs a near/far merge whose own
 * baffle-step knob would assume the answer.
 *
 * WHAT IT IS: the DEPTH of the target curve's shelf, not a level anybody read
 * off a graph. The transition it sits under is derived (`casus1TargetCurve`).
 *
 * Null when the project states none, and that is P4: no depth, no evaluable
 * target curve, and every judgement falls back on the flat reference — which is
 * the neutral reference and not a guess.
 */
export function casus1BassPlateauDb(golden: GoldenRefs = loadGolden()): number | null {
  const stated = (golden.manifest_en_geometrie as unknown as {
    gestelde_eisen?: { basplateau_offset_dB?: unknown };
  }).gestelde_eisen;
  const v = stated?.basplateau_offset_dB;
  /* ZERO IS A STATEMENT (M-1, 04-09-2026): Sander states the plateau at 0.0 dB
   * — the filter is designed on a flat anechoic plateau, woofers and tweeter
   * on the mid's level, and the in-room shape comes from the room and the wall
   * placement, not from the filter. A stated 0 is therefore returned as 0 and
   * `casus1TargetCurve` turns it into the flat reference; only an absent or
   * negative field reads as "not stated" (P4). */
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
}

/**
 * V45 — the design's own TARGET CURVE, built from the two places A5e.2 says
 * they come from.
 *
 * The DEPTH is read from `gestelde_eisen`; the STEP FREQUENCY is derived from
 * the cabinet's measured front width through `baffleStepHz` and from nothing
 * else. Neither is written here, and that split is the point (P6): a frequency
 * in this project comes from project data, and a voicing depth comes from a
 * designer.
 *
 * Returns the FLAT target when either half is missing. Flat is the neutral
 * reference rather than a fallback — "no voicing stated" is a coherent state
 * and the report says so — but a `bass-plateau` with half its parameters would
 * not be, and inventing the other half is what P4 forbids.
 */
export function casus1TargetCurve(golden: GoldenRefs = loadGolden()): TargetCurve {
  const depth = casus1BassPlateauDb(golden);
  const width = golden.manifest_en_geometrie.geometrie.baffle_mm?.breedte;
  const step = width !== undefined ? baffleStepHz(width) : null;
  if (depth === null || step === null) return FLAT_TARGET;
  /* A STATED plateau of 0 dB IS the flat reference (M-1): a `bass-plateau`
   * with depth 0 would be a shelf of no depth, which the vocabulary refuses
   * (P4 — a shape whose parameter is missing), and the flat curve says the
   * same thing in the word the report already prints for it. */
  if (depth === 0) return FLAT_TARGET;
  return { type: 'bass-plateau', plateauDepthDb: depth, stepHz: step };
}

/**
 * M-1 — the target curve of a DATED plateau depth, for the bridges: the same
 * derivation as `casus1TargetCurve` with the depth handed in instead of read,
 * so a test can reproduce what an earlier voicing gave on the same data.
 */
export function casus1TargetCurveAt(depthDb: number, golden: GoldenRefs = loadGolden()): TargetCurve {
  const width = golden.manifest_en_geometrie.geometrie.baffle_mm?.breedte;
  const step = width !== undefined ? baffleStepHz(width) : null;
  if (step === null || !(depthDb > 0)) return FLAT_TARGET;
  return { type: 'bass-plateau', plateauDepthDb: depthDb, stepHz: step };
}

/**
 * V45 — the Q_es MULTIPLICATION CEILING the designer stated for casus 1.
 *
 * Same shape and the same reason as the LF budget: it arms an A5d.6 INVERSION
 * (`qes-series-r`) and not a gate — M-E has no gate id in `GATE_IDS`, so a
 * stated ceiling cannot condemn a delivered network, it bounds the total series
 * resistance the search may put in the lowest way's path.
 *
 * It divides by the R_e the RUN resolved (A5c.1), never by a reading fixed
 * here: the casebook carries two readings of this woofer pair's R_e (V16) and a
 * ceiling pinned to one of them would quietly disagree with the panel beside
 * it. The manifest records what the ceiling comes to on each.
 *
 * Null when the project states none — P4, no inversion, no ceiling.
 */
export function casus1QesMultiplierMax(golden: GoldenRefs = loadGolden()): number | null {
  const stated = (golden.manifest_en_geometrie as unknown as {
    gestelde_eisen?: { qes_vermenigvuldiging_max?: unknown };
  }).gestelde_eisen;
  const v = stated?.qes_vermenigvuldiging_max;
  return typeof v === 'number' && Number.isFinite(v) && v > 1 ? v : null;
}

/**
 * V47 — the MAXIMUM DRIVE ON A DRIVER'S OWN RESONANCE the designer stated for
 * casus 1, dB.
 *
 * Same shape as the four requirements above and the same reason it is read
 * rather than written: a project number has one home. The DIFFERENCE is what
 * it arms — this one is a GATE. M-C has a gate id in `GATE_IDS`, so unlike the
 * LF budget and the Q_es ceiling a stated limit here CONDEMNS a delivered
 * network as well as bounding the search; and unlike the amplifier floor it
 * also decides, on the v2 route, which of two protection rules the full-band
 * safety gate applies (`protectionRule`).
 *
 * IT IS STATED FROM THE TWEETER AND ENFORCED ON EVERY HIGH-PASS-PROTECTED WAY,
 * which is a property of the gate and not of this helper. On casus 1 that is
 * the mid as well, and the manifest records both readings of HUIDIG for exactly
 * that reason: a requirement whose subject set is wider than the measurement it
 * was derived from has to say so.
 *
 * Null when the project states none — P4, no gate, and the seed comparison
 * stays in force because an empty field is not a judgement.
 */
export function casus1MaxDriveOnFsDb(golden: GoldenRefs = loadGolden()): number | null {
  const stated = (golden.manifest_en_geometrie as unknown as {
    gestelde_eisen?: { tweeter_drive_op_fs_max_dB?: unknown };
  }).gestelde_eisen;
  const v = stated?.tweeter_drive_op_fs_max_dB;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * V49 (M-C v2.0) — THE DRIVER CARDS the designer entered for casus 1, keyed by
 * driver id, read from `manifest_en_geometrie.driverkaart` and never written
 * here. Same shape and the same reason as every stated requirement above: a
 * datasheet number has one home. A driver with no card is simply absent, and
 * M-C v2.0 then says so for that driver (P4).
 */
export function casus1DriverCards(golden: GoldenRefs = loadGolden()): Record<string, DriverCard> {
  const block = (golden.manifest_en_geometrie as unknown as {
    driverkaart?: Record<string, unknown>;
  }).driverkaart;
  const out: Record<string, DriverCard> = {};
  if (!block) return out;
  const num = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;
  for (const [driver, raw] of Object.entries(block)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const c = raw as Record<string, unknown>;
    if (typeof c.X_max_mm !== 'number') continue;
    const card: DriverCard = {
      ...(num(c.X_max_mm) !== undefined ? { xMaxMm: num(c.X_max_mm) } : {}),
      ...(num(c.S_d_cm2) !== undefined ? { sdCm2: num(c.S_d_cm2) } : {}),
      ...(num(c.Bl_Tm) !== undefined ? { blTm: num(c.Bl_Tm) } : {}),
      ...(num(c.M_ms_g) !== undefined ? { mmsG: num(c.M_ms_g) } : {}),
      ...(num(c.parallel_aantal) !== undefined ? { parallelCount: num(c.parallel_aantal) } : {}),
      source: `${String(c.model ?? driver)} datasheet (manifest_en_geometrie.driverkaart)`,
    };
    out[driver] = card;
  }
  return out;
}

/**
 * V49 — the amplifier's stated PEAK: the brief power and the load it is
 * specified into (`gestelde_eisen.versterker_piekvermogen_W`,
 * `versterker_nominale_last_ohm`). Null when either is unstated — no peak
 * voltage, no excursion requirement (P4).
 */
export function casus1AmplifierPeak(
  golden: GoldenRefs = loadGolden(),
): { peakPowerW: number; nominalLoadOhm: number } | null {
  const stated = (golden.manifest_en_geometrie as unknown as {
    gestelde_eisen?: { versterker_piekvermogen_W?: unknown; versterker_nominale_last_ohm?: unknown };
  }).gestelde_eisen;
  const p = stated?.versterker_piekvermogen_W;
  const r = stated?.versterker_nominale_last_ohm;
  if (typeof p !== 'number' || !(p > 0) || typeof r !== 'number' || !(r > 0)) return null;
  return { peakPowerW: p, nominalLoadOhm: r };
}

/** V49 — the stated fraction of X_max a design may use (`gestelde_eisen.xmax_marge`). */
export function casus1XmaxMargin(golden: GoldenRefs = loadGolden()): number | null {
  const stated = (golden.manifest_en_geometrie as unknown as {
    gestelde_eisen?: { xmax_marge?: unknown };
  }).gestelde_eisen;
  const v = stated?.xmax_marge;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 1 ? v : null;
}

/**
 * V49 — the documented drive voltage and mic distance of the on-axis far
 * field, per driver, for the ACOUSTIC route. On casus 1 the voltage is NOT
 * documented (`driverkaart.ff_meetspanning_V` is null, and the block says
 * why), so this returns an empty map and route 2 is off with that reason.
 * Deliberately no assumed 2.83 V: a route that ran on an assumed voltage would
 * publish a displacement nobody measured.
 */
export function casus1ResponseDrive(
  golden: GoldenRefs = loadGolden(),
): Record<string, { driveVoltageV: number; micDistanceMm: number; source: string }> {
  const block = (golden.manifest_en_geometrie as unknown as {
    driverkaart?: { ff_meetspanning_V?: unknown; ff_mic_afstand_mm?: unknown };
  }).driverkaart;
  const v = block?.ff_meetspanning_V;
  const r = block?.ff_mic_afstand_mm;
  if (typeof v !== 'number' || !(v > 0) || typeof r !== 'number' || !(r > 0)) return {};
  const out: Record<string, { driveVoltageV: number; micDistanceMm: number; source: string }> = {};
  for (const e of casus1Manifest(golden).entries) {
    if (e.kind === 'FF' && (e.angleDeg ?? 0) === 0) {
      out[e.driver] = { driveVoltageV: v, micDistanceMm: r, source: 'manifest_en_geometrie.driverkaart' };
    }
  }
  return out;
}

/**
 * V49 — everything the REPORT needs to derive the excursion ceiling, as one
 * spreadable block: the cards, the amplifier peak, the margin and (when
 * documented) the response drive. Spread into a `ReportSettings` at every
 * casus-1 measuring site — the frozen-netlist gates, the recorder, the
 * generator, the corpus bank, the live reproductions — so that they cannot
 * disagree about whether the ceiling was armed. An unstated half leaves its
 * KEY absent, which is what P4 asks for.
 */
export function casus1ExcursionSettings(golden: GoldenRefs = loadGolden()): {
  driverCardByDriver?: Record<string, DriverCard>;
  amplifierPeakPowerW?: number;
  amplifierNominalLoadOhm?: number;
  xmaxMarginFraction?: number;
  responseDriveByDriver?: Record<string, { driveVoltageV: number; micDistanceMm: number; source: string }>;
} {
  const cards = casus1DriverCards(golden);
  const amp = casus1AmplifierPeak(golden);
  const margin = casus1XmaxMargin(golden);
  const drive = casus1ResponseDrive(golden);
  return {
    ...(Object.keys(cards).length > 0 ? { driverCardByDriver: cards } : {}),
    ...(amp ? { amplifierPeakPowerW: amp.peakPowerW, amplifierNominalLoadOhm: amp.nominalLoadOhm } : {}),
    ...(margin !== null ? { xmaxMarginFraction: margin } : {}),
    ...(Object.keys(drive).length > 0 ? { responseDriveByDriver: drive } : {}),
  };
}

/**
 * V50 — the stated M-C figure PER WAY (`gestelde_eisen.drive_op_fs_max_dB_per_weg`),
 * keyed by driver id. A way listed with `null` is deliberately WITHOUT a stated
 * figure — the excursion-derived ceiling alone judges it — and contributes no
 * entry; a way not listed at all likewise. Empty map = nothing stated per way.
 */
export function casus1MaxDriveOnFsDbByDriver(golden: GoldenRefs = loadGolden()): Record<string, number> {
  const e = (golden.manifest_en_geometrie as unknown as {
    gestelde_eisen?: { drive_op_fs_max_dB_per_weg?: Record<string, unknown> };
  }).gestelde_eisen;
  const out: Record<string, number> = {};
  for (const [driver, v] of Object.entries(e?.drive_op_fs_max_dB_per_weg ?? {})) {
    if (typeof v === 'number' && Number.isFinite(v)) out[driver] = v;
  }
  return out;
}

/**
 * V50 — the CONTINUOUS amplifier power (`gestelde_eisen.versterker_continu_vermogen_W`):
 * what M-A prints its watts at and what M-A/part judges them at. Null = not
 * stated, and then there are no watts at all (F0). It stood as a literal 100
 * in every test and script until V50; this is its one home (P6).
 */
export function casus1ContinuousPowerW(golden: GoldenRefs = loadGolden()): number | null {
  const e = (golden.manifest_en_geometrie as unknown as {
    gestelde_eisen?: { versterker_continu_vermogen_W?: unknown };
  }).gestelde_eisen;
  const v = e?.versterker_continu_vermogen_W;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * V50 — the BUILDABILITY inputs the project states: the resistor class (W)
 * with its margin (fraction) and the coil class (A). Each absent when the
 * manifest states none — casus 1 states no coil class, with the finding in
 * the manifest (the C-Coil documentation publishes no saturation current).
 * Read into `ReportSettings`/`GateSettings` by spreading.
 */
export function casus1BuildabilitySettings(golden: GoldenRefs = loadGolden()): {
  resistorClassW?: number;
  resistorPowerMargin?: number;
  coilClassA?: number;
  /** V51 — the thermal design power M-A/part judges at, when stated. */
  resistorThermalPowerW?: number;
} {
  const e = (golden.manifest_en_geometrie as unknown as {
    gestelde_eisen?: {
      weerstandsklasse_W?: unknown;
      weerstandsmarge?: unknown;
      spoelklasse_A?: unknown;
      thermisch_ontwerpvermogen_W?: unknown;
    };
  }).gestelde_eisen;
  const num = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;
  const cls = num(e?.weerstandsklasse_W);
  const margin = num(e?.weerstandsmarge);
  const coil = num(e?.spoelklasse_A);
  const thermal = num(e?.thermisch_ontwerpvermogen_W);
  return {
    ...(cls !== undefined ? { resistorClassW: cls } : {}),
    ...(margin !== undefined ? { resistorPowerMargin: margin } : {}),
    ...(coil !== undefined ? { coilClassA: coil } : {}),
    ...(thermal !== undefined ? { resistorThermalPowerW: thermal } : {}),
  };
}

/**
 * V51 — the THERMAL DESIGN POWER (`gestelde_eisen.thermisch_ontwerpvermogen_W`):
 * the average listening power the designer states, at which M-A/part judges
 * the watts per resistor. Distinct from the amplifier's continuous rating,
 * which stays the power the watt column prints at. Null = not stated, and the
 * gate then judges at the rating (V50).
 */
export function casus1ThermalDesignPowerW(golden: GoldenRefs = loadGolden()): number | null {
  const e = (golden.manifest_en_geometrie as unknown as {
    gestelde_eisen?: { thermisch_ontwerpvermogen_W?: unknown };
  }).gestelde_eisen;
  const v = e?.thermisch_ontwerpvermogen_W;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * V51 — whether the project FORBIDS level work on its lowest way
 * (`gestelde_eisen.geen_niveauwerk_op_laagste_weg`). True = stated; false =
 * not stated, which is P4's absent and never a stated "allowed".
 */
export function casus1LowestWayLevelWorkForbidden(golden: GoldenRefs = loadGolden()): boolean {
  const e = (golden.manifest_en_geometrie as unknown as {
    gestelde_eisen?: { geen_niveauwerk_op_laagste_weg?: unknown };
  }).gestelde_eisen;
  return e?.geen_niveauwerk_op_laagste_weg === true;
}

/**
 * V51b — the stated MAXIMUM total series resistance on the lowest way
 * (`gestelde_eisen.max_serie_R_laagste_weg_ohm`, Ω, discrete R plus coil DCR).
 * Null = not stated. A stated maximum narrows V51's prohibition to "no pad,
 * series resistance up to this" — see `casus1LowestWayLevelWorkRule`.
 */
export function casus1LowestWaySeriesRMaxOhm(golden: GoldenRefs = loadGolden()): number | null {
  const e = (golden.manifest_en_geometrie as unknown as {
    gestelde_eisen?: { max_serie_R_laagste_weg_ohm?: unknown };
  }).gestelde_eisen;
  const v = e?.max_serie_R_laagste_weg_ohm;
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
}

/**
 * V51b — THE RULE casus 1 states about level work on its lowest way, in the
 * one vocabulary every reader shares (`levelWork.ts`): a stated maximum wins
 * (it is the narrower statement), else the prohibition, else undefined =
 * nothing stated (P4). Read from the manifest, never written anywhere else.
 */
export function casus1LowestWayLevelWorkRule(golden: GoldenRefs = loadGolden()): LowestWayLevelWork | undefined {
  const max = casus1LowestWaySeriesRMaxOhm(golden);
  if (max !== null) return { kind: 'series-r-max', maxOhm: max };
  return casus1LowestWayLevelWorkForbidden(golden) ? 'none' : undefined;
}

/**
 * V51 — the WIRING per way (`driverkaart.<driver>.schakeling`): how many
 * identical drivers, as measured and as wanted. A way without the block
 * contributes nothing (a single driver, wiring irrelevant).
 */
export function casus1WiringByDriver(golden: GoldenRefs = loadGolden()): Record<string, WayWiring> {
  const block = (golden.manifest_en_geometrie as unknown as {
    driverkaart?: Record<string, { schakeling?: { aantal?: unknown; gemeten?: unknown; gewenst?: unknown } } | unknown>;
  }).driverkaart;
  const out: Record<string, WayWiring> = {};
  const kind = (v: unknown): WiringKind | null => (v === 'parallel' || v === 'series' ? v : null);
  for (const [driver, card] of Object.entries(block ?? {})) {
    const s = (card as { schakeling?: { aantal?: unknown; gemeten?: unknown; gewenst?: unknown } } | null)?.schakeling;
    if (!s) continue;
    const n = typeof s.aantal === 'number' && s.aantal >= 1 ? Math.floor(s.aantal) : null;
    const measured = kind(s.gemeten);
    const desired = kind(s.gewenst);
    if (n === null || measured === null || desired === null) continue;
    out[driver] = { count: n, measured, desired, source: 'manifest_en_geometrie.driverkaart.schakeling' };
  }
  return out;
}

/**
 * V50 — whether the buildability requirement is ARMED ON THE SEARCH of the
 * casus-1 v2 route (`gestelde_eisen.bouwbaarheid_op_de_zoektocht.gewapend`).
 *
 * A stated DECISION, not a default: the requirement is stated and the report
 * judges every frozen netlist with it regardless; whether the generator arms
 * it as a gate on the search — which on this casus empties the field, see the
 * manifest — is the designer's call, recorded there with its reason.
 */
export function casus1BuildabilityOnSearch(golden: GoldenRefs = loadGolden()): boolean {
  const e = (golden.manifest_en_geometrie as unknown as {
    gestelde_eisen?: { bouwbaarheid_op_de_zoektocht?: { gewapend?: unknown } };
  }).gestelde_eisen;
  return e?.bouwbaarheid_op_de_zoektocht?.gewapend === true;
}

/**
 * One of the frozen candidate netlists, with the measured driver impedances.
 *
 * The key is any entry of `manifest_en_geometrie.netlists`, which since F4d
 * holds the three v1 baselines AND the nine `KAND-V2-*` files the candidate
 * generator produced. Widened from a union of three literals rather than
 * extended with nine more: the reference file is the list, and a second list in
 * a type is a second thing to keep in step.
 */
export function casus1Filter(
  candidate: string,
  manifest: Manifest,
  files: readonly MeasurementFile[],
  golden: GoldenRefs = loadGolden(),
): FilterInput {
  const name = golden.manifest_en_geometrie.netlists[candidate];
  if (!name) {
    throw new Error(
      `casus 1 has no netlist called ${candidate}; the file lists ` +
        `${Object.keys(golden.manifest_en_geometrie.netlists).join(', ')}`,
    );
  }
  const parsed = deserializeFilter(readFileSync(join(CASUS1_DIR, name), 'utf-8'));
  return casus1FilterFromParts(name, parsed.parts, manifest, files);
}

/**
 * The same thing for a netlist that is NOT on disk — a network a run has just
 * delivered, measured before anyone decides whether to freeze it.
 *
 * Extracted at V30 rather than written a second time. The before/after
 * measurement that entry rests on has to report SPL window, RMS flatness and
 * phase tracking for candidates that a gate REFUSED, and a refused candidate
 * has no file: the whole point of the comparison is what the refusal cost. The
 * only difference from `casus1Filter` is where the parts come from; everything
 * downstream — the impedance assembly, the report — is shared, so a metric
 * measured on a delivered network and the same metric measured on the frozen
 * file cannot drift apart.
 */
export function casus1FilterFromParts(
  name: string,
  parts: readonly VxpCrossover['parts'][number][],
  manifest: Manifest,
  files: readonly MeasurementFile[],
): FilterInput {
  const { netlist } = crossoverToNetlist({ name, parts: [...parts] } as VxpCrossover);
  const driverZ: FilterInput['driverZ'] = {};
  for (const e of manifest.entries) {
    if (e.kind !== 'Z') continue;
    const f = files.find((x) => x.entry.file === e.file);
    if (f?.impedance) {
      driverZ[e.driver] = {
        freq: f.impedance.freq,
        magnitude: f.impedance.magnitude,
        phaseDeg: f.impedance.phaseDeg,
      };
    }
  }
  return { name, netlist, driverZ };
}
