/**
 * M-1-DIAGNOSE — DE KETENRUNS: het geweigerde netwerk gevangen VÓÓR de V31-wissing,
 * en één kandidaat onder de V51b-instellingen met M-1's instellingen één voor
 * één teruggezet.
 *
 * `M1_JOBS=<n> npx vite-node scripts/measure-m1-diagnose-arms.ts` — ELF KETENRUNS
 * op casus 1 (elk 15–45 min), parallel over de kernen; `M1_ARM=<naam>` draait één
 * arm, wat het script met zichzelf doet. Schrijft per arm één JSON in
 * `test-fixtures/casus1_m1_diagnose/` en drukt een samenvattingstabel af.
 * `scripts/measure-m1-diagnose.ts` (seconden) leest die bestanden en doet de
 * analyse: netlist naast netlist, |Z| per tak, waar het minimum zit en welk
 * element het daar houdt.
 *
 * TWEE VRAGEN, ELF ARMEN (acht enkelvoudige en drie paren).
 *
 * (1) De M-1-tegenhangers van drie V51b-kandidaten die leverden — 485,6·2304,
 *     429,1·1994,6 en 549,7·2304, alle LR4·LR4 — precies zoals de generator ze
 *     draaide (dezelfde payload, dezelfde seed). Wat de generator NIET bewaart is
 *     het geweigerde netwerk: `runCandidate` wist `rejectedParts` vóórdat het
 *     resultaat de worker verlaat (V31), en dat is een goed besluit voor een
 *     shortlist en een muur voor een diagnose (`measure-v47-rejections.ts` en
 *     `measure-v48-ceiling-tracking.ts` liepen er allebei tegenaan). Dit script
 *     gaat er niet doorheen maar eromheen: het legt een OBSERVATOR op de
 *     keten-export `runThreeWayChain` — dezelfde functie, hetzelfde resultaat,
 *     alleen een kopie van het ketenresultaat (mét `net.rejectedParts`) en van
 *     het zaad (het argument van `hooks.tuneOptionsFor`) voordat de worker er
 *     zijn wissing op doet. Geen engine-wijziging: de module-namespace van
 *     vite-node is configureerbaar, en het script controleert dat de observator
 *     werkelijk gevuurd heeft in plaats van dat aan te nemen.
 *
 * (2) DE V51b-KANDIDAAT 429,1·1994,6 opnieuw, met M-1's instellingen één voor één
 *     teruggezet — vijf runs, één kandidaat, één seed:
 *       `v51b`          gepoorte set · plateau −2,5 dB · series-r-max 1,0 Ω · band 397–19500 op 200–20k/96
 *       `v51b+merged`   idem, maar de GEMERGEDE meetset
 *       `v51b+plateau0` idem, maar het plateau op 0 dB (= vlak; de zoektocht meet dan tegen horizontaal)
 *       `v51b+none`     idem, maar `lowestWayLevelWork: 'none'` (geen serie-R op de woofer)
 *       `v51b+band`     idem, maar de M-1-oordeelband (52–19500) op het M-1-raster (20,5–20k/143)
 *     Eén factor per arm; de kandidaat (positie, kooi, orde) is in alle vijf
 *     dezelfde, uit het M-1-veld. LET OP bij `v51b+band`: op de GEPOORTE set is
 *     de woofer onder 397 Hz niet geldig, dus die arm oordeelt daar over
 *     gepoorte data — het is de instelling geïsoleerd, niet een ontwerp.
 *
 * WAT V51b WAS, staat hier als benoemde constanten met hun bron: de V51b-herkomst
 * (`test-fixtures/casus1_v2_herkomst.json` op commit ca4b4fe) en het blok
 * `manifest_en_geometrie.v51b_corpus.reden`. Het zijn parameters van een
 * gedateerde run en geen projectgetallen: de fixture leidt de M-1-waarden af,
 * en dit script zet de V51b-waarden ernaast om ze te kunnen vergelijken.
 *
 * Dit script stelt niets en wijzigt niets aan de engine. Het is het
 * bewijsmateriaal onder casusboek M-1-diagnose.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import * as chainModule from '../src/lib/threeWayChain.ts';
import type { Chain3Input, Chain3Result, ChainEngineHooks } from '../src/lib/threeWayChain.ts';
import { logspace } from '../src/lib/dsp.ts';
import type { VxpPart } from '../src/lib/parsers/vxp.ts';
import type { TargetCurve } from '../src/lib/engine2/requirements/targetCurve.ts';
import type { LowestWayLevelWork } from '../src/lib/levelWork.ts';
import { buildReport, type EngineV2Report } from '../src/lib/engine2/report.ts';
import { ctcKey } from '../src/lib/engine2/metrics/types.ts';
import { declareCandidateChoices } from '../src/lib/engine2/optimizer/candidateDeclaration.ts';
import { declareCandidateChainChoices } from '../src/lib/engine2/optimizer/candidateDeclaration.ts';
import type { GeneratedCandidate } from '../src/lib/engine2/predesign/candidates.ts';
import { handleV2Request, type V2Chain3Payload, type V2Response } from '../src/lib/engine2/optimizer/worker.ts';
import type { GateVerdict } from '../src/lib/engine2/optimizer/gates.ts';
import {
  casus1CoilDcrFits,
  casus1CoilFamilyByDriver,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  casus1TargetCurveAt,
  CASUS1_WOOFER_DC_OHM,
  loadGolden,
  type Casus1MeasurementSet,
} from '../src/lib/engine2/casus1.fixture.ts';
import {
  CASUS1_BUILDABILITY,
  CASUS1_CONTINUOUS_POWER_W,
  CASUS1_EXCURSION,
  CASUS1_LEVEL_WORK_SETTINGS,
  CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER,
  CASUS1_TARGET_CURVE,
  CASUS1_V2_BAND_HZ,
  CASUS1_V2_BUDGETS,
  CASUS1_V2_GATES,
  CASUS1_V2_GRID,
  CASUS1_V2_SEED,
  CASUS1_V2_SETTINGS,
  CASUS1_LOWEST_WAY_LEVEL_WORK,
  casus1ChainInput,
  casus1Field,
  casus1V2Facts,
} from '../src/lib/engine2/casus1V2.fixture.ts';

/* ------------------------------------------------------------------ *
 * Wat V51b was — gedateerde runparameters, met bron
 * ------------------------------------------------------------------ */
