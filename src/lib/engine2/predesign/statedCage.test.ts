/**
 * U-5c — DE GESTELDE KOOI, PER AS GELEZEN.
 *
 * WAT M-5 MAT EN AAN ZIJN EIGEN SESSIE OVERLIET. U-5 legt élke gestelde kooi
 * één spacing breed, gecentreerd, en NIET tegen het venster geknipt, en de
 * reden die hij geeft is juist wáár zij geldt: knippen zou de tune terugtrekken
 * naar een rand waar de ontwerper bewust overheen stapte. Wat die reden NIET
 * dekt is een positie die nergens overheen stapte. Daar beschermt de ongeknipte
 * kooi geen besluit — er is tegen het venster geen besluit genomen — en geeft
 * zij de tune ruimte die de METINGEN niet toelaten, op ÉLKE as van de kandidaat.
 *
 * M-5's gestelde mid→tweeter-positie (2251,4 Hz) ligt BINNEN een venster van
 * 2200–2304 Hz en werd gekooid op 2125–2385: 81 Hz voorbij het breakup-plafond.
 * Vijf van de zeven geleverde rijen kruisten daar boven 2304 Hz, één tot
 * 8560 Hz. Dat staat als voorbehoud in de M-5-entry, en dit is de sessie die
 * het repareert.
 *
 * VIER GROEPEN, en de vorm van elke is de vorm van wat zij vasthoudt.
 *
 *  1. DE REGEL MET DE HAND, op U-5's eigen bank waarvan élke grens een rond
 *     getal is — inclusief de TEGENPROEF die het bestand draagt: een positie
 *     BUITEN haar venster houdt haar ongeknipte kooi, want dat is precies het
 *     geval dat U-5's reden beschrijft. Zonder die tegenproef leest de eerste
 *     groep als "gestelde kooien worden geknipt", en dat is niet de regel.
 *  2. PER AS EN PER ORDE, wat de hele reparatie is: dezelfde gestelde
 *     frequentie krijgt bij een andere orde een andere kooi, omdat zij een
 *     ander venster heeft. Een besluit op KANDIDAATniveau kan dat niet.
 *  3. HET M-5-MATERIAAL: het veld van toen, met de kooien van vandaag, en de
 *     opgenomen tabel als het GEDATEERDE record van wat de oude kooi toeliet.
 *  4. DE VENSTERVLOER die de tune stuurt (`windowFloorsFor`) — het tweede lek
 *     van dezelfde oorzaak, en het sluit door dezelfde reparatie.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Alignment, CandidatePairInput } from './candidates.ts';
import { crossoverWindow, type XoWindowInput } from './xoWindow.ts';
import { statedCandidates } from './statedCrossings.ts';
import type { PairOrderResult } from './flankOrder.ts';
import { windowFloorsFor } from '../optimizer/scanRequest.ts';
import { buildCandidateField } from './candidateField.ts';
import { buildReport, type EngineV2Report } from '../report.ts';
import { ctcKey } from '../metrics/types.ts';
import {
  CASUS1_BUILDABILITY,
  CASUS1_COIL_DCR_SETTINGS,
  CASUS1_CONTINUOUS_POWER_W,
  CASUS1_EXCURSION,
  CASUS1_FIELD_ALIGNMENTS,
  CASUS1_FIELD_CHAIN_BUDGET,
  CASUS1_FIELD_POSITION_POLICY,
  CASUS1_LEVEL_WORK_SETTINGS,
  CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER,
  CASUS1_M5_STATED_ON,
  CASUS1_M5_STATED_PER_AXIS_HZ,
  CASUS1_TARGET_CURVE,
  CASUS1_WINDOW_SETTINGS,
  casus1M5PerPair,
} from '../casus1V2.fixture.ts';
import {
  CASUS1_WOOFER_DC_OHM,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
} from '../casus1.fixture.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '..', '..', '..', '..', 'test-fixtures');
const TABLE = join(FIXTURES, 'casus1_m5_lr2.json');

/* ================================================================== *
 * U-5's eigen bank: elke grens een rond getal
 * ================================================================== */

