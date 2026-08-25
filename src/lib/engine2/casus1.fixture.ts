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
import type { Geometry } from './metrics/types.ts';
import { ctcKey } from './metrics/types.ts';

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
  };
  toleranties_toelichting: Record<string, string>;
  /** Why five references were revised at F1 — see V13/V14/V15 in the casebook. */
  herziening_F1_toelichting: string[];
  afgeleide_parameters: Record<string, Record<string, unknown>>;
  verankerde_gaps_dB: Record<string, unknown>;
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
  grens_inversies: Record<string, number>;
  vensterinteractie: Record<string, unknown>;
  manifest_en_geometrie: {
    bestanden: Record<string, { drv: string; typ: string; hoek?: number }>;
    ff_headers: Record<string, number>;
    geometrie: {
      D_inch: Record<string, number>;
      z_offset_mm: Record<string, number>;
      ctc_mm: Record<string, number>;
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
export function casus1Manifest(golden: GoldenRefs = loadGolden()): Manifest {
  const g = golden.manifest_en_geometrie;
  const entries: ManifestEntry[] = Object.entries(g.bestanden).map(([file, tag]) => {
    const kind = tag.typ as MeasurementKind;
    const entry: ManifestEntry = { file, driver: tag.drv, kind };
    if (tag.hoek !== undefined) entry.angleDeg = tag.hoek;
    if (kind === 'NF') {
      const d = g.geometrie.D_inch[tag.drv];
      if (d !== undefined) entry.diameterInch = d;
    }
    return entry;
  });
  return { sessionId: 'koan2951-2026-08-22', entries };
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
    // The two woofers are one way, measured as one source. Their own spacing is
    // still a real source separation, so it is given as an array spacing.
    arraySpacingMm: { woofer: g.ctc_mm['woofer_woofer'] },
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

/** One of the three candidate netlists, with the measured driver impedances. */
export function casus1Filter(
  candidate: 'HUIDIG' | 'KAND_A' | 'KAND_B',
  manifest: Manifest,
  files: readonly MeasurementFile[],
  golden: GoldenRefs = loadGolden(),
): FilterInput {
  const name = golden.manifest_en_geometrie.netlists[candidate];
  const parsed = deserializeFilter(readFileSync(join(CASUS1_DIR, name), 'utf-8'));
  const { netlist } = crossoverToNetlist({ name: parsed.name, parts: parsed.parts } as VxpCrossover);
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
