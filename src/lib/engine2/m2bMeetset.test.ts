/**
 * M-2b — DE 67,7 L-MEETSET IS DE MEETBASIS VAN CASUS 1, EN DIT IS DE ACCEPTATIE.
 *
 * WAT DEZE SESSIE DOET. De wooferhelft van de M-1-set — twee on-axis merges,
 * twee nabije velden en de parallelle sweep — wordt vervangen door de hermeting
 * van 11-09-2026, getransformeerd naar de echte kast van 67,7 L. De mid en de
 * tweeter blijven wat zij waren. Daarnaast wordt de aanbevolen ONDERGRENS van
 * de tweeter (2200 Hz, BlieSMa) voor het eerst GEVOED: U-4 registreerde hem en
 * weigerde dat te doen omdat het een ander veld en dus een regeneratie is.
 *
 * WAAROM DIT EEN EIGEN BESTAND IS. Een meetsetwissel is de ingrijpendste
 * bewerking in dit project: zij verplaatst élke klasse-A-referentie tegelijk, en
 * "alles is groen" na afloop zegt niets over WAT er bewoog. De claims hier zijn
 * daarom in twee soorten verdeeld en beide soorten dragen: wat de wissel WEL
 * verplaatst (het anker, de gaps, de sweep-afgeleiden) en wat zij NIET
 * verplaatst (de breakup-scan, de geldigheidsvloer, mid en tweeter in hun
 * geheel). Zonder die tweede helft is een wissel niet te onderscheiden van een
 * herschrijving.
 *
 * Leest van schijf, dus het is een test en geen bundelcode.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CASUS1_DIR,
  CASUS1_SESSION_ID,
  CASUS1_WOOFER_DC_OHM,
  casus1ExcursionSettings,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  casus1MaxDriveOnFsDbByDriver,
  casus1MergedSet,
  casus1MinCrossovers,
  casus1Set67L,
  casus1SetOf,
  casus1TargetCurve,
  loadGolden,
  type Casus1MeasurementSet,
} from './casus1.fixture.ts';
import { casus1Field } from './casus1V2.fixture.ts';
import { buildReport, type EngineV2Report, type ReportSettings } from './report.ts';
import { ctcKey } from './metrics/types.ts';
import { parseFrd } from '../parsers/frd.ts';
import { readGateHeader, readMergeBlock } from '../xoWindow.ts';
import { judgedBandFloor } from './predesign/judgedBand.ts';

const golden = loadGolden();
const geometry = casus1Geometry(golden);
const TOL = golden.toleranties;

/** De map met de hermeting en de 67,7 L-merges die eruit volgen. */
const TESTKAST = join(CASUS1_DIR, '..', 'koan_2026-09_testkast');
/** De DEMOset voor dezelfde kast — dezelfde data, een andere vorm. */
const DEMO_67L = join(CASUS1_DIR, '..', 'koan_demo_2026-09_67L');

const settingsFor = (): ReportSettings => ({
  amplifierPowerW: 100,
  verticalWindowDeg: [-15, 15],
  orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
  diMatchToleranceDb: 2,
  reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
  targetCurve: casus1TargetCurve(golden),
  ...casus1ExcursionSettings(golden),
  ...(Object.keys(casus1MaxDriveOnFsDbByDriver(golden)).length > 0
    ? { maxDriveOnFsDbByDriver: casus1MaxDriveOnFsDbByDriver(golden) }
    : {}),
  ...(Object.keys(casus1MinCrossovers(golden)).length > 0
    ? { driverMinCrossoverByDriver: casus1MinCrossovers(golden) }
    : {}),
});

function reportOn(set: Casus1MeasurementSet, extra: Partial<ReportSettings> = {}): EngineV2Report {
  const manifest = casus1Manifest(golden, set);
  const files = casus1Files(manifest);
  return buildReport({
    manifest,
    files,
    filter: casus1Filter('HUIDIG', manifest, files, golden),
    geometry,
    settings: { ...settingsFor(), ...extra },
  });
}

const NEW = reportOn('koan677');
const OLD = reportOn('merged');
const drv = (r: EngineV2Report, n: string) => r.ingest.drivers.find((d) => d.driver === n)!;

/** De datarijen van een FRD, zodat een kopheader een vergelijking niet stuurt. */
function rows(path: string): { freq: number[]; spl: number[]; phase: number[] } {
  const f = parseFrd(readFileSync(path, 'latin1'));
  return { freq: f.freq, spl: f.spl, phase: f.phase };
}
const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