const ORDER = 4;
const FS_HZ = 1000;
const BREAKUP_HZ = 8000;
const DIVISOR = 2;
/** −24 dB op f_s over 24 dB/oct bij orde 4 is exact één octaaf: 2000 Hz. */
const DRIVE_CEILING_DB = -24;
/** Het venster is daarmee exact 2000–4000 Hz. */
const FLOOR = 2000;
const CEILING = BREAKUP_HZ / DIVISOR;
const SPACING = 1 / 6;
const HALF = SPACING / 2;

const ALIGNMENTS: readonly Alignment[] = [{ kind: 'LR', order: ORDER }];

const windowInput = (over: Partial<XoWindowInput> = {}): XoWindowInput => ({
  lower: 'L',
  upper: 'U',
  order: ORDER,
  validityFloorHz: 100,
  validityFloorSource: 'de bank',
  upperFsHz: FS_HZ,
  upperDriveCeilingDb: DRIVE_CEILING_DB,
  upperDriveCeilingSource: 'de bank',
  lowerBreakups: [{ fHz: BREAKUP_HZ, dB: 3 }],
  lowerBreakupDivisor: DIVISOR,
  lowerBreakupDivisorSource: 'de bank',
  lowerMinus6Hz: null,
  lowerMinus6AngleDeg: null,
  spacingMm: null,
  ...over,
});

const flank = (side: 'lower-lp' | 'upper-hp', driver: string, label: string) => ({
  pairLabel: label,
  side,
  driver,
  demands: [],
  demandedOrder: null,
  binding: null,
  notes: [],
});

const orders = (list: number[], label = 'L→U'): PairOrderResult => ({
  pairLabel: label,
  flanks: [flank('lower-lp', 'L', label), flank('upper-hp', 'U', label)],
  orders: list,
  why: list.map((o) => `order ${o}: de bank laat hem toe`),
  notes: [],
});

const pair = (over: Partial<XoWindowInput> = {}, list = [ORDER]): CandidatePairInput => ({
  windowInput: windowInput(over),
  orders: orders(list),
  statedOrder: ORDER,
});

const statedOn = '2026-09-24';
const bench = (hz: number[], p = pair(), alignments = ALIGNMENTS) =>
  statedCandidates([p], [hz], { alignments, alignmentPolicy: 'one', spacingOctaves: SPACING, statedOn });

/** De ENE gestelde kruising van een bank met één as en één orde. */
const only = (hz: number, p = pair()) => {
  const f = bench([hz], p);
  expect(f.candidates).toHaveLength(1);
  return f.candidates[0];
};

/* ================================================================== *
 * 1 — de regel met de hand, en de tegenproef die haar draagt
 * ================================================================== */

