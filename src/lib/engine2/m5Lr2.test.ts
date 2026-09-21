/**
 * M-5 — DE LR2-VRAAG, EN WAAROM ZIJ OP DE TWEE OVERNAMES EEN ANDERE VRAAG IS.
 *
 * WAT DEZE SESSIE HERMAT. M-1 (04-09-2026) liet de woofer→mid-as zich
 * onthouden op de orde en draaide LR2 naast LR4; op grond van dat veld trok
 * A5e.3-veld LR2 in en STELT élke regeneratie sindsdien orde 4. Die
 * weerlegging rustte op een veld waarvan NUL van de 115 kandidaten geleverd
 * werd (de vergelijking ging dus over geweigerde tunes), op de augustus-
 * meetset, vóór de M-3-midfase, en vóór H-4 — de polariteit van élke LR2-arm
 * daar kwam uit de interne tie-break op ideale filters die H-4 heeft
 * gediscrediteerd. Sindsdien was LR2 niet gemeten maar GEPIND.
 *
 * WAT DE METING VINDT, en het is op de twee overnames een verschillend soort
 * antwoord:
 *
 *   · MID→TWEETER: LR2 is geen veldvraag maar een AFLEIDINGSweigering. Het
 *     gestelde M-C-getal van de tweeter (−20 dB op f_s) maakt zijn venster
 *     LEEG, en het beste wat een LR2 in de door het breakup-plafond toegestane
 *     band kan leveren komt 4,19 dB tekort. Dat is arithmetiek op twee
 *     gestelde getallen: het hangt niet van een zoektocht af, niet van een
 *     polariteitsarm, en niet van de meetset.
 *   · WOOFER→MID: LR2 is WEL toegelaten — de mid stelt geen M-C-getal, dus
 *     A5d.3(ii) onthoudt zich daar (P4) en de vensterbodem komt van het
 *     AFGELEIDE excursieplafond. Daar is de vraag dus een veldvraag, en M-5
 *     heeft hem als veld beantwoord.
 *
 * ELKE CLAIM HIERONDER IS EEN HANDBEREKENING OF EEN TEGENPROEF, en de
 * tegenproeven dragen het bestand: een claim "LR2 valt af" zonder de claim
 * "zonder het gestelde getal valt hij niet af" gaat over de uitlijning waar
 * zij over de EIS gaat.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CASUS1_BUILDABILITY,
  CASUS1_COIL_DCR_SETTINGS,
  CASUS1_CONTINUOUS_POWER_W,
  CASUS1_EXCURSION,
  CASUS1_FIELD_ALIGNMENTS,
  CASUS1_FIELD_CHAIN_BUDGET,
  CASUS1_FIELD_POSITION_POLICY,
  CASUS1_FIELD_STATED_ORDER,
  CASUS1_LEVEL_WORK_SETTINGS,
  CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER,
  CASUS1_M5_STATED_ON,
  CASUS1_M5_STATED_PER_AXIS_HZ,
  CASUS1_TARGET_CURVE,
  CASUS1_WINDOW_SETTINGS,
  casus1ChainInput,
  casus1Field,
  casus1M5PerPair,
  type Casus1M5Arming,
} from './casus1V2.fixture.ts';
import {
  CASUS1_WOOFER_DC_OHM,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
  type Casus1MeasurementSet,
} from './casus1.fixture.ts';
import { buildReport, type EngineV2Report } from './report.ts';
import { ctcKey } from './metrics/types.ts';
import { buildCandidateField, candidateFieldKey } from './predesign/candidateField.ts';
import { crossoverWindow } from './predesign/xoWindow.ts';
import { DB_PER_OCTAVE_PER_ORDER } from './constants.ts';
import { polarityMarginReader, type PolarityBranch } from './predesign/polarityArms.ts';
import type { GriddedResponse } from '../dsp.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const TABLE = join(HERE, '..', '..', '..', 'test-fixtures', 'casus1_m5_lr2.json');

/** Eén rapport per meetset — gebouwd zoals élke casus-1-meting het bouwt. */
function reportOn(set: Casus1MeasurementSet): { report: EngineV2Report; gridded: ReturnType<typeof casus1ChainInput> } {
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
  return { report, gridded: casus1ChainInput(manifest, files, golden) };
}