describe('M-2b — de meetset', () => {
  it('drie sets, elk met een eigen sessie-id, en casus1SetOf leest hem terug', () => {
    /* De sessie-id is niet decoratief: `casus1Files` leidt er de MAP van elk
     * bestand uit af, en zonder die stap zou een set de nabije velden van de
     * andere lezen — de twee sessies dragen bestanden met dezelfde NAAM. */
    const ids = new Set(Object.values(CASUS1_SESSION_ID));
    expect(ids.size).toBe(4);
    for (const set of ['m3', 'koan677', 'merged', 'gated'] as const) {
      const m = casus1Manifest(golden, set);
      expect(m.sessionId).toBe(CASUS1_SESSION_ID[set]);
      expect(casus1SetOf(m)).toBe(set);
    }
  });

  it('de 67,7 L-set is GEDATEERD sinds M-3 en blijft bij naam bereikbaar', () => {
    /* Tot M-3 was dit "de standaard"; sinds M-3 is de standaard `'m3'` — de
     * M-2b-set plus de hermergde mid — en die claim woont in `midM3.test.ts`,
     * bij de sessie die haar zette. Wat HIER telt is dat de M-2b-set bereikbaar
     * BLIJFT: elke referentie en elk corpus van vóór M-3 is erop gemeten, en
     * een gedateerde brug die je niet meer kunt aanroepen bewijst niets. */
    expect(casus1SetOf(casus1Manifest(golden, 'koan677'))).toBe('koan677');
    expect(casus1SetOf(casus1Manifest(golden))).not.toBe('koan677');
  });

  it('zij vervangt precies de WOOFERHELFT: vijf bestanden, en mid en tweeter bij naam niet', () => {
    const swap = casus1Set67L(golden);
    expect(Object.keys(swap).sort()).toEqual(
      [
        'woofer_down_hor_0_koan677_merged.frd',
        'woofer_down_near.txt',
        'woofer_up_hor_0_koan677_merged.frd',
        'woofer_up_near.txt',
        'woofers_parallel.lim',
      ].sort(),
    );
    /* Elke vervanging is er een van de WOOFER — de claim die "de wooferhelft"
     * hard maakt, en zij is per bestand en niet als telling (de V47/V48-les). */
    for (const [file, tag] of Object.entries(swap)) {
      expect(tag.drv, `${file} vervangt iets van een andere weg`).toBe('woofer');
      expect(tag.map).toBe('koan_2026-09_testkast');
    }
    /* De MID houdt haar M-1-merge en de TWEETER haar gepoorte verre veld: een
     * gesloten pod en een waveguide voelen het kastvolume niet (M-2). */
    const files = casus1Manifest(golden, 'koan677').entries.map((e) => e.file);
    expect(files).toContain('Koan_M_merged.frd');
    expect(files).toContain('tweeter_hor_0.txt');
    expect(files).toContain('mid.lim');
    expect(files).toContain('tweeter.lim');
    /* ...en de M-1-merge van de MID komt uit het M-1-blok, niet uit het nieuwe:
     * de 67,7 L-set is een LAAG erbovenop en geen tweede complete set. */
    expect(Object.keys(casus1MergedSet(golden))).toContain('Koan_M_merged.frd');
  });

  it('zij vervangt IN DE PLAATS: zelfde weg, zelfde soort, zelfde hoek, zelfde volgorde', () => {
    /* De M-1-vorm, een set verder: het manifest moet lezen als EEN sessie met
     * bestanden verwisseld en niet als een tweede sessie ernaast. */
    const gated = casus1Manifest(golden, 'gated');
    const nu = casus1Manifest(golden, 'koan677');
    expect(nu.entries.length).toBe(gated.entries.length);
    const swap = { ...casus1MergedSet(golden), ...casus1Set67L(golden) };
    for (const [i, g] of gated.entries.entries()) {
      const m = nu.entries[i];
      const hits = Object.entries(swap).filter(([, t]) => t.vervangt === g.file);
      /* De 67,7 L-laag ligt BOVENOP de M-1-laag, dus een gepoort bestand dat
       * beide vervangen kan er twee kandidaten hebben — en dan wint de
       * nieuwste. Dat is de laagregel, en zij wordt hier getoetst en niet
       * aangenomen. */
      const won = hits.find(([f]) => f in casus1Set67L(golden)) ?? hits[0];
      expect(m.file).toBe(won ? won[0] : g.file);
      expect(m.driver).toBe(g.driver);
      expect(m.kind).toBe(g.kind);
      expect(m.angleDeg).toBe(g.angleDeg);
    }
    /* De twee wooferbestanden zijn precies de plek waar de lagen elkaar raken. */
    const wooferFf = nu.entries.filter((e) => e.driver === 'woofer' && e.kind === 'FF').map((e) => e.file);
    expect(wooferFf).toEqual(['woofer_up_hor_0_koan677_merged.frd', 'woofer_down_hor_0_koan677_merged.frd']);
  });

  it('het opgeschreven meetset-parameterblok reproduceert uit de bestanden zelf', () => {
    /* V15's regel op de meetset: een parameterblok dat kan wegdrijven van het
     * bestand dat het beschrijft, drijft weg. Het is gegenereerd uit de koppen
     * (scripts/record-casus1-67l-set.ts) en dit houdt de engine eraan. */
    const P = (golden.manifest_en_geometrie as unknown as {
      meetset_2026_09_67L: { meetset_parameters: Record<string, Record<string, unknown>>; map: string };
    }).meetset_2026_09_67L;
    for (const [file, tag] of Object.entries(casus1Set67L(golden))) {
      const rec = P.meetset_parameters[file];
      expect(rec, `${file}: geen parameterblok`).toBeTruthy();
      expect(rec.vervangt).toBe(tag.vervangt);
      if (tag.typ !== 'FF') continue;
      const blk = readMergeBlock(readFileSync(join(TESTKAST, file), 'latin1'))!;
      expect(rec.geldig_van_Hz).toBe(blk.validFromHz);
      expect(rec.splice_band_Hz).toEqual(blk.spliceBandHz ?? null);
      expect(rec.FF_bron).toBe(blk.ffSource ?? null);
    }
  });

  it('de naamsbotsing wordt PER SET opgelost: de twee nabije velden zijn verschillende metingen', () => {
    /* `woofer_up_near.txt` bestaat in beide mappen met andere inhoud. Een
     * opzoeking op NAAM alleen zou een set stilletjes de meting van de andere
     * geven, en dat is precies wat `fileDirs` per set voorkomt. */
    const a = rows(join(CASUS1_DIR, 'woofer_up_near.txt'));
    const b = rows(join(TESTKAST, 'woofer_up_near.txt'));
    expect(a.freq.length).toBe(b.freq.length);
    const worst = Math.max(...a.spl.map((v, i) => Math.abs(v - b.spl[i])));
    expect(worst).toBeGreaterThan(1);

    const near = (set: Casus1MeasurementSet) => {
      const m = casus1Manifest(golden, set);
      const f = casus1Files(m);
      const i = m.entries.findIndex((e) => e.file === 'woofer_up_near.txt');
      expect(i).toBeGreaterThanOrEqual(0);
      return f[i].response!.spl;
    };
    expect(near('koan677')).toEqual(b.spl);
    expect(near('merged')).toEqual(a.spl);
    expect(near('gated')).toEqual(a.spl);
  });
});

