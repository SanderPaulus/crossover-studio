/**
 * H-4 — DE MEETBANK VAN DE POLARITEITSARMEN: één veldbouwer, drie casussen.
 *
 * WAAROM EEN EIGEN MODULE. H-4 heeft twee lezers die exact hetzelfde veld
 * moeten beschrijven — de STAP-1-tabel (wat de ontwerpstap koos, en wat de
 * andere arm op diezelfde objectieffunctie waard was) en de ARM-RUN (wat de
 * andere arm waard is als je hem werkelijk bouwt) — en de V38-bank-les zegt
 * waarom dat één bouwer moet zijn: twee lezers die elk hun eigen veld
 * samenstellen leveren twee tabellen die niet mogen worden afgetrokken, en de
 * aftrekking IS de vraag.
 *
 * WAT ER PRECIES ÉÉN FACTOR ANDERS IS. Alles hieronder is de run zoals de
 * generator van de casus hem draait — dezelfde meetset, dezelfde poorten,
 * dezelfde budgetten, dezelfde seed, hetzelfde raster, dezelfde vensterinvoer,
 * dezelfde spoelfamilies — met ÉÉN toevoeging: het veld wordt met
 * `polarityArms` gebouwd, zodat naast elke kandidaat zijn gespiegelde arm
 * staat. Niets wordt geregenereerd en geen enkel corpus wordt aangeraakt.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CASUS1_BUILDABILITY,
  CASUS1_COIL_DCR_SETTINGS,
  CASUS1_CONTINUOUS_POWER_W,
  CASUS1_EXCURSION,
  CASUS1_LEVEL_WORK_SETTINGS,
  CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER,
  CASUS1_TARGET_CURVE,
  CASUS1_V2_BAND_HZ,
  CASUS1_V2_BUDGETS,
  CASUS1_V2_GATES,
  CASUS1_V2_SEED,
  CASUS1_V2_SETTINGS,
  CASUS1_WINDOW_SETTINGS,
  casus1ChainInput,
  casus1Field,
  casus1V2Declaration,
  casus1V2Facts,
} from '../src/lib/engine2/casus1V2.fixture.ts';
import type { Casus1MeasurementSet } from '../src/lib/engine2/casus1.fixture.ts';
import {
  CASUS1_WOOFER_DC_OHM,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
} from '../src/lib/engine2/casus1.fixture.ts';
import {
  CASUS1B_CONTINUOUS_POWER_W,
  CASUS1B_TARGET_CURVE,
  CASUS1B_V2_BAND_HZ,
  CASUS1B_V2_BUDGETS,
  CASUS1B_V2_GATES,
  CASUS1B_V2_SEED,
  casus1bChainInput,
  casus1bChainInputFor,
  casus1bField,
  casus1bFiles,
  casus1bManifest,
  casus1bReport,
  casus1bSeed,
  casus1bV2Declaration,
  casus1bV2Facts,
} from '../src/lib/engine2/casus1b.fixture.ts';
import {
  CASUS1H_ACTIVE,
  CASUS1H_CONTINUOUS_POWER_W,
  CASUS1H_TARGET_CURVE,
  CASUS1H_V2_BAND_HZ,
  CASUS1H_V2_BUDGETS,
  CASUS1H_V2_GATES,
  CASUS1H_V2_SEED,
  casus1hActiveAt,
  casus1hChainInput,
  casus1hChainInputFor,
  casus1hField,
  casus1hFiles,
  casus1hManifest,
  casus1hSeed,
  casus1hV2Declaration,
  casus1hV2Facts,
} from '../src/lib/engine2/casus1h.fixture.ts';
import { buildReport, type EngineV2Report } from '../src/lib/engine2/report.ts';
import { ctcKey } from '../src/lib/engine2/metrics/types.ts';
import {
  polarityMarginReader,
  statedPolarityForThreeWay,
  type PolarityArmPolicy,
  type PolarityBranch,
  type PolarityMargin,
} from '../src/lib/engine2/predesign/polarityArms.ts';
import type { CandidateCrossing, GeneratedCandidate } from '../src/lib/engine2/predesign/candidates.ts';
import type {
  V2Chain3Payload,
  V2ChainOnePayload,
} from '../src/lib/engine2/optimizer/worker.ts';
import { statedMarkForWorker } from '../src/lib/engine2/optimizer/scanRequest.ts';
import type { Chain3Input } from '../src/lib/threeWayChain.ts';
import type { GriddedResponse } from '../src/lib/dsp.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * DE POLICY WAARMEE ELKE ARM-TABEL GEBOUWD WORDT: BEIDE ARMEN, ALTIJD.
 *
 * De meting vraagt wat de gespiegelde arm WAARD is, en dat is een vraag over
 * élke kandidaat — niet over de kandidaten waar de marge hem toevallig zou
 * zaaien. Dit is dus de `'both'`-policy van het VOLLE veld, expliciet gesteld
 * in plaats van uit een modus te vallen, met de marge-lezer erbij zodat de
 * tabel kan afdrukken wat de verkenning ervan gevonden zou hebben.
 */