/** De oordeelband van de V51b-run (herkomst op ca4b4fe: `settings.band`). */
const V51B_BAND_HZ: [number, number] = [397, 19500];
/** Het ketenraster van de V51b-run (herkomst op ca4b4fe: `grid`): 96 punten over 200–20 000 Hz. */
const V51B_GRID: number[] = logspace(200, 20000, 96);
/** Het gestelde basplateau van V51b (`v51b_corpus.reden`: −2,5 dB). */
const V51B_PLATEAU_DB = 2.5;
/** Het gestelde serie-R-maximum op de laagste weg van V51b (`v51b_corpus.reden`: 1,0 Ω totaal). */
const V51B_SERIES_R_MAX_OHM = 1.0;
/** De meetset waarop V51b liep. */
const V51B_SET: Casus1MeasurementSet = 'gated';

/** De drie V51b-kruispunten die leverden, en hun dichtstbijzijnde M-1-posities (LR4·LR4). */
const COUNTERPARTS: { v51b: string; m1: string }[] = [
  { v51b: 'V51B_KAND_1 (466,5·2283,5)', m1: 'woofer→mid 485.6 LR4 · mid→tweeter 2304 LR4' },
  { v51b: 'V51B_KAND_6 (466,5·1981,2)', m1: 'woofer→mid 429.1 LR4 · mid→tweeter 1994.6 LR4' },
  { v51b: 'V51B_KAND_3 (548,5·2283,5)', m1: 'woofer→mid 549.7 LR4 · mid→tweeter 2304 LR4' },
];
/** De kandidaat van vraag 2. */
const ARM_CANDIDATE = 'woofer→mid 429.1 LR4 · mid→tweeter 1994.6 LR4';