describe('M-2b — wat de wissel NIET verplaatst', () => {
  it('de breakup-scan van de woofer is identiek: zij leeft boven de splice', () => {
    /* Beide merges dragen boven hun crossfade hetzelfde ONAANGEROERDE verre
     * veld, dus de eerste significante breakup — waar het W-M-plafond op staat
     * — is dezelfde piek met dezelfde ernst en dezelfde Q. Niet "binnen de
     * klasse" maar IDENTIEK, en dat is de scherpere claim. */
    const sig = (r: EngineV2Report) => drv(r, 'woofer').breakups!.peaks.filter((p) => p.dB >= 2.5);
    const a = sig(OLD);
    const b = sig(NEW);
    expect(b.length).toBe(a.length);
    for (const [i, p] of a.entries()) {
      expect(b[i].fHz).toBe(p.fHz);
      expect(b[i].dB).toBe(p.dB);
      expect(b[i].q).toBe(p.q);
    }
  });

  it('de geldigheidsvloer en het W-M-plafond bewegen niet', () => {
    expect(drv(NEW, 'woofer').onAxis!.bandHz[0]).toBe(drv(OLD, 'woofer').onAxis!.bandHz[0]);
    expect(drv(NEW, 'woofer').onAxis!.bandFloorProvenance).toBe('merge-block');
    const wm = (r: EngineV2Report) => r.predesign.windows.find((w) => w.lower === 'woofer')!;
    expect(wm(NEW).ceilingHz).toBe(wm(OLD).ceilingHz);
    expect(wm(NEW).ceilingBy!.rule).toBe('breakup');
  });

  it('mid en tweeter zijn in hun geheel onaangeraakt', () => {
    for (const way of ['mid', 'tweeter']) {
      const a = drv(OLD, way);
      const b = drv(NEW, way);
      expect(b.onAxis!.bandHz).toEqual(a.onAxis!.bandHz);
      expect(b.impedance!.fundamentalHz).toBe(a.impedance!.fundamentalHz);
      expect(b.re!.ohm).toBe(a.re!.ohm);
    }
  });

  it('f_p beweegt niet, en dat is een eigenschap van de SWEEP en niet van de kast', () => {
    /* De geoordeelde band begint op f_p — de bovenste reflexpiek. Beide
     * sweeps zijn in de 53,2 L-TESTKAST gemeten en beide leggen die piek op
     * hetzelfde rasterpunt, dus de band begint waar zij begon. In de ECHTE
     * kast ligt f_p lager (dezelfde poort in 67,7 L stemt lager af), dus de
     * band is daar CONSERVATIEF en nooit permissief — het sweep_frame-blok
     * van het manifest zegt dat per lezer. */
    const a = judgedBandFloor(OLD)!;
    const b = judgedBandFloor(NEW)!;
    expect(b.fpHz).toBe(a.fpHz);
    expect(b.floorHz).toBe(a.floorHz);
    expect(b.validityFloorHz).toBe(a.validityFloorHz);
  });
});