describe('U-5c — de gestelde kooi met de hand', () => {
  it('de bank is 2000–4000 Hz en de kooi is een zesde octaaf breed', () => {
    const w = crossoverWindow({ ...windowInput(), order: ORDER });
    expect(w.floorHz).toBeCloseTo(FLOOR, 6);
    expect(w.ceilingHz).toBeCloseTo(CEILING, 6);
  });

  it('P2 — een positie RUIM binnen het venster houdt precies de kooi die U-5 haar gaf', () => {
    /* Het gewone geval, en het beweegt niet: 2500 · 2^(±1/12) = 2360–2647 ligt
     * volledig binnen 2000–4000, dus er valt niets te knippen. */
    const c = only(2500);
    const [lo, hi] = c.crossings[0].cageHz;
    expect(lo).toBeCloseTo(2500 / 2 ** HALF, 1);
    expect(hi).toBeCloseTo(2500 * 2 ** HALF, 1);
    expect(c.crossings[0].twoSided).toBe(true);
    expect(c.crossings[0].provenance).toContain('inside the window on both sides');
  });

  it('een positie BINNEN het venster maar tegen het PLAFOND wordt erop geknipt', () => {
    /* 3900 · 2^(1/12) = 4131 Hz, en 4131 Hz is een halve breakup-octaaf die de
     * metingen niet toelaten. De kooi stopt op het plafond. */
    const c = only(3900);
    expect(c.stated!.perCrossing[0].breaches).toEqual([]);
    const [lo, hi] = c.crossings[0].cageHz;
    expect(3900 * 2 ** HALF).toBeGreaterThan(CEILING);
    expect(hi).toBeCloseTo(CEILING, 1);
    expect(lo).toBeCloseTo(3900 / 2 ** HALF, 1);
    expect(c.crossings[0].twoSided).toBe(false);
    expect(c.crossings[0].provenance).toContain('CLIPPED to the window at the ceiling');
  });

  it('en tegen de VLOER op dezelfde manier, aan de andere kant', () => {
    const c = only(2050);
    expect(c.stated!.perCrossing[0].breaches).toEqual([]);
    const [lo, hi] = c.crossings[0].cageHz;
    expect(2050 / 2 ** HALF).toBeLessThan(FLOOR);
    expect(lo).toBeCloseTo(FLOOR, 1);
    expect(hi).toBeCloseTo(2050 * 2 ** HALF, 1);
    expect(c.crossings[0].twoSided).toBe(false);
    expect(c.crossings[0].provenance).toContain('CLIPPED to the window at the floor');
  });

  it('DE TEGENPROEF — een positie BUITEN haar venster houdt haar ONGEKNIPTE kooi', () => {
    /* Dit is het geval dat U-5's reden beschrijft, en het is niet aangeraakt:
     * 8000 Hz ligt een octaaf boven het plafond, de ontwerper stapte er bewust
     * overheen, en een kooi die op 4000 zou stoppen is een tweede mening over
     * een positie die al gegeven is. Zonder deze claim leest de groep hierboven
     * als "gestelde kooien worden geknipt", en dat is de regel niet. */
    const c = only(BREAKUP_HZ);
    expect(c.stated!.outsideWindow).toBe(true);
    const [lo, hi] = c.crossings[0].cageHz;
    expect(lo).toBeCloseTo(BREAKUP_HZ / 2 ** HALF, 1);
    expect(hi).toBeCloseTo(BREAKUP_HZ * 2 ** HALF, 1);
    expect(lo).toBeGreaterThan(CEILING);
    expect(c.crossings[0].twoSided).toBe(true);
    expect(c.crossings[0].provenance).toContain('NOT clipped to the window');
  });

  it('een venster ZONDER plafond knipt niets boven — er is geen grens om op te stoppen (P4)', () => {
    const p = pair({ lowerBreakups: [], lowerBreakupDivisor: null });
    const w = crossoverWindow({ ...p.windowInput, order: ORDER });
    expect(w.ceilingHz).toBeNull();
    const [lo, hi] = only(3900, p).crossings[0].cageHz;
    expect(hi).toBeCloseTo(3900 * 2 ** HALF, 1);
    expect(lo).toBeCloseTo(3900 / 2 ** HALF, 1);
  });

  it('de gestelde positie zelf beweegt NOOIT, en zij ligt altijd in haar eigen kooi (geen klif)', () => {
    for (const hz of [2000, 2050, 2500, 3900, CEILING, BREAKUP_HZ]) {
      const x = only(hz).crossings[0];
      expect(x.hz, `${hz}`).toBe(hz);
      expect(x.cageHz[0], `${hz} lo`).toBeLessThanOrEqual(hz);
      expect(x.cageHz[1], `${hz} hi`).toBeGreaterThanOrEqual(hz);
      expect(x.cageHz[1], `${hz} breedte`).toBeGreaterThan(x.cageHz[0]);
    }
  });
});

/* ================================================================== *
 * 2 — per as en per orde
 * ================================================================== */