interface ArmSpec {
  name: string;
  label: string;
  what: string;
  set: Casus1MeasurementSet;
  /** Plateau-diepte in dB; 0 = vlak. */
  plateauDb: number;
  levelWork: LowestWayLevelWork | undefined;
  /** 'm1' = de afgeleide M-1-band en het M-1-raster; 'v51b' = de gedateerde band en het precedent-raster. */
  band: 'm1' | 'v51b';
  /** A5e.3 — het DCR-model van de spoelen (de families uit `driverkaart.spoelfamilie`, het VOORSTEL expliciet gelezen). */
  coilDcr?: boolean;
}

const M1_PLATEAU_DB = 0;
const ARMS: ArmSpec[] = [
  ...COUNTERPARTS.map((c) => ({
    name: `m1-${c.m1.replace(/woofer→mid |mid→tweeter | LR4/g, '').replace(' · ', 'x')}`,
    label: c.m1,
    what: `M-1 als gedraaid (tegenhanger van ${c.v51b})`,
    set: 'merged' as const,
    plateauDb: M1_PLATEAU_DB,
    levelWork: CASUS1_LOWEST_WAY_LEVEL_WORK,
    band: 'm1' as const,
  })),
  {
    name: 'v51b',
    label: ARM_CANDIDATE,
    what: 'V51b-instellingen: gepoorte set · plateau −2,5 · series-r-max 1,0 · band 397–19500 op 200–20k/96',
    set: V51B_SET,
    plateauDb: V51B_PLATEAU_DB,
    levelWork: { kind: 'series-r-max', maxOhm: V51B_SERIES_R_MAX_OHM },
    band: 'v51b',
  },
  {
    name: 'v51b+merged',
    label: ARM_CANDIDATE,
    what: 'V51b, maar de GEMERGEDE meetset',
    set: 'merged',
    plateauDb: V51B_PLATEAU_DB,
    levelWork: { kind: 'series-r-max', maxOhm: V51B_SERIES_R_MAX_OHM },
    band: 'v51b',
  },
  {
    name: 'v51b+plateau0',
    label: ARM_CANDIDATE,
    what: 'V51b, maar het plateau op 0 dB (vlak: de zoektocht meet tegen horizontaal)',
    set: V51B_SET,
    plateauDb: M1_PLATEAU_DB,
    levelWork: { kind: 'series-r-max', maxOhm: V51B_SERIES_R_MAX_OHM },
    band: 'v51b',
  },
  {
    name: 'v51b+none',
    label: ARM_CANDIDATE,
    what: "V51b, maar lowestWayLevelWork 'none' (geen serie-R op de woofer)",
    set: V51B_SET,
    plateauDb: V51B_PLATEAU_DB,
    levelWork: 'none',
    band: 'v51b',
  },
  /* DE PAREN — toegevoegd nadat de vijf enkelvoudige armen gedraaid waren: geen
   * enkele terugzetting alléén reproduceerde de M-1-weigering in de mid-/
   * tweetertak ('none' weigerde in de WOOFERweg, 'band' verplaatste het minimum
   * naar de mid maar leverde op de vloer), dus de vraag werd welk PAAR het doet. */
  {
    name: 'v51b+none+band',
    label: ARM_CANDIDATE,
    what: "V51b, maar 'none' ÉN de M-1-band/het M-1-raster",
    set: V51B_SET,
    plateauDb: V51B_PLATEAU_DB,
    levelWork: 'none',
    band: 'm1',
  },
  {
    name: 'v51b+none+merged',
    label: ARM_CANDIDATE,
    what: "V51b, maar 'none' ÉN de gemergede meetset",
    set: 'merged',
    plateauDb: V51B_PLATEAU_DB,
    levelWork: 'none',
    band: 'v51b',
  },
  {
    name: 'v51b+merged+band',
    label: ARM_CANDIDATE,
    what: 'V51b, maar de gemergede meetset ÉN de M-1-band/het M-1-raster (= M-1 met plateau −2,5 en series-r-max 1,0)',
    set: 'merged',
    plateauDb: V51B_PLATEAU_DB,
    levelWork: { kind: 'series-r-max', maxOhm: V51B_SERIES_R_MAX_OHM },
    band: 'm1',
  },
  {
    name: 'v51b+band',
    label: ARM_CANDIDATE,
    what: 'V51b, maar de M-1-oordeelband (52–19500) op het M-1-raster (20,5–20k/143) — op GEPOORTE data onder 397 Hz',
    set: V51B_SET,
    plateauDb: V51B_PLATEAU_DB,
    levelWork: { kind: 'series-r-max', maxOhm: V51B_SERIES_R_MAX_OHM },
    band: 'm1',
  },
  /* A5e.3 — ÉÉN ARM VÓÓR REGENERATIE: M-1 als gedraaid (plateau 0, 'none',
   * gemergde set, M-1-band) plus het DCR-model op elke continue spoel (de
   * families van het A5e.3-voorstel, de fits van de v8-catalogus). Verwachting
   * uit de M-1-diagnose: de tweeter-ladderresonantie van 1,99 naar ~2,5 Ω en de
   * vloer bijna of helemaal gehaald zonder nieuw element. Dezelfde kandidaat en
   * seed als `m1-429.1x1994.6`, één factor verzet. */
  {
    name: 'm1+dcr',
    label: ARM_CANDIDATE,
    what: 'M-1 als gedraaid (plateau 0 · none · gemergde set · M-1-band) PLUS het DCR-model uit de catalogusfit (A5e.3)',
    set: 'merged',
    plateauDb: M1_PLATEAU_DB,
    levelWork: CASUS1_LOWEST_WAY_LEVEL_WORK,
    band: 'm1',
    coilDcr: true,
  },
];

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', 'test-fixtures', 'casus1_m1_diagnose');
const SELF = fileURLToPath(import.meta.url);
const ONLY = process.env.M1_ARM ?? null;
/** Hoeveel armen tegelijk: naar GEHEUGEN en niet naar kernen (V48-les: acht was de goede orde). */
const JOBS = Math.max(1, Number(process.env.M1_JOBS ?? Math.min(8, cpus().length)));