describe('M-2b — wat de wissel WEL verplaatst', () => {
  it('HET ANKER KANTELT: de mid was het, de woofer is het, en X gaat van positief naar nul', () => {
    const a = OLD.predesign.gaps!;
    const b = NEW.predesign.gaps!;
    expect(a.anchor).toBe('mid');
    expect(b.anchor).toBe('woofer');
    /* De TEGENPROEF die het een bevinding maakt: op de M-1-set is het anker
     * NIET de laagste weg en vuurt A5d.4(b)'s waarschuwing; op de nieuwe set
     * is het dat wel en zwijgt zij. Beide helften, want een `null` op zichzelf
     * is ook waar van een rapport dat nooit gekeken heeft. */
    expect(b.anchor).toBe(NEW.driversLowToHigh[0]);
    expect(a.anchor).not.toBe(OLD.driversLowToHigh[0]);
    expect(a.anchorSwitchWarning).toContain('NOT the lowest way');
    expect(b.anchorSwitchWarning).toBeNull();
    /* X is wat de CONFIGURATIE aan niveauwerk op de laagste weg VRAAGT, en de
     * V51-eis verbiedt het. Op de M-1-set vroeg zij erom; nu niet meer. */
    expect(OLD.predesign.levelWork!.aboveAnchorDb).toBeGreaterThan(0);
    expect(NEW.predesign.levelWork!.aboveAnchorDb).toBe(0);
  });

  it('het opgeschreven ankerblok reproduceert, en zijn brug ook', () => {
    const vg = golden.verankerde_gaps_dB;
    expect(vg.anker).toBe(NEW.predesign.gaps!.anchor);
    const live = vg.gaps_tov_anker;
    for (const [way, dB] of Object.entries(live)) {
      expect(NEW.predesign.gaps!.ways.find((x) => x.driver === way)!.gapToAnchorDb).toBeCloseTo(dB, 2);
    }
    const bridge = vg._waarden_M1_tot_M2b as unknown as {
      anker: string;
      woofer_tov_mid: number;
      tweeter_tov_mid: number;
    };
    expect(bridge.anker).toBe('mid');
    const gap = (r: EngineV2Report, d: string) => r.predesign.gaps!.ways.find((x) => x.driver === d)!.gapToAnchorDb;
    /* THE BRIDGE IS A DATED READING and is reproduced with the inputs of its
     * own day: the recommended lower bound did not exist then, and it moves
     * the M-T window, which moves the way BANDS the gaps are averaged over.
     * Measuring a dated value with today's inputs would quietly rewrite it —
     * the same discipline every other dated bridge in this suite follows. */
    const OLD_DATED = reportOn('merged', { driverMinCrossoverByDriver: {} });
    expect(gap(OLD_DATED, 'woofer')).toBeCloseTo(bridge.woofer_tov_mid, 2);
    expect(gap(OLD_DATED, 'tweeter')).toBeCloseTo(bridge.tweeter_tov_mid, 2);
    /* ...and the same two on TODAY's inputs are recorded beside them, so the
     * two readings of one corpus are both checkable. */
    const fresh = (bridge as unknown as { vers_nagemeten: { woofer_tov_mid: number; tweeter_tov_mid: number } }).vers_nagemeten;
    expect(gap(OLD, 'woofer')).toBeCloseTo(fresh.woofer_tov_mid, 2);
    expect(gap(OLD, 'tweeter')).toBeCloseTo(fresh.tweeter_tov_mid, 2);
  });

  it('de sweep-afgeleiden bewegen, en het casusboek draagt de nieuwe naast de oude', () => {
    const w = golden.afgeleide_parameters.woofer as Record<string, number> & {
      _waarden_M1_tot_M2b: Record<string, number>;
    };
    const br = w._waarden_M1_tot_M2b;
    const rx = (r: EngineV2Report) => drv(r, 'woofer').impedance!.reflex!;
    /* De twee reflexfrequenties onder f_p bewegen allebei MEER dan de
     * frequentieklasse: dat is wat "een andere sweep" betekent, en het is de
     * reden dat dit blok herleid is in plaats van overgenomen. */
    expect(Math.abs(rx(NEW).fLHz / rx(OLD).fLHz - 1) * 100).toBeGreaterThan(TOL.frequenties_pct);
    expect(Math.abs(rx(NEW).fbHz / rx(OLD).fbHz - 1) * 100).toBeGreaterThan(TOL.frequenties_pct);
    expect(rx(NEW).fLHz).toBeCloseTo(w.fL, 1);
    expect(rx(NEW).fbHz).toBeCloseTo(w.fb, 1);
    expect(rx(OLD).fLHz).toBeCloseTo(br.fL, 1);
    expect(rx(OLD).fbHz).toBeCloseTo(br.fb, 1);
    /* ...en de directe R_e-aflezing draagt op deze sweep MEER motionele rok
     * dan op de vorige: V8d's bevinding, groter geworden. */
    expect(drv(NEW, 'woofer').re!.motionalSkirtOhm!).toBeGreaterThan(drv(OLD, 'woofer').re!.motionalSkirtOhm!);
  });

  it('de V8d-claim "de fit landt op de meterlezing" is op deze sweep ONWAAR, en dat staat er', () => {
    /* Geen versoepelde tolerantie: de afstand wordt gemeten en opgeschreven.
     * Op de M-1-sweep landde de fit 0,004 Ω van de meterlezing van het
     * casusboek; op de sweep van 11-09 landt hij erbuiten. De ingevoerde DC
     * die de route gebruikt is een ANDERE lezing (3,05 Ω) en die verandert
     * niet, dus geen enkele poort of grens beweegt hierdoor. */
    const bare = (set: Casus1MeasurementSet) => {
      const m = casus1Manifest(golden, set);
      const f = casus1Files(m);
      return buildReport({ manifest: m, files: f, filter: casus1Filter('HUIDIG', m, f, golden), geometry, settings: {} });
    };
    const blk = (golden.afgeleide_parameters.woofer as Record<string, unknown>).Re_meterlezing as Record<string, number>;
    const meter = blk.meterlezing_casusboek_ohm;
    const fitNew = drv(bare('koan677'), 'woofer').re!.ohm;
    const fitOld = drv(bare('merged'), 'woofer').re!.ohm;
    expect(Math.abs(fitOld - meter)).toBeLessThanOrEqual(TOL.ohm);
    expect(Math.abs(fitNew - meter)).toBeGreaterThan(TOL.ohm);
    expect(fitNew).toBeCloseTo(blk.fit_M2b_ohm, 3);
    expect(Math.abs(fitNew - meter)).toBeCloseTo(blk.afstand_tot_casusboek_ohm, 3);
    /* Hij landt WEL dichter bij de lezing die de route invoert — de bevinding
     * die het blok noemt, en zij gaat over de twee SESSIES en niet over de
     * schatter. */
    expect(Math.abs(fitNew - CASUS1_WOOFER_DC_OHM)).toBeLessThan(Math.abs(fitNew - meter));
    /* En wat de route invoert is onveranderd, dus M-E, de Q_es-grens en elke
     * poort die door R_e deelt lezen wat zij lazen. */
    expect(drv(NEW, 'woofer').re!.ohm).toBe(CASUS1_WOOFER_DC_OHM);
    expect(drv(OLD, 'woofer').re!.ohm).toBe(CASUS1_WOOFER_DC_OHM);
  });
});