describe('U-5c — per AS en per ORDE, en dat is de hele reparatie', () => {
  it('dezelfde frequentie krijgt bij een ANDERE orde een andere kooi, want zij heeft een ander venster', () => {
    /* Bij orde 2 ligt de aandrijfvloer op 4000 Hz (24 dB over 12 dB/oct is twee
     * octaven) en het breakup-plafond óók op 4000: het venster is dan een punt.
     * De vergelijking die telt is daarom orde 4 tegen orde 3 — bij orde 3 ligt
     * de vloer op 2^(24/18)·1000 = 2520 Hz, dus 2600 Hz staat daar tegen de
     * vloer aan en bij orde 4 (vloer 2000) ruim erboven. */
    const both: CandidatePairInput = {
      windowInput: windowInput(),
      orders: orders([3, 4]),
      statedOrder: null,
    };
    const f = statedCandidates([both], [[2600]], {
      alignments: [
        { kind: 'LR', order: 3 },
        { kind: 'LR', order: 4 },
      ],
      alignmentPolicy: 'every-order',
      spacingOctaves: SPACING,
      statedOn,
    });
    const at = (order: number) => f.candidates.flatMap((c) => c.crossings).find((x) => x.order === order)!;
    const three = at(3);
    const four = at(4);
    expect(crossoverWindow({ ...both.windowInput, order: 3 }).floorHz!).toBeCloseTo(
      FS_HZ * 2 ** (24 / 18),
      1,
    );
    // Bij orde 3 geknipt tegen de vloer, bij orde 4 ongemoeid: één frequentie,
    // twee kooien, en geen besluit op kandidaatniveau kan dat opleveren.
    expect(three.cageHz[0]).toBeGreaterThan(four.cageHz[0]);
    expect(three.twoSided).toBe(false);
    expect(four.twoSided).toBe(true);
    expect(four.cageHz[0]).toBeCloseTo(2600 / 2 ** HALF, 1);
  });

  it('een kandidaat waarvan de ASSEN het oneens zijn krijgt per as het juiste antwoord', () => {
    /* De onderste as is gesteld BINNEN haar venster (dus geknipt), de bovenste
     * ERBUITEN (dus niet). Tot U-5c kreeg deze kandidaat op BEIDE assen de
     * ongeknipte vorm, omdat het besluit aan de KANDIDAAT hing. */
    const low: CandidatePairInput = {
      windowInput: windowInput({ lower: 'L', upper: 'M' }),
      orders: orders([ORDER], 'L→M'),
      statedOrder: ORDER,
    };
    const high: CandidatePairInput = {
      windowInput: windowInput({ lower: 'M', upper: 'H', upperFsHz: 4000, lowerBreakups: [{ fHz: 32000, dB: 3 }] }),
      orders: orders([ORDER], 'M→H'),
      statedOrder: ORDER,
    };
    const f = statedCandidates([low, high], [[3900], [32000]], {
      alignments: ALIGNMENTS,
      alignmentPolicy: 'one',
      spacingOctaves: SPACING,
      statedOn,
    });
    expect(f.candidates).toHaveLength(1);
    const [a, b] = f.candidates[0].crossings;
    expect(f.candidates[0].stated!.perCrossing[0].insideWindow).toBe(true);
    expect(f.candidates[0].stated!.perCrossing[1].insideWindow).toBe(false);
    expect(a.cageHz[1]).toBeCloseTo(CEILING, 1);
    expect(b.cageHz[1]).toBeCloseTo(32000 * 2 ** HALF, 1);
    expect(b.cageHz[0]).toBeGreaterThan(b.windowHz[1]);
  });
});

/* ================================================================== *
 * 3 — het M-5-materiaal
 * ================================================================== */