/* ------------------------------------------------------------------ *
 * Eén meetset → rapport, feiten, veld
 * ------------------------------------------------------------------ */
function setup(set: Casus1MeasurementSet, grid: readonly number[]) {
  const golden = loadGolden();
  const manifest = casus1Manifest(golden, set);
  const files = casus1Files(manifest);
  const geometry = casus1Geometry(golden);
  const report: EngineV2Report = buildReport({
    manifest,
    files,
    filter: casus1Filter('HUIDIG', manifest, files, golden),
    geometry,
    settings: {
      ...(CASUS1_CONTINUOUS_POWER_W !== null ? { amplifierPowerW: CASUS1_CONTINUOUS_POWER_W } : {}),
      ...(Object.keys(CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER).length > 0
        ? { maxDriveOnFsDbByDriver: { ...CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER } }
        : {}),
      ...CASUS1_BUILDABILITY,
      ...CASUS1_LEVEL_WORK_SETTINGS,
      orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
      reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
      targetCurve: CASUS1_TARGET_CURVE,
      ...CASUS1_EXCURSION,
    },
  });
  const facts = casus1V2Facts(report, manifest, files);
  const field = casus1Field(report);
  const gridded = casus1ChainInput(manifest, files, golden, grid);
  return { golden, manifest, files, report, facts, field, gridded };
}

/** De kandidaat uit het M-1-veld (gemergde set) — positie, kooi, orde. */
function m1Candidate(label: string): GeneratedCandidate {
  const { field } = setup('merged', CASUS1_V2_GRID);
  const c = field.field.candidates.find((x) => x.label === label);
  if (!c) throw new Error(`het M-1-veld kent geen kandidaat "${label}"`);
  return c;
}

/* ------------------------------------------------------------------ *
 * De payload van één arm — `payloadFor` van de generator, met de vier
 * instellingen als parameters in plaats van als module-constanten
 * ------------------------------------------------------------------ */