describe('M-2b — de aanbevolen ondergrens van de tweeter wordt gevoed', () => {
  it('2200 Hz bindt de M-T-vloer, verbatim, en het venster krimpt tot één positie', () => {
    const mt = (r: EngineV2Report) => r.predesign.windows.find((w) => w.lower === 'mid')!;
    const w = mt(NEW);
    expect(w.floorBy!.rule).toBe('stated-min');
    expect(w.floorHz).toBe(2200);
    /* VERBATIM en niet geïnverteerd: de gestelde orde (4) is STEILER dan die
     * waarbij het blad de aanbeveling doet (2), en een ondergrens wordt alleen
     * opgetild voor een ONDIEPERE flank (U-3g). */
    expect(casus1MinCrossovers(golden).tweeter.hz).toBe(2200);
    expect(casus1MinCrossovers(golden).tweeter.order).toBe(2);
    /* De TEGENPROEF: zonder de ondergrens is de vloer weer A5e.3b's
     * drive-stated, en het venster is bijna een halve octaaf breed. */
    const zonder = reportOn('koan677', { driverMinCrossoverByDriver: {} });
    expect(mt(zonder).floorBy!.rule).toBe('drive-stated');
    expect(mt(zonder).floorHz!).toBeLessThan(1700);
    expect(Math.log2(w.ceilingHz! / w.floorHz!)).toBeLessThan(Math.log2(mt(zonder).ceilingHz! / mt(zonder).floorHz!));
  });

  it('het veld krimpt van zestien naar elf, en de M-T-as draagt nog één positie', () => {
    const f = casus1Field(NEW).field;
    expect(f.candidates.length).toBe(11);
    expect(f.parameters.derivedSize).toBe(11);
    /* Onder het budget, dus er is NIETS gedund: wat het veld kleiner maakt is
     * de grens en niet de begroting. */
    expect(f.parameters.derivedSize).toBeLessThanOrEqual(Number(f.parameters.chainBudget));
    /* Index 1, not a name match: the LOWER axis is labelled "woofer→mid" and
     * contains the word too — the kind of near-miss that makes a guard pass
     * for the wrong reason. */
    const mtAxis = f.axes[1];
    expect(mtAxis.pairLabel).toContain('tweeter');
    expect(mtAxis.positionsByOrder.reduce((n, p) => n + p.count, 0)).toBe(1);
    /* Elke kandidaat draagt dezelfde M-T-positie, en zij ligt binnen het
     * venster met een tweezijdige kooi (C-2). */
    const hz = new Set(f.candidates.map((c) => c.crossings[1].hz));
    expect(hz.size).toBe(1);
    for (const c of f.candidates) {
      expect(c.crossings[1].cageHz[0]).toBeGreaterThanOrEqual(2200);
      expect(c.crossings[1].cageHz[1]).toBeLessThanOrEqual(2304.1);
    }
  });

  it('het opgeschreven venster reproduceert, en zijn afgeleide-vloer-brug ook', () => {
    const kv = golden.kruisvensters.mid_tweeter_orde4 as Record<string, unknown> & {
      venster: [number, number];
      vloer_bindend: string;
      _afgeleide_vloer_tot_M2b: { venster: [number, number]; vloer_bindend: string };
    };
    const w = NEW.predesign.windows.find((x) => x.lower === 'mid')!;
    expect(Math.round(w.floorHz!)).toBe(kv.venster[0]);
    expect(Math.round(w.ceilingHz!)).toBe(kv.venster[1]);
    expect(kv.vloer_bindend).toBe('aanbevolen_ondergrens');
    const zonder = reportOn('koan677', { driverMinCrossoverByDriver: {} }).predesign.windows.find((x) => x.lower === 'mid')!;
    expect(Math.round(zonder.floorHz!)).toBe(kv._afgeleide_vloer_tot_M2b.venster[0]);
    expect(kv._afgeleide_vloer_tot_M2b.vloer_bindend).toBe('aandrijving_gesteld');
  });

  it('het PLAFOND blijft de ONGEKALIBREERDE breakup-deler, en het venster zegt dat', () => {
    /* De spanning die dit venster draagt: de aanbeveling van de tweeter en de
     * breakup-afleiding van de mid liggen 0,07 octaaf uit elkaar, en de
     * bovenste van die twee rust op een deler die niemand gemeten heeft. Een
     * venster van deze breedte op een ongekalibreerde grens is een bevinding
     * en geen ontwerpruimte. */
    const w = NEW.predesign.windows.find((x) => x.lower === 'mid')!;
    expect(w.ceilingBy!.rule).toBe('breakup');
    expect(w.ceilingBy!.uncalibrated).toBeTruthy();
    expect(Math.log2(w.ceilingHz! / w.floorHz!)).toBeLessThan(0.1);
  });
});