const M3 = reportOn('m3');
const WIS = M3.report.predesign.windowInputs;
const MT = WIS[1];
const WM = WIS[0];

const ordersOn = (arming: Casus1M5Arming, report = M3.report): number[][] =>
  buildCandidateField({
    windowInputs: report.predesign.windowInputs,
    perPair: casus1M5PerPair(report.predesign.windowInputs, arming),
    alignments: CASUS1_FIELD_ALIGNMENTS,
  }).orders.map((o) => [...o.orders]);

describe('M-5 — mid→tweeter: LR2 wordt door de AFLEIDING geweigerd, niet door een veld', () => {
  it('het gestelde getal maakt het LR2-venster LEEG, en de vloerregel zegt welk getal dat is', () => {
    const w2 = crossoverWindow({ ...MT, order: 2 });
    expect(w2.floorBy?.rule).toBe('drive-stated');
    expect(w2.ceilingBy?.rule).toBe('breakup');
    expect(w2.floorHz!).toBeGreaterThan(w2.ceilingHz!);
    /* DE VLOER MET DE HAND: A5d.3(ii) omgekeerd op het gestelde getal —
     * f = f_s · 2^(|eis| / (6 · orde)). */
    const fs = MT.upperFsHz!;
    const stated = Math.abs(MT.upperStatedDriveLimitDb!);
    expect(w2.floorHz!).toBeCloseTo(fs * 2 ** (stated / (DB_PER_OCTAVE_PER_ORDER * 2)), 1);
  });

  it('de grond in de eenheid van de grens: op het HOOGSTE toegestane kruispunt komt LR2 4,19 dB tekort', () => {
    /* De eerlijke lezing van "deze orde kan het niet" is niet de volgorde van
     * twee getallen maar de decibels op de GUNSTIGSTE toegestane plek: het
     * breakup-plafond. Komt hij daar tekort, dan komt hij overal tekort. */
    const ceiling = crossoverWindow({ ...MT, order: 4 }).ceilingHz!;
    const fs = MT.upperFsHz!;
    const delivered2 = DB_PER_OCTAVE_PER_ORDER * 2 * Math.log2(ceiling / fs);
    const delivered4 = DB_PER_OCTAVE_PER_ORDER * 4 * Math.log2(ceiling / fs);
    const need = Math.abs(MT.upperStatedDriveLimitDb!);
    expect(delivered2).toBeCloseTo(15.81, 2);
    expect(need - delivered2).toBeCloseTo(4.19, 2);
    /* En de tegenproef die er een uitspraak over de ORDE van maakt: bij orde 4
     * is er ruimte in plaats van tekort. */
    expect(delivered4 - need).toBeGreaterThan(0);
  });

  it('TEGENPROEF — zonder het gestelde getal is het LR2-venster NIET leeg', () => {
    /* Zonder deze claim gaat de eerste over de UITLIJNING waar zij over de EIS
     * gaat: LR2 valt hier af omdat casus 1 −20 dB stelt, en niet omdat een
     * tweede-orde flank iets verbodens doet. */
    const bare = crossoverWindow({ ...MT, order: 2, upperStatedDriveLimitDb: null });
    expect(bare.empty).toBe(false);
    expect(bare.ceilingHz!).toBeGreaterThan(bare.floorHz!);
  });

  it('de weigering OVERLEEFT de ongekalibreerde breakup-deler — ook op de mildste gepubliceerde waarde', () => {
    /* Het plafond dat het LR2-venster dichtdrukt is de breakup van de mid
     * gedeeld door een deler die dit project ZELF ongekalibreerd noemt (V6/V9,
     * U-4). Als de weigering aan die kalibratie hing, zou zij niet veel waard
     * zijn. Zij hangt er niet aan: op de MILDSTE gepubliceerde deler (2,0) is
     * het venster nog steeds leeg, en het gaat pas open onder ongeveer 1,94 —
     * buiten het gepubliceerde bereik van 2,0 tot 3,0. */
    const emptyAt = (divisor: number): boolean => {
      const w = crossoverWindow({ ...MT, order: 2, lowerBreakupDivisor: divisor });
      return w.empty || w.floorHz === null || w.ceilingHz === null || !(w.ceilingHz > w.floorHz);
    };
    for (const d of [3.0, 2.4689, 2.2, 2.0, 1.95]) expect(emptyAt(d), `deler ${d}`).toBe(true);
    /* En de TEGENPROEF, want zonder haar is "altijd leeg" ook waar voor een
     * lezer die de deler niet leest. */
    expect(emptyAt(1.9)).toBe(false);
    /* Op orde 4 doet dezelfde deler er niets toe: daar bindt de aanbevolen
     * ondergrens van het blad en niet de aandrijfvloer. */
    const w4 = crossoverWindow({ ...MT, order: 4, lowerBreakupDivisor: 2.0 });
    expect(w4.empty).toBe(false);
    expect(w4.floorBy?.rule).toBe('stated-min');
  });

  it('LR4 is wél toegelaten, en zijn vloer komt van de aanbevolen ondergrens van het blad', () => {
    const w4 = crossoverWindow({ ...MT, order: 4 });
    expect(w4.empty).toBe(false);
    expect(w4.floorBy?.rule).toBe('stated-min');
    expect(w4.ceilingBy?.rule).toBe('breakup');
  });

  it('TWEE ONAFHANKELIJKE GRONDEN: de gewapende afleiding laat orde 2 niet toe, de kale wel maar het VELD weigert hem', () => {
    expect(ordersOn('armed')[1]).toEqual([4]);
    /* Kaal onthoudt de afleiding zich en biedt élke bouwbare orde aan (A5e.1)
     * — en dan is het het VELD dat orde 2 weigert, op het lege venster. Twee
     * wegen naar hetzelfde antwoord, allebei uit het gestelde getal. */
    expect(ordersOn('bare')[1]).toEqual([2, 4]);
    const bareField = buildCandidateField({
      windowInputs: WIS,
      perPair: casus1M5PerPair(WIS, 'bare'),
      alignments: CASUS1_FIELD_ALIGNMENTS,
    });
    expect(bareField.field.refusals.join('\n')).toContain('mid→tweeter at order 2');
    expect(bareField.field.refusals.join('\n')).toContain('EMPTY');
  });

  it('de eis van A5d.3(ii) met de hand: 20 dB over 1,28 octaaf vraagt orde 2,60, dus 3, en de bibliotheek maakt er 4 van', () => {
    const armed = buildCandidateField({
      windowInputs: WIS,
      perPair: casus1M5PerPair(WIS, 'armed'),
      alignments: CASUS1_FIELD_ALIGNMENTS,
    });
    const demand = armed.orders[1].flanks.flatMap((f) => f.demands).find((d) => d.rule === 'protection');
    expect(demand).toBeDefined();
    const ref = armed.referenceCrossingHz[1]!;
    const oct = Math.log2(ref / MT.upperFsHz!);
    expect(demand!.exactOrder).toBeCloseTo(20 / (DB_PER_OCTAVE_PER_ORDER * oct), 6);
    expect(demand!.minOrder).toBe(3);
    /* De bibliotheek kent geen LR3, dus de eis wordt naar de eerstvolgende
     * bouwbare orde gebracht en de shortfall staat in de notities (`fit`). */
    expect(armed.orders[1].orders).toEqual([4]);
  });
});