function payloadFor(arm: ArmSpec, c: GeneratedCandidate): V2Chain3Payload {
  const grid = arm.band === 'm1' ? CASUS1_V2_GRID : V51B_GRID;
  const band: [number, number] = arm.band === 'm1' ? CASUS1_V2_BAND_HZ : V51B_BAND_HZ;
  const targetCurve: TargetCurve = arm.plateauDb > 0 ? casus1TargetCurveAt(arm.plateauDb) : casus1TargetCurveAt(0);
  const { facts, field, gridded } = setup(arm.set, grid);
  /* Het venster van de SET waarop deze arm loopt (de vloer van de orde-4-
   * W-M-as): het bindt de kniewindows van de ontwerpstap alleen als de kooi
   * eronder ligt, en hier ligt hij er ruim boven — meegenomen omdat het bij de
   * set hoort, niet omdat het iets beslist. */
  const sameOrder = field.field.candidates.find(
    (x) => x.crossings[0].order === c.crossings[0].order && x.crossings[1].order === c.crossings[1].order,
  );
  const crossings = c.crossings.map((x, i) => ({
    ...x,
    windowHz: sameOrder ? sameOrder.crossings[i].windowHz : x.windowHz,
  }));
  const input: Chain3Input = {
    grid: [...gridded.grid],
    w: gridded.w,
    m: gridded.m,
    t: gridded.t,
    driverZ: gridded.driverZ,
    tAdjust: { offsetMm: 0, trimDb: 0, inverted: false },
    midAdjust: {},
    xoLow: crossings[0].hz,
    xoHigh: crossings[1].hz,
    xoLowRange: crossings[0].cageHz,
    xoHighRange: crossings[1].cageHz,
    label: c.label,
    settings: {
      ...CASUS1_V2_SETTINGS,
      band,
      safety: gridded.safety,
      structureLow: { kind: crossings[0].alignment.kind, order: crossings[0].alignment.order },
      structureHigh: { kind: crossings[1].alignment.kind, order: crossings[1].alignment.order },
      xoFloorPairs: crossings.map((x) => x.windowHz[0]),
    } as unknown as Chain3Input['settings'],
  };
  const declaration = declareCandidateChoices({
    cages: crossings.map((x) => x.cageHz),
    windowFloorsHz: crossings.map((x) => x.windowHz[0]),
    multiWay: true,
    stated: {
      band,
      staged: CASUS1_V2_SETTINGS.targets,
      ampTarget: CASUS1_V2_SETTINGS.ampTarget,
      powerMetric: CASUS1_V2_SETTINGS.powerMetric,
      phaseMetric: CASUS1_V2_SETTINGS.phaseMetric,
      catalogSnap: CASUS1_V2_SETTINGS.catalogSnap,
      breakupGuard: CASUS1_V2_SETTINGS.breakupGuard,
      audit: CASUS1_V2_SETTINGS.audit,
      rSourceProbeSource: CASUS1_V2_SETTINGS.rSourceProbeSource,
      ...('ampMinLoadOhm' in CASUS1_V2_SETTINGS ? { ampMinLoadOhm: CASUS1_V2_SETTINGS.ampMinLoadOhm } : {}),
      safety: gridded.safety,
      zFloorStrict: true,
    },
    targetCurve,
    ...(Object.keys(CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER).length > 0
      ? { driveOnFsLimitDbByDriver: { ...CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER } }
      : {}),
    ...(CASUS1_EXCURSION.driverCardByDriver !== undefined &&
    CASUS1_EXCURSION.amplifierPeakPowerW !== undefined &&
    CASUS1_EXCURSION.xmaxMarginFraction !== undefined
      ? { driveCeilingDerived: true }
      : {}),
    ...(CASUS1_V2_BUDGETS.lfBumpBudgetDb !== undefined ? { lfBumpBudgetDb: CASUS1_V2_BUDGETS.lfBumpBudgetDb } : {}),
    /* A5e.3 — de families en de fits, alleen op de arm die erom vraagt. */
    ...(arm.coilDcr
      ? {
          coilDcrFamilyByWay: { ...casus1CoilFamilyByDriver().familyByWay },
          coilDcrFits: casus1CoilDcrFits().fits,
          coilDcrCatalogLabel: casus1CoilDcrFits().label,
        }
      : {}),
  });
  const chainDeclaration = declareCandidateChainChoices({
    stated: {},
    ...(arm.levelWork !== undefined ? { lowestWayLevelWorkForbidden: true } : {}),
    ...(arm.levelWork !== undefined && typeof arm.levelWork === 'object' && arm.levelWork.kind === 'series-r-max'
      ? { lowestWaySeriesRMaxOhm: arm.levelWork.maxOhm }
      : {}),
  });
  return {
    input,
    v2: {
      ...facts,
      gates: { ...CASUS1_V2_GATES },
      budgets: { ...CASUS1_V2_BUDGETS },
      determinism: { seed: CASUS1_V2_SEED },
      targetCurve,
      judgeBandHz: band,
      ...(CASUS1_CONTINUOUS_POWER_W !== null ? { amplifierPowerW: CASUS1_CONTINUOUS_POWER_W } : {}),
    },
    candidate: {
      declaration,
      chainDeclaration,
      provenance: c.provenance,
      orderByModel: { mid: crossings[0].order, tweeter: crossings[1].order },
    },
  };
}