export function bothArms(marginFor: (c: CandidateCrossing) => PolarityMargin): PolarityArmPolicy {
  return {
    seed: 'both',
    marginFor,
    statedAlways: true,
    why: 'H-4 measurement: both arms of every handover, whatever the margin said.',
  };
}

/** Eén weg zoals de som hem ziet — de vorm die `polarityMarginReader` vraagt. */
const branchOf = (
  byId: Record<string, GriddedResponse | undefined>,
): ((id: string) => PolarityBranch | null) => {
  return (id) => {
    const r = byId[id];
    return r ? { response: r, adjust: {} } : null;
  };
};

/* ================================================================== *
 * CASUS 1 — de drieweg
 * ================================================================== */

/**
 * DE MEETSET IS EEN ARGUMENT, en de default is de STANDAARD (`'m3'`).
 *
 * De M-4-reden, woordelijk: de twee live ketenruns zijn sinds M-3 op
 * `'koan677'` gepind omdat het M-2b-CORPUS daarop is opgewekt; H-4 wekt niets
 * opnieuw op maar draait NIEUWE kandidaten, en een nieuwe kandidaat hoort op de
 * huidige meetbasis te lopen. De andere set is bereikbaar omdat de keuze van de
 * ontwerpstap ERVAN AFHANGT — gemeten, niet aangenomen: op `'koan677'` wijkt de
 * 156,7 Hz-kandidaat van textbook af en op `'m3'` niet.
 */
export function casus1Bench(set: Casus1MeasurementSet = 'm3') {
  const golden = loadGolden();
  const manifest = casus1Manifest(golden, set);
  const files = casus1Files(manifest);
  const report = buildReport({
    manifest,
    files,
    filter: casus1Filter('HUIDIG', manifest, files, golden),
    geometry: casus1Geometry(golden),
    settings: {
      ...(CASUS1_CONTINUOUS_POWER_W !== null ? { amplifierPowerW: CASUS1_CONTINUOUS_POWER_W } : {}),
      ...(Object.keys(CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER).length > 0
        ? { maxDriveOnFsDbByDriver: { ...CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER } }
        : {}),
      ...CASUS1_WINDOW_SETTINGS,
      ...CASUS1_BUILDABILITY,
      ...CASUS1_LEVEL_WORK_SETTINGS,
      orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
      reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
      targetCurve: CASUS1_TARGET_CURVE,
      ...CASUS1_EXCURSION,
      ...CASUS1_COIL_DCR_SETTINGS,
    },
  });
  const gridded = casus1ChainInput(manifest, files, golden);
  const facts = casus1V2Facts(report, manifest, files);
  const marginFor = polarityMarginReader(
    branchOf({ woofer: gridded.w, mid: gridded.m, tweeter: gridded.t }),
  );
  const bare = casus1Field(report);
  const armed = casus1Field(report, undefined, bothArms(marginFor));
  return { report, gridded, facts, marginFor, bare, armed, manifest, files, golden };
}

export function casus1PayloadFor(
  c: GeneratedCandidate,
  b: ReturnType<typeof casus1Bench>,
): V2Chain3Payload {
  const input: Chain3Input = {
    grid: [...b.gridded.grid],
    w: b.gridded.w,
    m: b.gridded.m,
    t: b.gridded.t,
    driverZ: b.gridded.driverZ,
    tAdjust: { offsetMm: 0, trimDb: 0, inverted: false },
    midAdjust: {},
    xoLow: c.crossings[0].hz,
    xoHigh: c.crossings[1].hz,
    xoLowRange: c.crossings[0].cageHz,
    xoHighRange: c.crossings[1].cageHz,
    label: c.label,
    settings: {
      ...CASUS1_V2_SETTINGS,
      safety: b.gridded.safety,
      structureLow: { kind: c.crossings[0].alignment.kind, order: c.crossings[0].alignment.order },
      structureHigh: { kind: c.crossings[1].alignment.kind, order: c.crossings[1].alignment.order },
      /* H-4 — de ENE factor die deze bank toevoegt. */
      ...(c.polarity ? { statedPolarity: statedPolarityForThreeWay(c.polarity) } : {}),
      xoFloorPairs: c.crossings.map((x) => x.windowHz[0]),
    } as unknown as Chain3Input['settings'],
  };
  return {
    input,
    v2: {
      ...b.facts,
      gates: { ...CASUS1_V2_GATES },
      budgets: { ...CASUS1_V2_BUDGETS },
      determinism: { seed: CASUS1_V2_SEED },
      targetCurve: CASUS1_TARGET_CURVE,
      judgeBandHz: CASUS1_V2_BAND_HZ,
      ...(CASUS1_CONTINUOUS_POWER_W !== null ? { amplifierPowerW: CASUS1_CONTINUOUS_POWER_W } : {}),
    },
    candidate: {
      ...casus1V2Declaration(c, b.gridded.safety),
      ...(c.stated ? { stated: statedMarkForWorker(c.stated, (id) => id) } : {}),
    },
  };
}