describe('M-5 — woofer→mid: LR2 is WEL toegelaten, en de drie gestelde posities liggen erbinnen', () => {
  it('de mid stelt geen M-C-getal, dus A5d.3(ii) onthoudt zich daar en de vloer is het AFGELEIDE plafond', () => {
    expect(CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER[WM.upper]).toBeUndefined();
    expect(WM.upperStatedDriveLimitDb ?? null).toBeNull();
    expect(crossoverWindow({ ...WM, order: 2 }).floorBy?.rule).toBe('drive');
    expect(ordersOn('armed')[0]).toEqual([2, 4]);
  });

  it('elke gestelde positie ligt in het LR2-venster, en 253 Hz is de krapste met 0,45 dB marge', () => {
    const w2 = crossoverWindow({ ...WM, order: 2 });
    const need = Math.abs(WM.upperDriveCeilingDb!);
    const margins = CASUS1_M5_STATED_PER_AXIS_HZ[0].map(
      (hz) => DB_PER_OCTAVE_PER_ORDER * 2 * Math.log2(hz / WM.upperFsHz!) - need,
    );
    for (const hz of CASUS1_M5_STATED_PER_AXIS_HZ[0]) {
      expect(hz).toBeGreaterThanOrEqual(w2.floorHz!);
      expect(hz).toBeLessThanOrEqual(w2.ceilingHz!);
    }
    expect(margins.every((m) => m > 0)).toBe(true);
    expect(margins[0]).toBeCloseTo(0.45, 1);
    expect(Math.min(...margins)).toBe(margins[0]);
  });
});