/* ------------------------------------------------------------------ *
 * De observator op de keten-export
 * ------------------------------------------------------------------ */
interface Captured {
  seed: VxpPart[] | null;
  result: Chain3Result | null;
}
function observeChain(): Captured {
  const cap: Captured = { seed: null, result: null };
  const original = chainModule.runThreeWayChain;
  const wrapped = (
    input: Chain3Input,
    onProgress?: Parameters<typeof chainModule.runThreeWayChain>[1],
    hooks?: ChainEngineHooks,
  ): Chain3Result => {
    const seen: ChainEngineHooks | undefined = hooks
      ? {
          ...hooks,
          ...(hooks.tuneOptionsFor
            ? {
                tuneOptionsFor: (seedParts: readonly VxpPart[]) => {
                  cap.seed = structuredClone([...seedParts]);
                  return hooks.tuneOptionsFor!(seedParts);
                },
              }
            : {}),
        }
      : hooks;
    const r = original(input, onProgress, seen);
    cap.result = structuredClone(r);
    return r;
  };
  const d = Object.getOwnPropertyDescriptor(chainModule, 'runThreeWayChain');
  if (!d || !d.configurable) throw new Error('de keten-export is niet configureerbaar; de observator kan niet gelegd worden');
  Object.defineProperty(chainModule, 'runThreeWayChain', { configurable: true, enumerable: true, get: () => wrapped });
  return cap;
}

/* ------------------------------------------------------------------ *
 * Eén arm draaien
 * ------------------------------------------------------------------ */
interface ArmOutput {
  arm: string;
  label: string;
  what: string;
  settings: {
    set: Casus1MeasurementSet;
    band: [number, number];
    grid: { fromHz: number; toHz: number; points: number };
    targetCurve: TargetCurve;
    levelWork: LowestWayLevelWork | null;
    ampMinLoadOhm: number | null;
    /** A5e.3 — de families per weg van het DCR-model, of null (verliesvrij). */
    coilDcrFamilyByWay: Record<string, string> | null;
  };
  seconds: number;
  seedParts: VxpPart[] | null;
  /** Het GELEVERDE netwerk (null op een verwerping). */
  deliveredParts: VxpPart[] | null;
  /** Het GEWEIGERDE netwerk (null als er niets geweigerd is). */
  rejectedParts: VxpPart[] | null;
  refusal: { by: string; kinds: string[]; reason: string } | null;
  gateRefusals: string[];
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  rejectedTune: Record<string, unknown> | null;
  tuned: number;
  evaluations: number;
  worker: {
    gates: GateVerdict[];
    rejection: unknown;
    levelWork: unknown;
    disqualified: string[];
  };
}