describe('M-2b — welke invoer M-D verplaatst, en het is niet de kasttransformatie', () => {
  /* DE MEETING DIE DE SESSIE HAAR VOLGENDE VRAAG GEEFT. De wissel verplaatst de
   * resonante opslingering op het bevroren C-2-corpus met +0,31 tot +1,54 dB,
   * tegen een gesteld budget van 1,4 dB — dus het verschil tussen geleverd en
   * geweigerd. Een wissel die drie dingen tegelijk verzet en daarna één getal
   * afdrukt zegt niet WELK van de drie het deed, en zonder dat antwoord is de
   * keuze erna (budget verplaatsen of opnieuw meten) niet te maken. */
  const ARMS = JSON.parse(
    readFileSync(join(CASUS1_DIR, '..', 'casus1_m2b_lf_armen.json'), 'utf-8'),
  ) as {
    gesteld_budget_dB: number;
    onderwerpen: string[];
    resonantDb: Record<string, Record<string, number | null>>;
    delta_tov_m1: Record<string, Record<string, number | null>>;
    aandeel_in_de_verschuiving: Record<string, number | null>;
    boven_budget: Record<string, string[]>;
  };

  it('het NABIJE veld doet het, het verre veld vrijwel niets', () => {
    /* Niet "ongeveer" maar met de getallen: het verre veld — dat de HELE
     * kasttransformatie draagt — staat voor een paar procent van de
     * verschuiving, en het nabije veld voor meer dan het geheel (de sweep werkt
     * ertegen). Dat is de tegenovergestelde volgorde van wat een sessie die
     * "67,7 liter" heet doet verwachten, en het is de reden dat de armen
     * gemeten zijn in plaats van beredeneerd. */
    expect(ARMS.aandeel_in_de_verschuiving.nf!).toBeGreaterThan(1);
    expect(ARMS.aandeel_in_de_verschuiving.ff!).toBeLessThan(0.1);
    expect(ARMS.aandeel_in_de_verschuiving.ff!).toBeLessThan(ARMS.aandeel_in_de_verschuiving.nf!);
  });

  it('de TRANSFORMATIE van het nabije veld herstelt het niet — het is de aandrijftoestand', () => {
    /* De vierde arm beantwoordt de volgende vraag voordat iemand hem stelt: als
     * het FRAME het probleem was, zou het nabije veld naar 67,7 L transformeren
     * het moeten repareren. Het beweegt BEIDE kanten op, dus dat is het niet. */
    const t = ARMS.delta_tov_m1.m2b_nf_transformed;
    const ds = Object.values(t).filter((v): v is number => v !== null);
    expect(ds.some((v) => v > 0)).toBe(true);
    expect(ds.some((v) => v < 0)).toBe(true);
  });

  it('de armen reproduceren uit een VERSE meting, niet alleen uit het bestand', () => {
    /* Anders is dit een JSON die zichzelf citeert. De twee uitersten worden
     * opnieuw gemeten door dezelfde bank die de tabel gebruikte. */
    const lf = (r: EngineV2Report) => r.metrics.lfBump.find((b) => b.driver === 'woofer')!.result.resonantDb!;
    expect(lf(OLD)).toBeCloseTo(ARMS.resonantDb.m1.HUIDIG!, 2);
    expect(lf(NEW)).toBeCloseTo(ARMS.resonantDb.m2b.HUIDIG!, 2);
    expect(ARMS.gesteld_budget_dB).toBe(
      (golden.manifest_en_geometrie as unknown as { gestelde_eisen: { lf_opslingering_budget_dB: number } })
        .gestelde_eisen.lf_opslingering_budget_dB,
    );
  });

  it('het BUDGET is niet onbereikbaar geworden: bijna het hele casusboek blijft erbinnen', () => {
    /* De claim die de bevinding eerlijk houdt. Op de M-1-set gaat GEEN enkele
     * bevroren netlist van het C-2-corpus over het budget; op de 67,7 L-set
     * precies één. Wie de weigeringen van de regeneratie leest als "het budget
     * kan niet meer" leest ze verkeerd: het budget is haalbaar op élk ontwerp
     * dat er al ligt, en wat er niet meer in past zijn de NIEUWE tunes. */
    expect(ARMS.boven_budget.m1).toHaveLength(0);
    expect(ARMS.boven_budget.m2b.length).toBeLessThanOrEqual(1);
    expect(ARMS.onderwerpen.length).toBeGreaterThanOrEqual(10);
  });
});