describe('M-5 — de asymmetrie die dit zichtbaar maakte, en wat er NIET door beweegt', () => {
  it('met de orde GESTELD verandert het wapenen van A5d.3(ii) helemaal niets', () => {
    /* Dit is waarom de asymmetrie tussen fixture en app nooit is opgevallen:
     * de verzameling is {gesteld} ∪ {geëist}, en op casus 1 zijn beide 4. */
    const stated = ordersOn('stated');
    const statedArmed = buildCandidateField({
      windowInputs: WIS,
      perPair: casus1M5PerPair(WIS, 'armed').map((p) => ({ ...p, statedOrder: CASUS1_FIELD_STATED_ORDER })),
      alignments: CASUS1_FIELD_ALIGNMENTS,
    }).orders.map((o) => [...o.orders]);
    expect(stated).toEqual([[4], [4]]);
    expect(statedArmed).toEqual(stated);
  });

  it('de afleiding is op m3 en koan677 IDENTIEK — M-3 bewoog de FASE van de mid en geen venster', () => {
    const k = reportOn('koan677');
    const fingerprint = (r: EngineV2Report) =>
      r.predesign.windowInputs.flatMap((wi) =>
        [2, 4].map((order) => {
          const w = crossoverWindow({ ...wi, order });
          return `${wi.lower}→${wi.upper}|${order}|${w.floorHz}|${w.ceilingHz}|${w.floorBy?.rule}|${w.ceilingBy?.rule}|${w.empty}`;
        }),
      );
    expect(fingerprint(k.report)).toEqual(fingerprint(M3.report));
    expect(ordersOn('armed', k.report)).toEqual(ordersOn('armed'));
  });

  it('P2 — het veld van casus 1 is onaangeraakt: zonder gestelde posities en zonder armen keyt het byte-identiek', () => {
    /* M-5 voegt een LEZING toe en geen veld. `casus1Field(report)` is wat élke
     * casus-1-run bouwt, en de sleutel ervan zit in élke opgenomen
     * run-vingerafdruk van dit boek — dus de twee dingen die M-5 aan een veld
     * KAN toevoegen moeten er afwezig in zijn, en niet leeg-maar-aanwezig. */
    const bare = casus1Field(M3.report);
    expect(bare.orders.map((o) => o.orders)).toEqual([[4], [4]]);
    const key = candidateFieldKey(bare.field) as {
      parameters: Record<string, unknown>;
      candidates: Record<string, unknown>[];
    };
    expect('statedSize' in key.parameters).toBe(false);
    for (const c of key.candidates) expect('inverted' in c).toBe(false);
    for (const c of bare.field.candidates) {
      expect(c.stated).toBeUndefined();
      expect(c.polarity).toBeUndefined();
    }
    /* En de TEGENPROEF, want zonder haar is de claim ook waar voor een veld dat
     * M-5's toevoegingen nergens kan dragen: mét gestelde posities en armen
     * staan beide sleutels er wél. */
    const armed = candidateFieldKey(
      casus1Field(M3.report, { perAxisHz: CASUS1_M5_STATED_PER_AXIS_HZ, on: CASUS1_M5_STATED_ON }, {
        seed: 'both',
        statedAlways: true,
        why: 'M-5 tegenproef',
      }).field,
    ) as { parameters: Record<string, unknown>; candidates: Record<string, unknown>[] };
    expect('statedSize' in armed.parameters).toBe(true);
    expect(armed.candidates.some((c) => 'inverted' in c)).toBe(true);
  });
});