function runArm(arm: ArmSpec): ArmOutput {
  const c = m1Candidate(arm.label);
  const payload = payloadFor(arm, c);
  const cap = observeChain();
  const t0 = Date.now();
  const wire = structuredClone({ id: 1, kind: 'v2Chain3One' as const, payload });
  const collected: unknown[] = [];
  handleV2Request(wire, (m: V2Response) => {
    if (m.kind === 'error') throw new Error(m.message);
    if (m.kind === 'done') collected.push(m.data);
  });
  const done = collected[0] as {
    result: Chain3Result;
    gates: GateVerdict[];
    rejection: unknown;
    levelWork: unknown;
  };
  if (!done) throw new Error(`arm ${arm.name} leverde niets`);
  if (!cap.result) throw new Error(`arm ${arm.name}: de observator op runThreeWayChain heeft NIET gevuurd`);
  const r = cap.result;
  const net = r.net as unknown as {
    refusal?: { by: string; kinds: string[]; reason: string };
    rejectedParts?: VxpPart[];
    gateRefusals?: string[];
    rejectedTune?: Record<string, unknown>;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    tuned: number;
    evaluations: number;
  };
  const refused = net.refusal ?? null;
  const rej = done.rejection as { kinds?: string[]; reason?: string } | null;
  /* Een verwerping op een GESTELDE eis (V45/V51, `by: stated-budget|stated-topology`) komt
   * niet uit de tuner: de keten leverde dan een netwerk en de worker trok het in.
   * Het geweigerde netwerk is dan `r.parts`. */
  const workerRefusedDelivered = !refused && rej !== null && rej !== undefined;
  return {
    arm: arm.name,
    label: arm.label,
    what: arm.what,
    settings: {
      set: arm.set,
      band: payload.v2.judgeBandHz as [number, number],
      grid: { fromHz: payload.input.grid[0], toHz: payload.input.grid[payload.input.grid.length - 1], points: payload.input.grid.length },
      targetCurve: payload.v2.targetCurve as TargetCurve,
      levelWork: arm.levelWork ?? null,
      ampMinLoadOhm: payload.v2.gates.ampMinLoadOhm ?? null,
      coilDcrFamilyByWay: (payload.candidate!.declaration.stated as { coilDcrModel?: { familyByWay: Record<string, string> } }).coilDcrModel?.familyByWay ?? null,
    },
    seconds: (Date.now() - t0) / 1000,
    seedParts: cap.seed,
    deliveredParts: refused || workerRefusedDelivered ? null : [...r.parts],
    rejectedParts: refused ? (net.rejectedParts ?? null) : workerRefusedDelivered ? [...r.parts] : null,
    refusal: refused
      ? { by: refused.by, kinds: [...refused.kinds], reason: refused.reason }
      : workerRefusedDelivered
        ? { by: 'worker', kinds: [...(rej?.kinds ?? [])], reason: rej?.reason ?? '' }
        : null,
    gateRefusals: [...(net.gateRefusals ?? [])],
    before: net.before,
    after: net.after,
    rejectedTune: net.rejectedTune ?? null,
    tuned: net.tuned,
    evaluations: net.evaluations,
    worker: {
      gates: done.gates,
      rejection: done.rejection,
      levelWork: done.levelWork,
      disqualified: [...(done.result.disqualified ?? [])],
    },
  };
}

const f2 = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : '—');
function summaryLine(o: ArmOutput): string {
  const floor = o.worker.gates.find((g) => g.gate === 'M-B/|Z|');
  return (
    `  [${o.arm}] ${o.label} — ${o.refusal ? `GEWEIGERD (${o.refusal.kinds.join(',')}): ${o.refusal.reason.slice(0, 110)}` : 'GELEVERD'}` +
    ` | zaad min|Z| ${f2(o.before.zMinOhm)} → tune ${f2((o.rejectedTune ?? o.after).zMinOhm)} Ω` +
    (floor && floor.value !== null ? ` (poort ${f2(floor.value)})` : '') +
    ` | rimpel ${f2((o.rejectedTune ?? o.after).rippleDb)} dB | tuned ${o.tuned} | ${o.seconds.toFixed(0)} s`
  );
}