const M3_REPORT: EngineV2Report = (() => {
  const golden = loadGolden();
  const manifest = casus1Manifest(golden, 'm3');
  const files = casus1Files(manifest);
  return buildReport({
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
})();

const M5_FIELD = buildCandidateField({
  windowInputs: M3_REPORT.predesign.windowInputs,
  perPair: casus1M5PerPair(M3_REPORT.predesign.windowInputs, 'armed'),
  alignments: CASUS1_FIELD_ALIGNMENTS,
  chainBudget: CASUS1_FIELD_CHAIN_BUDGET,
  positionPolicy: CASUS1_FIELD_POSITION_POLICY,
  statedPerAxisHz: CASUS1_M5_STATED_PER_AXIS_HZ,
  statedOn: CASUS1_M5_STATED_ON,
});
const M5_STATED = M5_FIELD.field.candidates.filter((c) => c.stated);

describe('U-5c — het M-5-veld, met de kooien van vandaag', () => {
  it('de premisse: élke gestelde positie van M-5 ligt BINNEN haar venster', () => {
    /* Zonder deze claim gaat de volgende over niets: de reparatie raakt alleen
     * posities die nergens overheen stappen, en op M-5 zijn dat ze allemaal. */
    expect(M5_STATED.length).toBeGreaterThan(0);
    for (const c of M5_STATED) {
      expect(c.stated!.outsideWindow, c.label).toBe(false);
    }
  });

  it('DE REPARATIE: geen enkele gestelde kooi reikt nog voorbij haar eigen venster', () => {
    for (const c of M5_STATED) {
      for (const x of c.crossings) {
        const where = `${c.label} — ${x.pairLabel} @ ${x.hz} Hz`;
        expect(x.cageHz[0], `${where} lo`).toBeGreaterThanOrEqual(x.windowHz[0] - 0.05);
        expect(x.cageHz[1], `${where} hi`).toBeLessThanOrEqual(x.windowHz[1] + 0.05);
        expect(x.hz, `${where} in`).toBeGreaterThanOrEqual(x.cageHz[0]);
        expect(x.hz, `${where} in`).toBeLessThanOrEqual(x.cageHz[1]);
      }
    }
  });

  it('de mid→tweeter-kooi die M-5 mat: 2125–2385 werd 2200–2304, het venster zelf', () => {
    const mt = M5_STATED[0].crossings[1];
    expect(mt.pairLabel).toBe('mid→tweeter');
    expect(mt.hz).toBeCloseTo(2251.4, 3);
    // Wat U-5 legde, met de hand nagerekend uit de spacing van het veld.
    const half = Math.log2(2385 / 2125) / 2;
    expect(2251.4 / 2 ** half).toBeCloseTo(2125, 0);
    expect(2251.4 * 2 ** half).toBeCloseTo(2385, 0);
    // En wat er sinds U-5c ligt: het venster, aan beide kanten geknipt.
    expect(mt.cageHz[0]).toBeCloseTo(2200, 1);
    expect(mt.cageHz[1]).toBeCloseTo(2304.0, 1);
    expect(mt.twoSided).toBe(false);
  });

  it('de woofer→mid-as toont dat het PER ORDE gaat: 253 Hz is bij LR2 geknipt en bij LR4 niet', () => {
    /* Dezelfde gestelde frequentie, dezelfde as, twee vensters — LR2 heeft een
     * vloer van 246,5 Hz en LR4 van 147,9 — dus twee kooien. */
    const at = (order: number) =>
      M5_STATED.map((c) => c.crossings[0]).find((x) => x.hz === 253 && x.order === order)!;
    const lr2 = at(2);
    const lr4 = at(4);
    expect(lr2.cageHz[0]).toBeCloseTo(lr2.windowHz[0], 1);
    expect(lr2.twoSided).toBe(false);
    expect(lr4.cageHz[0]).toBeCloseTo(253 / 2 ** (1 / 12), 1);
    expect(lr4.twoSided).toBe(true);
    expect(lr4.cageHz[0]).toBeLessThan(lr2.cageHz[0]);
  });
});

describe('U-5c — de opgenomen M-5-tabel als GEDATEERD record van wat de oude kooi toeliet', () => {
  const TAB = JSON.parse(readFileSync(TABLE, 'utf8')) as {
    meetsets: string[];
    afleiding: { paar: string; orde: number; venster_hz: [number, number] }[];
    per_meetset: Record<
      string,
      { rijen: { delivered: boolean; highHz: number; vector: { crossingsHz: number[] } | null }[] }
    >;
  };
  const delivered = TAB.meetsets.flatMap((s) =>
    TAB.per_meetset[s].rijen.filter((r) => r.delivered && r.vector),
  );
  const ceiling = TAB.afleiding.find((a) => a.paar === 'mid→tweeter' && a.orde === 4)!.venster_hz[1];

  it('vijf van de zeven geleverde rijen kruisten boven het breakup-plafond — de M-5-bevinding', () => {
    expect(delivered).toHaveLength(7);
    expect(ceiling).toBeCloseTo(2304.0, 1);
    const above = delivered.filter((r) => r.vector!.crossingsHz[1] > ceiling);
    expect(above).toHaveLength(5);
    expect(Math.max(...above.map((r) => r.vector!.crossingsHz[1]))).toBeGreaterThan(8000);
  });

  it('en de kooi die vandaag gelegd wordt laat geen van die vijf meer toe', () => {
    /* De kooi is een ZACHTE straf en geen wand — twee van de vijf liepen er bij
     * M-5 ook overheen — dus dit is geen belofte dat de tune binnen blijft. Wat
     * het wél is: de bovenrand die de tune straft ligt sinds U-5c op het
     * plafond in plaats van 81 Hz erboven, en geen van de vijf gemeten
     * kruispunten valt er nog binnen. */
    const mt = M5_STATED[0].crossings[1];
    for (const r of delivered) {
      const hz = r.vector!.crossingsHz[1];
      if (hz <= ceiling) continue;
      expect(hz, `geleverd ${hz}`).toBeGreaterThan(mt.cageHz[1]);
    }
    expect(mt.cageHz[1]).toBeLessThanOrEqual(ceiling + 0.05);
  });
});

/* ================================================================== *
 * 4 — de vensterVLOER die de tune stuurt
 * ================================================================== */

describe('U-5c — de venstervloer die de tune stuurt, ook per as', () => {
  it('op een gestelde positie BINNEN haar venster is de vloer weer de VENSTERvloer', () => {
    /* `windowFloorsFor` verlaagt de vloer naar de kooibodem zodra een kandidaat
     * gesteld is. Dat is U-5's regel en zij hoort te gelden waar de ontwerper
     * onder de vloer stapte; op een positie die dat niet deed was het een LEK,
     * want de ongeknipte kooi lag altijd onder de vloer. Met de geknipte kooi
     * is de min er per constructie een no-op. */
    const c = only(2050);
    expect(windowFloorsFor(c)[0]).toBeCloseTo(FLOOR, 1);
  });

  it('en op een positie ONDER de vloer is zij nog steeds de kooibodem — U-5, onaangeraakt', () => {
    const c = only(1000);
    expect(c.stated!.outsideWindow).toBe(true);
    expect(windowFloorsFor(c)[0]).toBeCloseTo(1000 / 2 ** HALF, 1);
    expect(windowFloorsFor(c)[0]).toBeLessThan(FLOOR);
  });

  it('op het M-5-veld staat élke gestelde vensterVLOER weer op het venster', () => {
    for (const c of M5_STATED) {
      const floors = windowFloorsFor(c);
      c.crossings.forEach((x, i) => {
        expect(floors[i], `${c.label} — ${x.pairLabel}`).toBeCloseTo(x.windowHz[0], 1);
      });
    }
  });
});

/* ================================================================== *
 * 5 — de twee herdraaide koan677-leveringen
 * ================================================================== */

describe('U-5c — wat de dichte kooi met de twee M-5-leveringen doet, herdraaid', () => {
  const RUNS = JSON.parse(readFileSync(join(FIXTURES, 'casus1_u5c_kooi.json'), 'utf8')) as {
    kooi_voor_na: { kooi_M5_hz: [number, number]; kooi_U5c_hz: [number, number]; venster_hz: [number, number] };
    rijen: {
      rij: string;
      M5_ongeknipte_kooi: { geleverd: boolean; fase_graden: number; min_Z_ohm: number; tuned: number; onderdelen: number };
      U5c_geknipte_kooi: {
        geleverd: boolean;
        fase_graden: number;
        min_Z_ohm: number;
        tuned: number;
        onderdelen: number;
        min_Z_binnen_tolerantie: boolean | null;
        weigering: { kinds: string[]; reason: string } | null;
      };
    }[];
  };

  it('de opgenomen kooien zijn de kooien die vandaag gelegd worden', () => {
    /* Zonder deze claim beschrijft het bestand een ingreep die niet meer de
     * ingreep is, en dat is precies hoe een opgenomen tabel stil veroudert. */
    const mt = M5_STATED[0].crossings[1];
    expect(RUNS.kooi_voor_na.kooi_U5c_hz[0]).toBeCloseTo(mt.cageHz[0], 1);
    expect(RUNS.kooi_voor_na.kooi_U5c_hz[1]).toBeCloseTo(mt.cageHz[1], 1);
    expect(RUNS.kooi_voor_na.venster_hz[0]).toBeCloseTo(mt.windowHz[0], 1);
    expect(RUNS.kooi_voor_na.venster_hz[1]).toBeCloseTo(mt.windowHz[1], 1);
    // En de oude kooi is aantoonbaar RUIMER dan het venster — anders was er niets te repareren.
    expect(RUNS.kooi_voor_na.kooi_M5_hz[1]).toBeGreaterThan(RUNS.kooi_voor_na.venster_hz[1]);
    expect(RUNS.kooi_voor_na.kooi_M5_hz[0]).toBeLessThan(RUNS.kooi_voor_na.venster_hz[0]);
  });

  it('DE LR2-SPIEGEL die boven het plafond kruiste wordt GEWEIGERD — zij leunde op de open kooi', () => {
    const r = RUNS.rijen.find((x) => /^woofer→mid \S+ LR2\b/.test(x.rij))!;
    expect(r.M5_ongeknipte_kooi.geleverd).toBe(true);
    expect(r.U5c_geknipte_kooi.geleverd).toBe(false);
    expect(r.U5c_geknipte_kooi.weigering!.kinds).toContain('gate');
    expect(r.U5c_geknipte_kooi.weigering!.reason).toMatch(/M-B\/\|Z\|/);
  });

  it('…en de LR4-TEXTBOOKarm die erbinnen kruiste levert nog, maar SLECHTER — de prijs van de reparatie', () => {
    /* DE ONAANGENAME HELFT, en zij staat hier omdat zij gemeten is. De kooi is
     * een ZACHTE straf die het hele zoeklandschap vormt en niet alleen de
     * landingsplaats, dus een rij die al binnen het nieuwe venster landde loopt
     * er toch een ander pad doorheen. */
    /* BEIDE rijen bevatten 'LR4' — de mid→tweeter-flank is er in allebei een —
     * dus de match gaat over de WOOFER→MID-flank en niet over de hele naam. */
    const r = RUNS.rijen.find((x) => /^woofer→mid \S+ LR4\b/.test(x.rij))!;
    expect(r.M5_ongeknipte_kooi.geleverd).toBe(true);
    expect(r.U5c_geknipte_kooi.geleverd).toBe(true);
    expect(r.U5c_geknipte_kooi.fase_graden).toBeGreaterThan(r.M5_ongeknipte_kooi.fase_graden);
    expect(r.U5c_geknipte_kooi.min_Z_ohm).toBeLessThan(r.M5_ongeknipte_kooi.min_Z_ohm);
    expect(r.U5c_geknipte_kooi.min_Z_binnen_tolerantie).toBe(true);
    /* En `tuned` is 0 waar M-5's zeven leveringen 25 tot 42 lezen: de laatste
     * structuurstap rolde terug en wat eruit komt is het netwerk zoals het
     * stond (`asIs`, freeCount 0). Een levering van een andere SOORT. */
    expect(r.M5_ongeknipte_kooi.tuned).toBeGreaterThan(20);
    expect(r.U5c_geknipte_kooi.tuned).toBe(0);
  });
});