describe('M-5 — het veld dat gedraaid is', () => {
  const branchOf = (byId: Record<string, GriddedResponse | undefined>) => (id: string): PolarityBranch | null => {
    const r = byId[id];
    return r ? { response: r, adjust: {} } : null;
  };
  const marginFor = polarityMarginReader(
    branchOf({ woofer: M3.gridded.w, mid: M3.gridded.m, tweeter: M3.gridded.t }),
  );
  const field = buildCandidateField({
    windowInputs: WIS,
    perPair: casus1M5PerPair(WIS, 'armed'),
    alignments: CASUS1_FIELD_ALIGNMENTS,
    chainBudget: CASUS1_FIELD_CHAIN_BUDGET,
    positionPolicy: CASUS1_FIELD_POSITION_POLICY,
    statedPerAxisHz: CASUS1_M5_STATED_PER_AXIS_HZ,
    statedOn: CASUS1_M5_STATED_ON,
    polarityArms: {
      seed: 'both',
      marginFor,
      statedAlways: true,
      why: 'M-5: beide armen van élke overname.',
    },
  });
  const stated = field.field.candidates.filter((c) => c.stated);

  it('drie posities × twee toegelaten uitlijningen × vier polariteitsconfiguraties = 24 rijen', () => {
    expect(stated.length).toBe(24);
    expect(new Set(stated.map((c) => c.crossings[0].hz)).size).toBe(3);
    expect(new Set(stated.map((c) => `${c.crossings[0].alignment.kind}${c.crossings[0].alignment.order}`))).toEqual(
      new Set(['LR2', 'LR4']),
    );
    /* De mid→tweeter-as draagt maar ÉÉN uitlijning, en dat is de afleiding en
     * geen bezuiniging. */
    expect(new Set(stated.map((c) => c.crossings[1].alignment.order))).toEqual(new Set([4]));
    /* GEEN van de 24 staat buiten zijn venster, en dat is hier een claim en
     * geen toeval: de drie posities komen uit het afgeleide veld zelf, dus U-5's
     * verdict-machinerie heeft op deze rijen niets te melden. */
    for (const c of stated) {
      expect(c.stated!.outsideWindow, c.label).toBe(false);
      expect(c.stated!.perCrossing.flatMap((p) => p.breaches).length, c.label).toBe(0);
    }
  });

  it('de H-4b-valstrik: op een LR2-veld is de TEXTBOOK-arm degene die mid én tweeter omkeert', () => {
    /* De markering noemt de WEGEN die een bouwer omgekeerd soldeert en niet de
     * ARM, en op LR2 zeggen de twee het tegenovergestelde van op LR4. Beide
     * helften staan in het label, en deze claim is waarom. */
    const lr2 = stated.filter((c) => c.crossings[0].alignment.order === 2);
    const lr4 = stated.filter((c) => c.crossings[0].alignment.order === 4);
    expect(lr2.filter((c) => c.polarity!.arm === 'textbook').map((c) => [...c.polarity!.invertedWays])).toEqual(
      [['mid', 'tweeter'], ['mid', 'tweeter'], ['mid', 'tweeter']],
    );
    expect(lr4.filter((c) => c.polarity!.arm === 'textbook').map((c) => [...c.polarity!.invertedWays])).toEqual(
      [[], [], []],
    );
    for (const c of stated) expect(c.label).toContain(c.polarity!.arm);
  });
});