/* ---- droogloop: de payload van élke arm, zonder te draaien --------------- */
if (process.env.M1_DRY === '1') {
  for (const arm of ARMS) {
    const c = m1Candidate(arm.label);
    const p = payloadFor(arm, c);
    const d = p.candidate!.declaration;
    const cd = p.candidate!.chainDeclaration as { stated: Record<string, unknown> };
    console.log(
      `[${arm.name}] ${arm.label}\n    set ${arm.set} · band ${p.v2.judgeBandHz?.map((v) => v.toFixed(1)).join('–')} · raster ${p.input.grid[0].toFixed(1)}–${p.input.grid[p.input.grid.length - 1].toFixed(0)}/${p.input.grid.length}` +
        ` · doelcurve ${JSON.stringify(p.v2.targetCurve)} · niveauwerk ${JSON.stringify(cd.stated.lowestWayLevelWork ?? null)}` +
        ` · amplitudeReference ${JSON.stringify((d.stated as Record<string, unknown>).amplitudeReference ?? null)} · vloer ${p.v2.gates.ampMinLoadOhm}` +
        ` · spoel-DCR ${(d.stated as { coilDcrModel?: { familyByWay: Record<string, string> } }).coilDcrModel ? JSON.stringify((d.stated as { coilDcrModel?: { familyByWay: Record<string, string> } }).coilDcrModel!.familyByWay) : 'absent'}` +
        ` · xo ${p.input.xoLow}/${p.input.xoHigh} kooi ${p.input.xoLowRange?.map((v) => v.toFixed(1)).join('–')} · venstervloeren ${JSON.stringify((p.input.settings as unknown as { xoFloorPairs: number[] }).xoFloorPairs)}` +
        ` · geldigheid ${JSON.stringify(p.v2.validHzByModel)}`,
    );
  }
  process.exit(0);
}

/* ---- child mode: één arm, één bestand ------------------------------------ */
if (ONLY !== null) {
  const arm = ARMS.find((a) => a.name === ONLY);
  if (!arm) throw new Error(`M1_ARM=${ONLY} is geen arm; kies uit ${ARMS.map((a) => a.name).join(', ')}`);
  mkdirSync(OUT_DIR, { recursive: true });
  const out = runArm(arm);
  writeFileSync(join(OUT_DIR, `${arm.name}.json`), JSON.stringify(out, null, 1), 'utf-8');
  console.log(summaryLine(out));
  process.exit(0);
}

/* ---- parent mode ---------------------------------------------------------- */
mkdirSync(OUT_DIR, { recursive: true });
const todo = ARMS.filter((a) => !existsSync(join(OUT_DIR, `${a.name}.json`)) || process.env.M1_REDO === '1');
console.log(`M-1-diagnose: ${ARMS.length} armen, ${todo.length} te draaien, ${JOBS} tegelijk op ${cpus().length} kernen`);
for (const a of ARMS) console.log(`  ${a.name.padEnd(16)} ${a.label}  —  ${a.what}`);
const t0 = Date.now();
let next = 0;
let finished = 0;
await new Promise<void>((resolve, reject) => {
  const start = () => {
    if (next >= todo.length) {
      if (finished === todo.length) resolve();
      return;
    }
    const arm = todo[next++];
    const child = spawn('npx', ['vite-node', SELF], {
      cwd: join(HERE, '..'),
      env: { ...process.env, M1_ARM: arm.name, M1_JOBS: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (b: Buffer) => (out += b.toString()));
    child.stderr.on('data', (b: Buffer) => (out += b.toString()));
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`arm ${arm.name} faalde (exit ${code}):\n${out}`));
        return;
      }
      finished++;
      for (const line of out.split('\n')) if (line.startsWith('  [')) console.log(line);
      start();
    });
  };
  for (let i = 0; i < Math.min(JOBS, todo.length); i++) start();
});
console.log(`alle armen klaar in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
console.log('');
console.log('| arm | kandidaat | uitkomst | zaad min|Z| Ω | tune min|Z| Ω | rimpel dB | tuned | s |');
console.log('|---|---|---|---|---|---|---|---|');
for (const a of ARMS) {
  const o = JSON.parse(readFileSync(join(OUT_DIR, `${a.name}.json`), 'utf-8')) as ArmOutput;
  console.log(
    `| ${o.arm} | ${o.label} | ${o.refusal ? `geweigerd (${o.refusal.kinds.join(', ')})` : 'geleverd'} | ${f2(o.before.zMinOhm)} | ` +
      `${f2((o.rejectedTune ?? o.after).zMinOhm)} | ${f2((o.rejectedTune ?? o.after).rippleDb)} | ${o.tuned} | ${o.seconds.toFixed(0)} |`,
  );
}