/* ================================================================== *
 * CASUS 1b — de tweeweg
 * ================================================================== */

export function casus1bBench() {
  const manifest = casus1bManifest();
  const files = casus1bFiles(manifest);
  const report = casus1bReport(null, manifest, files);
  const gridded = casus1bChainInput(manifest, files);
  const facts = casus1bV2Facts(report, manifest, files);
  const ids = report.driversLowToHigh;
  const marginFor = polarityMarginReader(
    branchOf({ [ids[0]]: gridded.w, [ids[ids.length - 1]]: gridded.t }),
  );
  return {
    report,
    gridded,
    facts,
    marginFor,
    bare: casus1bField(report),
    armed: casus1bField(report, bothArms(marginFor)),
  };
}

export function casus1bPayloadFor(
  c: GeneratedCandidate,
  b: ReturnType<typeof casus1bBench>,
): V2ChainOnePayload {
  return {
    input: casus1bChainInputFor(c, b.gridded, casus1bSeed()),
    label: c.label,
    v2: {
      ...b.facts,
      gates: { ...CASUS1B_V2_GATES },
      budgets: { ...CASUS1B_V2_BUDGETS },
      determinism: { seed: CASUS1B_V2_SEED },
      targetCurve: CASUS1B_TARGET_CURVE,
      judgeBandHz: CASUS1B_V2_BAND_HZ,
      ...(CASUS1B_CONTINUOUS_POWER_W !== null ? { amplifierPowerW: CASUS1B_CONTINUOUS_POWER_W } : {}),
    },
    candidate: casus1bV2Declaration(c, b.gridded.safety),
  };
}

/* ================================================================== *
 * CASUS 1h — de hybride (één passieve overname)
 * ================================================================== */

/** De actieve overname waarop de armen gemeten worden: de eerste gestelde. */
export const H4_CASUS1H_ACTIVE_HZ = CASUS1H_ACTIVE.positionsHz[0];

export function casus1hBench() {
  const manifest = casus1hManifest();
  const files = casus1hFiles(manifest);
  const active = casus1hActiveAt(H4_CASUS1H_ACTIVE_HZ, manifest, files);
  const gridded = casus1hChainInput(manifest, files);
  const facts = casus1hV2Facts(active.report, manifest, files);
  const report: EngineV2Report = active.report;
  const ids = report.driversLowToHigh;
  /* De ACTIEVE weg staat met opzet NIET in deze kaart: hij komt in geen enkele
   * overname van dit veld voor (H-2 laat hem vallen), en een lezer die hem toch
   * zou kennen zou suggereren dat er een arm voor bestond. */
  const marginFor = polarityMarginReader(
    branchOf({ [ids[1]]: gridded.w, [ids[2]]: gridded.t }),
  );
  return {
    active,
    report,
    gridded,
    facts,
    marginFor,
    bare: casus1hField(report),
    armed: casus1hField(report, bothArms(marginFor)),
  };
}

export function casus1hPayloadFor(
  c: GeneratedCandidate,
  b: ReturnType<typeof casus1hBench>,
): V2ChainOnePayload {
  return {
    input: casus1hChainInputFor(c, b.gridded, casus1hSeed(), b.active),
    label: `H${H4_CASUS1H_ACTIVE_HZ} · ${c.label}`,
    v2: {
      ...b.facts,
      gates: { ...CASUS1H_V2_GATES },
      budgets: { ...CASUS1H_V2_BUDGETS },
      determinism: { seed: CASUS1H_V2_SEED },
      targetCurve: CASUS1H_TARGET_CURVE,
      judgeBandHz: CASUS1H_V2_BAND_HZ,
      ...(CASUS1H_CONTINUOUS_POWER_W !== null ? { amplifierPowerW: CASUS1H_CONTINUOUS_POWER_W } : {}),
    },
    candidate: casus1hV2Declaration(c, b.active, b.gridded.safety),
  };
}

/* ================================================================== *
 * Wat het LEVENDE corpus aan polariteit draagt — een feit over bestanden
 * ================================================================== */

/** Welke drivers een opgeslagen netlist omgepoold draagt (E-3 vouwt ze erin). */
export function invertedDriversOf(path: string): string[] {
  const raw = JSON.parse(readFileSync(join(HERE, '..', path), 'utf8')) as {
    parts?: { type?: string; model?: string; inverted?: boolean }[];
  };
  return (raw.parts ?? [])
    .filter((p) => p.type === 'Driver' && p.inverted === true)
    .map((p) => p.model ?? '(unnamed)')
    .sort();
}