describe('M-5 — de opgenomen tabel', () => {
  const TAB = JSON.parse(readFileSync(TABLE, 'utf8')) as {
    meetsets: string[];
    afleiding_is_meetsetonafhankelijk: boolean;
    gestelde_posities_hz: number[][];
    afleiding: {
      paar: string;
      orde: number;
      leeg: boolean;
      vloer_regel: string | null;
      toegelaten: Record<string, boolean>;
      grond_db: { deliveredDb: number; needDb: number; shortDb: number } | null;
    }[];
  };

  it('zij is op BEIDE meetsets gemeten en zegt dat de afleiding er niet van afhangt', () => {
    expect(TAB.meetsets).toEqual(['m3', 'koan677']);
    expect(TAB.afleiding_is_meetsetonafhankelijk).toBe(true);
    expect(TAB.gestelde_posities_hz).toEqual(CASUS1_M5_STATED_PER_AXIS_HZ.map((a) => [...a]));
  });

  it('elke afleidingsrij reproduceert uit een verse meting', () => {
    for (const row of TAB.afleiding) {
      const wi = WIS.find((w) => `${w.lower}→${w.upper}` === row.paar)!;
      const w = crossoverWindow({ ...wi, order: row.orde });
      const empty = w.empty || w.floorHz === null || w.ceilingHz === null || !(w.ceilingHz > w.floorHz);
      expect(empty, `${row.paar} orde ${row.orde}`).toBe(row.leeg);
      expect(w.floorBy?.rule ?? null).toBe(row.vloer_regel);
    }
    const mtLr2 = TAB.afleiding.find((r) => r.paar.startsWith('mid') && r.orde === 2)!;
    expect(mtLr2.leeg).toBe(true);
    expect(Object.values(mtLr2.toegelaten).some(Boolean)).toBe(false);
    expect(mtLr2.grond_db!.shortDb).toBeCloseTo(4.19, 2);
  });
});