describe('M-2b — de demoset en de fixture zijn dezelfde data in twee vormen', () => {
  it('het paarbestand van de demo IS de complexe som van de twee per-driver merges', () => {
    /* De identiteit waarop de hele wissel rust: de DEMO draagt het wooferpaar
     * als één bestand omdat een demobundel een bestand per driverblok wil
     * (V13); CASUS 1 draagt de twee apart, omdat zijn manifest en zijn
     * lobing-metriek twee bronnen op twee afstanden kennen (V20). */
    const up = rows(join(TESTKAST, 'woofer_up_hor_0_koan677_merged.frd'));
    const dn = rows(join(TESTKAST, 'woofer_down_hor_0_koan677_merged.frd'));
    const pair = rows(join(DEMO_67L, 'woofer_pair_hor0.frd'));
    expect(pair.freq.length).toBe(up.freq.length);
    const D = Math.PI / 180;
    let worstDb = 0;
    let worstPh = 0;
    for (let i = 0; i < pair.freq.length; i++) {
      const a = Math.pow(10, up.spl[i] / 20);
      const b = Math.pow(10, dn.spl[i] / 20);
      const re = a * Math.cos(up.phase[i] * D) + b * Math.cos(dn.phase[i] * D);
      const im = a * Math.sin(up.phase[i] * D) + b * Math.sin(dn.phase[i] * D);
      worstDb = Math.max(worstDb, Math.abs(20 * Math.log10(Math.hypot(re, im)) - pair.spl[i]));
      worstPh = Math.max(worstPh, Math.abs(wrap((Math.atan2(im, re) * 180) / Math.PI - pair.phase[i])));
    }
    /* De afdrukafronding van de bestanden zelf (drie decimalen), en niets meer. */
    expect(worstDb).toBeLessThanOrEqual(5e-4);
    expect(worstPh).toBeLessThanOrEqual(5e-4);
  });

  it('de tweeter van de demo is dezelfde METING als die van casus 1 — niets is herleid', () => {
    const a = rows(join(CASUS1_DIR, 'tweeter_hor_0.txt'));
    const b = rows(join(DEMO_67L, 'tweeter.frd'));
    expect(b.spl.length).toBe(a.spl.length);
    expect(Math.max(...a.spl.map((v, i) => Math.abs(v - b.spl[i])))).toBe(0);
    expect(Math.max(...a.phase.map((v, i) => Math.abs(wrap(v - b.phase[i]))))).toBe(0);
  });

  it('de MID van de demo is een ANDERE merge, en casus 1 leest hem daarom niet', () => {
    /* Twee redenen, en beide worden gemeten. (1) Onder de splice is het een
     * andere merge van dezelfde metingen (shelf @ 520 Hz, fit 700-1200) en
     * boven 800 Hz zijn zij bit-identiek — dus het verschil is de BEWERKING en
     * niet de meting. (2) Zijn kop stelt zijn geldigheid in PROZA, dus geen van
     * beide lezers van de app haalt er een vloer uit: hem invoeren zou de mid
     * haar geldigheidsvloer kosten en daarmee de verankerde gaps blokkeren
     * (UI-1). */
    const a = rows(join(CASUS1_DIR, 'Koan_M_merged.frd'));
    const b = rows(join(DEMO_67L, 'mid.frd'));
    expect(b.spl.length).toBe(a.spl.length);
    const below = a.spl.map((v, i) => (a.freq[i] < 800 ? Math.abs(v - b.spl[i]) : 0));
    const above = a.spl.map((v, i) => (a.freq[i] >= 800 ? Math.abs(v - b.spl[i]) : 0));
    expect(Math.max(...below)).toBeGreaterThan(1);
    expect(Math.max(...above)).toBe(0);

    const text = readFileSync(join(DEMO_67L, 'mid.frd'), 'latin1');
    expect(readMergeBlock(text)).toBeNull();
    expect(readGateHeader(text).kind).not.toBe('parsed');
    /* ...terwijl het bestand dat casus 1 WEL leest er een draagt. */
    const own = readFileSync(join(CASUS1_DIR, 'Koan_M_merged.frd'), 'latin1');
    expect(readMergeBlock(own)).not.toBeNull();
  });

  it('de twee 67,7 L-merges dragen elk een leesbaar mergeblok met dezelfde vloer', () => {
    for (const f of ['woofer_up_hor_0_koan677_merged.frd', 'woofer_down_hor_0_koan677_merged.frd']) {
      const blk = readMergeBlock(readFileSync(join(TESTKAST, f), 'latin1'));
      expect(blk, `${f} draagt geen mergeblok`).not.toBeNull();
      expect(blk!.validFromHz).toBe(20.5);
      /* De aandrijftoestand van de nabije velden reist mee in de vloerreden —
       * STATED, NOT CORRECTED (Sander, 12-09-2026), zodat élke lezer
       * stroomafwaarts haar krijgt. */
      expect(blk!.floorReason).toContain('STATED, NOT CORRECTED');
      expect(blk!.floorReason).toContain('MODEL TRANSFORM');
    }
  });
});