describe('M-5 — wat de 48 ketenruns opleverden', () => {
  const TAB = JSON.parse(readFileSync(TABLE, 'utf8')) as {
    meetsets: string[];
    per_meetset: Record<
      string,
      {
        tegenhangers: Record<string, { rmsJudgedDb: number; mk: { graden: number | null }[]; dissipatiePct: number; onderdelen: number; bomEur: number }>;
        rijen: {
          lowHz: number;
          lowAlign: string;
          arm: string;
          inverted: string[];
          delivered: boolean;
          refusal: { kinds: string[]; reason: string } | null;
          tegenhanger: string | null;
          vector: {
            crossingsHz: number[];
            rmsJudgedDb: number;
            mk: { paar: string; graden: number | null }[];
            dissipatiePct: number;
            onderdelen: number;
            bomEur: number;
          } | null;
        }[];
      }
    >;
  };
  const all = TAB.meetsets.flatMap((s) => TAB.per_meetset[s].rijen.map((r) => ({ set: s, ...r })));

  it('48 rijen over twee meetsets, en élke rij heeft een tegenhanger in het levende corpus', () => {
    expect(all.length).toBe(48);
    for (const r of all) expect(r.tegenhanger, `${r.set} ${r.lowHz} ${r.lowAlign}`).not.toBeNull();
  });

  it('GEEN ENKELE LR2-TEXTBOOKARM LEVERT — zes van zes geweigerd, op beide sets en op alle drie de posities', () => {
    /* DE SCHERPSTE UITKOMST VAN DEZE SESSIE, en zij snijdt de andere kant op
     * dan M-1 sneed. De arm die de literatuur voor LR2 als de JUISTE aanwijst
     * — de omkering die Rane Note 160 voorschrijft — is precies de arm die op
     * deze luidspreker onder deze eisen niet gebouwd kan worden. Wat er wél
     * levert zijn SPIEGELarmen, en die betalen het in fasetracking. */
    const tb = all.filter((r) => r.lowAlign === 'LR2' && r.arm === 'textbook');
    expect(tb.length).toBe(6);
    for (const r of tb) expect(r.delivered, `${r.set} ${r.lowHz}`).toBe(false);
    for (const r of tb) expect(r.refusal!.kinds.length).toBeGreaterThan(0);
  });

  it('élke LR2-LEVERING is een spiegelarm, en haar W-M-fasetracking is slechter dan die van haar tegenhanger', () => {
    const lr2 = all.filter((r) => r.lowAlign === 'LR2' && r.vector);
    expect(lr2.length).toBeGreaterThan(0);
    for (const r of lr2) {
      expect(r.arm).toBe('mirror');
      const ref = TAB.per_meetset[r.set].tegenhangers[r.tegenhanger!];
      expect(r.vector!.mk[0].graden!, `${r.set} ${r.lowHz}`).toBeGreaterThan(ref.mk[0].graden!);
    }
  });

  it('en zij WINNEN op de rekening: minder onderdelen, minder dissipatie, goedkopere BOM dan hun tegenhanger', () => {
    /* Het antwoord op de vraag van de sessie, en het is niet "nee": er bestaat
     * wel degelijk een LR2-vorm die een KAND-V2 verslaat — op drie kolommen,
     * alle drie de BOUWkant, en op geen enkele akoestische. */
    const lr2 = all.filter((r) => r.lowAlign === 'LR2' && r.vector);
    for (const r of lr2) {
      const ref = TAB.per_meetset[r.set].tegenhangers[r.tegenhanger!];
      expect(r.vector!.onderdelen, `${r.set} ${r.lowHz} n`).toBeLessThan(ref.onderdelen);
      expect(r.vector!.dissipatiePct, `${r.set} ${r.lowHz} diss`).toBeLessThan(ref.dissipatiePct);
      expect(r.vector!.bomEur, `${r.set} ${r.lowHz} BOM`).toBeLessThan(ref.bomEur);
    }
  });

  it('M-D is de dominante weigeringsgrond, en dat geldt voor BEIDE uitlijningen — het is geen LR2-eigenschap', () => {
    /* Zonder deze claim leest de tabel als "LR2 valt om op het LF-budget".
     * Hij valt daarop om, en LR4 net zo goed: het budget bijt op de SERIESPOEL
     * van de laagste weg, en die staat er in beide uitlijningen. */
    const refused = all.filter((r) => !r.delivered);
    const budgetOf = (a: string) =>
      refused.filter((r) => r.lowAlign === a && r.refusal!.kinds.includes('budget')).length;
    expect(budgetOf('LR2')).toBeGreaterThan(0);
    expect(budgetOf('LR4')).toBeGreaterThan(0);
    expect(budgetOf('LR2') + budgetOf('LR4')).toBeGreaterThan(refused.length / 2);
  });

  it('DE GESTELDE KOOI IS NIET GEKNIPT, en de meting laat zien wat dat doet: de tune verlaat het M-T-venster', () => {
    /* U-5 knipt een GESTELDE kooi met opzet niet tegen het venster — dat zou
     * een tune terugslepen naar een rand waar de ontwerper overheen stapte.
     * Op een positie die BINNEN haar venster ligt heeft dat een gevolg dat
     * niemand gesteld heeft: de kooi reikt eroverheen en de tune loopt erin.
     * Gemeten en niet weggepoetst — zie de open punten van M-5. */
    const ceiling = crossoverWindow({ ...MT, order: 4 }).ceilingHz!;
    const delivered = all.filter((r) => r.vector);
    const out = delivered.filter((r) => r.vector!.crossingsHz[1] > ceiling);
    expect(delivered.length).toBeGreaterThan(0);
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThan(delivered.length);
  });

  it('de bevroren M5-netlists zijn ONTWERPEN: élke gewapende poort staat, en het manifest noemt ze allemaal', () => {
    const golden = loadGolden() as unknown as {
      manifest_en_geometrie: { netlists: Record<string, string>; m5_corpus: { meetset: string; bestanden: { naam: string }[] } };
      kandidaten: Record<string, { klasse: string; klasse_toelichting: string }>;
    };
    const corpus = golden.manifest_en_geometrie.m5_corpus;
    const keys = Object.keys(golden.manifest_en_geometrie.netlists).filter((k) => /^M5_KAND_\d+$/.test(k));
    /* Alleen de meetset die BEVROREN is — de andere helft is een kolom van de
     * tabel en geen ontwerp (zie `register-m5-candidates.ts`). */
    const frozenSet = corpus.meetset;
    const deliveredThere = TAB.per_meetset[frozenSet].rijen.filter((r) => r.delivered);
    expect(keys.length).toBe(deliveredThere.length);
    expect(corpus.bestanden.map((b) => b.naam).sort()).toEqual(keys.sort());
    for (const k of keys) {
      expect(golden.kandidaten[k]?.klasse).toBe('B');
      expect(golden.kandidaten[k].klasse_toelichting).toContain('ONTWERP en geen meetobject');
    }
    for (const r of deliveredThere) {
      for (const g of (r as unknown as { gates: { active: boolean; pass: boolean; gate: string }[] }).gates) {
        if (g.active) expect(g.pass, `${r.lowAlign} ${r.lowHz} ${g.gate}`).toBe(true);
      }
    }
  });
});