describe('M-2b — het sweep-frame is vastgelegd en niet weggepoetst', () => {
  it('de LAST is de gemeten 53,2 L-testkast, ook op de 67,7 L-set', () => {
    /* De respons is gemodelleerd voor 67,7 L en de sweep niet: M-2 mat waarom
     * (de teruggerekende driver wordt onfysisch), en dit is de claim die de
     * mismatch zichtbaar houdt in plaats van hem stil te laten bestaan. */
    const blk = (golden.manifest_en_geometrie as unknown as {
      meetset_2026_09_67L: { sweep_frame: Record<string, unknown>; bestanden: Record<string, { typ: string }> };
    }).meetset_2026_09_67L;
    expect(blk.sweep_frame.respons_frame).toContain('67,7');
    expect(blk.sweep_frame.last_frame).toContain('53,2');
    expect(String(blk.sweep_frame.waarom_niet_getransformeerd)).toContain('ONFYSISCH');
    /* Per lezer, en de vier die er iets van merken staan er met naam. */
    const lezers = blk.sweep_frame.per_lezer as Record<string, string>;
    for (const k of ['M-B/|Z| (versterkervloer)', 'M-D (opslingering, lfBump)', 'M-E (Q_es-vermenigvuldiging)']) {
      expect(Object.keys(lezers)).toContain(k);
    }
    /* En de sweep die de set werkelijk laadt IS de hermeting: haar eigen
     * reflexzadel ligt meetbaar lager dan dat van augustus. */
    const rxNew = drv(NEW, 'woofer').impedance!.reflex!;
    const rxOld = drv(OLD, 'woofer').impedance!.reflex!;
    expect(rxNew.fbHz).toBeLessThan(rxOld.fbHz);
  });

  it('M-D leest de mismatch, en het casusboek noteert wat dat op HUIDIG doet', () => {
    /* De opslingering is de metriek die BEIDE frames tegelijk leest — de
     * respons uit 67,7 L en de impedantie uit 53,2. Zij beweegt daardoor, en
     * dat is geen fout maar de meting: de reflexpiek van de last staat 3,4 Hz
     * hoger dan die van de respons. */
    const lf = (r: EngineV2Report) => r.metrics.lfBump.find((b) => b.driver === 'woofer')!.result;
    expect(lf(NEW).resonantDb).not.toBeCloseTo(lf(OLD).resonantDb!, 2);
    /* HUIDIG haalt het gestelde budget op beide sets — de eis is niet
     * versoepeld en niet aangescherpt door de wissel. */
    const budget = (golden.manifest_en_geometrie as unknown as {
      gestelde_eisen: { lf_opslingering_budget_dB: number };
    }).gestelde_eisen.lf_opslingering_budget_dB;
    expect(lf(NEW).resonantDb!).toBeLessThanOrEqual(budget);
    expect(lf(OLD).resonantDb!).toBeLessThanOrEqual(budget);
  });
});
