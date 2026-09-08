/**
 * CASUS 2 — DE ACCEPTATIE-AUTORITEIT: EXTRACTIE TEGEN GRONDWAARHEID.
 *
 * Wat dit bestand anders doet dan `goldenCasus1.test.ts` en
 * `goldenCasus1b.test.ts`: daar is een klasse-A-referentie een GEMETEN getal
 * dat vastligt zodat een latere engine ernaast kan meten, en de acceptatie is
 * "reproduceert het". Hier is er een derde kolom — het getal dat het MODEL
 * kende voordat er iets gemeten werd — en de acceptatie is "vindt de extractor
 * het terug". Dat is het enige soort casus waarop die vraag beantwoordbaar is:
 * op gemeten data bestaat geen werkelijke parameter, alleen een tweede meting,
 * en twee schatters die het eens worden is consensus.
 *
 * DE AFWIJKINGEN ZIJN EXACT GEPIND EN NIET GEREPAREERD (stap 4 van
 * `casus-toevoegen`, en de E-4-vorm): de verzameling bevindingen moet GELIJK
 * zijn aan de opgenomen verzameling — een nieuwe afwijking valt om door er niet
 * op te staan, een verdwenen afwijking door er nog op te staan. Een
 * deelverzamelingstoets zou het tweede stil laten passeren, en dit casusboek
 * heeft daar drie keer voor betaald (V37, V38-fix, A5e.3c).
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { deserializeFilter } from '../filterFile.ts';
import { crossoverToNetlist } from '../vxpNetwork.ts';
import type { VxpCrossover } from '../parsers/vxp.ts';
import { waysOfElements } from '../coilDcr.ts';
import { dcrOf } from '../coilDcr.ts';
import {
  CASUS2_COIL_DCR,
  CASUS2_DIR,
  CASUS2_STATED_ORDER,
  CASUS2_V2_BAND_SOURCE,
  casus2Field,
  casus2Files,
  casus2Manifest,
  casus2Report,
  casus2Truth,
  loadGolden2,
} from './casus2.fixture.ts';
import { loadGolden } from './casus1.fixture.ts';

const golden = loadGolden2();
const truth = casus2Truth(golden);
const manifest = casus2Manifest(golden);
const files = casus2Files(manifest);
const REPORT = casus2Report(null, manifest, files, golden);

const derived = golden.afgeleide_parameters as unknown as Record<string, Record<string, unknown>>;
const TABLE = derived.extractie_tegen_grondwaarheid as unknown as {
  rijen: {
    grootheid: string;
    weg: string;
    soort: 'acceptatie' | 'controle';
    grondwaarheid: number;
    extractie: number;
    schatter: string;
    eenheid: string;
    klasse: string;
    verschil: number;
    toegestaan: number;
    binnen: boolean;
  }[];
  totaal: number;
  acceptatierijen: number;
  controlerijen: number;
  bevindingen: { sleutel: string; reden: string; verschil: number; toegestaan: number }[];
  controle_afwijkingen: string[];
};
const NETLISTS = golden.manifest_en_geometrie.netlists ?? {};

describe('C-2 — casus 2: de extractoren tegen de grondwaarheid', () => {
  it('de gekozen poort komt er EXACT uit: 1/T = 250 Hz en 2/T = 500 Hz, met herkomst', () => {
    /* De scherpste rij van de tabel, en met opzet een rond getal: de poort is
     * 3,0/7,0 ms, dus T = 4,0 ms op de kop. Een schatter die er 1 % naast zit
     * doet dat hier zichtbaar, waar 396,7 Hz op casus 1 alles kan zijn. */
    for (const d of REPORT.ingest.drivers) {
      expect(d.onAxis!.bandHz[0], `${d.driver}: geldigheidsvloer`).toBeCloseTo(truth.poort.geldigheidsvloer_hz, 6);
      expect(d.onAxis!.fineDetailFromHz, `${d.driver}: fijnstructuur`).toBeCloseTo(truth.poort.fijnstructuur_hz, 6);
      expect(d.onAxis!.bandFloorProvenance).toBe('header');
    }
    expect(truth.poort.effectieve_venstertijd_ms).toBe(4);
  });

  it('de vergelijkingstabel REPRODUCEERT uit een verse meting, rij voor rij', () => {
    /* De tabel is opgeschreven en niet berekend; zonder deze claim is zij een
     * herinnering. De extractie-kolom wordt hier opnieuw uit het rapport
     * gehaald — dezelfde weg die de recorder liep — en de grondwaarheid-kolom
     * uit het model. */
    expect(TABLE.rijen.length).toBe(TABLE.totaal);
    expect(TABLE.acceptatierijen + TABLE.controlerijen).toBe(TABLE.totaal);
    const byDriver = new Map(REPORT.ingest.drivers.map((d) => [d.driver, d]));
    for (const r of TABLE.rijen) {
      const abs = r.klasse === 'ohm' || r.klasse === 'dB';
      const v = abs ? r.extractie - r.grondwaarheid : (r.extractie / r.grondwaarheid - 1) * 100;
      expect(Math.abs(v - r.verschil), `${r.grootheid} (${r.weg}): het opgeschreven verschil`).toBeLessThan(
        Math.max(Math.abs(r.verschil) * 1e-3, 1e-6),
      );
      expect(r.binnen, `${r.grootheid} (${r.weg}): het opgeschreven oordeel`).toBe(Math.abs(r.verschil) <= r.toegestaan);
      if (r.weg !== 'alle ver-velden') expect(byDriver.has(r.weg), `${r.weg} is geen weg van deze casus`).toBe(true);
    }
    // Een paar dragende getallen apart uit het rapport, zodat de rondgang niet
    // alleen zichzelf controleert.
    const mid = byDriver.get('mid')!;
    expect(mid.re!.ohm).toBeCloseTo(truth.drivers.mid.R_e_ohm as number, 4);
    expect(mid.re!.fit!.branches[0].fHz).toBeCloseTo((truth.drivers.mid.kast as Record<string, number>).f_c_hz, 4);
    const woofer = byDriver.get('woofer')!;
    expect(woofer.impedance!.reflex!.fbHz / ((truth.drivers.woofer.kast as Record<string, number>).f_b_hz) - 1).toBeLessThan(0.02);
  });

  it('élke acceptatierij haalt haar tolerantie, OP DE GEPINDE BEVINDINGEN NA — exact die verzameling', () => {
    const fresh = TABLE.rijen
      .filter((r) => r.soort === 'acceptatie' && !r.binnen)
      .map((r) => `${r.grootheid} · ${r.weg}`)
      .sort();
    const recorded = TABLE.bevindingen.map((b) => b.sleutel).sort();
    /* GELIJKHEID en geen deelverzameling (E-4): een nieuwe afwijking valt om
     * door er niet op te staan, een verdwenen afwijking door er nog op te
     * staan. */
    expect(fresh).toEqual(recorded);
    // En elke bevinding draagt een reden — een afwijking zonder verklaring is
    // een openstaande vraag en geen referentie.
    for (const b of TABLE.bevindingen) {
      expect(b.reden, `${b.sleutel}`).toMatch(/^C-2\//);
      expect(b.reden.length, `${b.sleutel}: een reden van twee regels is geen reden`).toBeGreaterThan(120);
    }
    /* NIET VACUÜM: de overgrote meerderheid haalt het wél, anders zou "op de
     * bevindingen na" alles kunnen betekenen. */
    expect(TABLE.acceptatierijen - fresh.length).toBeGreaterThanOrEqual(30);
  });

  it('de twee semi-inductantie-schatters lopen in TEGENGESTELDE richting, en de motionele fit heeft gelijk', () => {
    /* De dragende bevinding van deze casus, en zij is alleen op grondwaarheid
     * te maken: twee schatters van dezelfde grootheid, en het model zegt welke
     * de goede is. De HF-fit leest op alle drie de wegen TE HOOG; de motionele
     * fit leest exact op de twee gesloten wegen en te LAAG op de woofer, waar
     * zijn fitband de spoel niet bevat. */
    const rows = TABLE.rijen.filter((r) => r.grootheid.startsWith('semi-inductantie n'));
    expect(rows.length).toBe(6);
    for (const r of rows.filter((x) => x.grootheid.includes('HF-fit'))) {
      expect(r.verschil, `${r.weg}: de HF-fit leest te hoog`).toBeGreaterThan(0);
    }
    const sealed = rows.filter((x) => x.grootheid.includes('motionele') && x.weg !== 'woofer');
    expect(sealed.length).toBe(2);
    for (const r of sealed) expect(Math.abs(r.verschil), `${r.weg}: de motionele fit is exact`).toBeLessThan(1e-3);
    const wooferFit = rows.find((x) => x.grootheid.includes('motionele') && x.weg === 'woofer')!;
    expect(wooferFit.verschil, 'de motionele fit leest op de woofer te laag').toBeLessThan(0);
  });

  it('M-C route 1 leest de reflexwoofer CONSERVATIEF, en de twee gesloten wegen exact', () => {
    /* De tweede dragende bevinding, en de richting is wat haar niet dringend
     * maakt: de engine denkt dat de conus MEER beweegt dan het model zegt, dus
     * haar plafond is strenger dan nodig. De engine benoemt de benadering zelf
     * in `qmsSource`; deze casus meet hoe groot zij is. */
    const rows = TABLE.rijen.filter((r) => r.grootheid === 'x/V op de resonantie');
    expect(rows.length).toBe(3);
    const w = rows.find((r) => r.weg === 'woofer')!;
    expect(w.verschil).toBeGreaterThan(0); // conservative: reads MORE excursion than there is
    expect(w.binnen).toBe(false);
    for (const r of rows.filter((x) => x.weg !== 'woofer')) {
      expect(r.binnen, `${r.weg}: op een gesloten kast is route 1 exact`).toBe(true);
    }
    const ex = REPORT.metrics.driveExcursion.find((x) => x.driver === 'woofer')!;
    expect(ex.electromechanical!.qmsSource).toMatch(/vented|UPPER peak/i);
  });

  it('route 2 (akoestisch) DRAAIT op deze casus, en haar verhouding is de baffle-step', () => {
    /* Wat casus 1 niet kan: haar ver-veldheaders dragen geen meetspanning, dus
     * route 2 staat daar uit en is nooit op een casus geoefend. Hier is zij
     * gedocumenteerd — en het verschil met route 1 is niet ruis maar een
     * BEKENDE grootheid: route 2 neemt vrije halfruimte aan en de gemeten
     * respons draagt de baffle-step, dus de verhouding hoort de stapwinst op de
     * resonantie te zijn. Alleen de tweeter kruist boven de poortvloer, dus
     * alleen daar mag route 2 lezen (de engine zegt dat zelf voor de andere
     * twee). */
    const stepHz = truth.geometrie.baffle_step_hz;
    const stepGain = (f: number): number => {
      const r = f / stepHz;
      return Math.sqrt((r * r + 10 ** (-truth.geometrie.baffle_step_diepte_dB / 10)) / (r * r + 1));
    };
    let ran = 0;
    for (const x of REPORT.metrics.driveExcursion) {
      const inBand = x.f0Hz >= truth.poort.geldigheidsvloer_hz;
      if (!inBand) {
        expect(x.acoustic && 'off' in x.acoustic, `${x.driver}: de resonantie ligt onder de poortvloer, dus route 2 hoort uit te staan`).toBe(true);
        continue;
      }
      expect(x.acoustic && 'ratioToElectromechanical' in x.acoustic, `${x.driver}: route 2 hoort te draaien`).toBe(true);
      const ratio = (x.acoustic as { ratioToElectromechanical: number }).ratioToElectromechanical;
      const expected = stepGain(x.f0Hz);
      /* Binnen 2 % van de stapwinst: route 2 draagt ook haar eigen benaderingen
       * (een kolf in vrije halfruimte, de respons ter plekke van de resonantie),
       * dus de claim is dat de baffle-step het verschil VERKLAART en niet dat
       * hij het tot op de laatste procent uitmaakt. */
      expect(
        Math.abs(ratio / expected - 1),
        `${x.driver}: route 2 leest ${ratio.toFixed(4)}, de baffle-step voorspelt ${expected.toFixed(4)}`,
      ).toBeLessThan(0.02);
      // ...en zonder de stap zou de verhouding 1 zijn; dat zij dat NIET is, is de claim.
      expect(Math.abs(ratio - 1), `${x.driver}: de stap doet iets`).toBeGreaterThan(0.02);
      ran++;
    }
    expect(ran, 'route 2 draait op minstens twee wegen — anders zegt deze claim niets').toBeGreaterThanOrEqual(2);
  });

  it('het ANKER is de stilste weg, en dat is de weg die het model het stilst maakte', () => {
    const gaps = REPORT.predesign.gaps!;
    const sens = Object.entries(truth.drivers).map(([w, d]) => [w, d.gevoeligheid_dB_1m_2V83 as number] as const);
    const quietest = sens.reduce((a, b) => (b[1] < a[1] ? b : a))[0];
    expect(gaps.anchor).toBe(quietest);
    expect(REPORT.predesign.gapsBlocked).toBeNull();
    // ...en de gaps zijn positief en geordend zoals de gevoeligheden dat zijn.
    const byWay = new Map(gaps.ways.map((w) => [w.driver, w.gapToAnchorDb]));
    const louder = sens.filter(([w]) => w !== quietest).sort((a, b) => a[1] - b[1]);
    expect(byWay.get(louder[0][0])!).toBeLessThan(byWay.get(louder[1][0])!);
  });

  it('de vensters staan op de regels die het MODEL voorspelt, en de orde is gesteld', () => {
    const wm = REPORT.predesign.windows.find((w) => w.lower === 'woofer' && w.upper === 'mid')!;
    const mt = REPORT.predesign.windows.find((w) => w.lower === 'mid' && w.upper === 'tweeter')!;
    // De W-M-vloer is k·f_c van de MID (A5d.3), en f_c kent het model.
    expect(wm.floorBy!.rule).toBe('fs');
    const fcMid = (truth.drivers.mid.kast as Record<string, number>).f_c_hz;
    expect(wm.floorHz! / fcMid).toBeGreaterThan(1.3);
    expect(wm.floorHz! / fcMid).toBeLessThan(1.5);
    // Beide plafonds zijn de eerste significante breakup van de LAGERE weg.
    expect(wm.ceilingBy!.rule).toBe('breakup');
    expect(mt.ceilingBy!.rule).toBe('breakup');
    const bw = (truth.drivers.woofer.breakups as { hz: number }[])[0].hz;
    const bm = (truth.drivers.mid.breakups as { hz: number }[])[0].hz;
    expect(wm.ceilingHz!).toBeLessThan(bw);
    expect(mt.ceilingHz!).toBeLessThan(bm);
    // De M-T-vloer is het GESTELDE M-C-getal, door de A5d.3(ii)-inversie.
    expect(mt.floorBy!.rule).toBe('drive-stated');
    const eisen = golden.manifest_en_geometrie.gestelde_eisen as { drive_op_fs_max_dB_per_weg: Record<string, number | null> };
    const limit = Math.abs(eisen.drive_op_fs_max_dB_per_weg.tweeter!);
    const fs = truth.drivers.tweeter.f_s_hz as number;
    expect(mt.floorHz! / (fs * 2 ** (limit / (6 * CASUS2_STATED_ORDER))) - 1).toBeLessThan(0.02);
  });

  it('de beoordeelde band staat op de poortvloer, en het raster begint daar ook', () => {
    expect(CASUS2_V2_BAND_SOURCE.lowest).toBe('woofer');
    expect(CASUS2_V2_BAND_SOURCE.validityFloorHz).toBeCloseTo(truth.poort.geldigheidsvloer_hz, 6);
    expect(CASUS2_V2_BAND_SOURCE.provenance).toBe('header');
    /* De kastafstemming (38 Hz) en de bovenste reflexpiek (59 Hz) liggen allebei
     * ONDER de poortvloer, dus de vloer van de band is de poort en niet het
     * kastgedrag. Op casus 1 (gemergede set) is het andersom, en het verschil
     * is de meetopstelling en niet de regel. */
    expect(CASUS2_V2_BAND_SOURCE.floorHz).toBe(CASUS2_V2_BAND_SOURCE.validityFloorHz);
    expect(CASUS2_V2_BAND_SOURCE.fpHz!).toBeLessThan(CASUS2_V2_BAND_SOURCE.validityFloorHz);
  });

  it('het VELD ligt nergens in de buurt van casus 1 — geen gedeeld bestand en geen gedeeld venster', () => {
    /* De tweede eis aan een synthetische casus: zij mag geen enkele schatter
     * bevestigen die op casus 1 is afgeregeld. Twee helften. (1) Geen enkel
     * meetbestand is gedeeld — de bestanden staan in een eigen map en worden
     * door een eigen lezer geladen. (2) Geen positie van het casus-2-veld ligt
     * binnen een casus-1-VENSTER; de vensters van casus 1 staan als
     * klasse-A-referentie in haar eigen bestand en bewegen niet met een
     * regeneratie. */
    const g1 = loadGolden() as unknown as { manifest_en_geometrie: { bestanden: Record<string, unknown> }; kruisvensters: Record<string, { venster: [number, number] }> };
    const c1Files = new Set(Object.keys(g1.manifest_en_geometrie.bestanden));
    for (const e of manifest.entries) expect(c1Files.has(e.file), `${e.file} is ook een casus-1-bestand`).toBe(false);

    const c1Windows = [g1.kruisvensters.woofer_mid_orde4.venster, g1.kruisvensters.mid_tweeter_orde4.venster];
    const field = casus2Field(REPORT);
    expect(field.field.candidates.length).toBeGreaterThan(0);
    for (const c of field.field.candidates) {
      for (const x of c.crossings) {
        for (const [lo, hi] of c1Windows) {
          expect(
            x.hz >= lo && x.hz <= hi,
            `${x.pairLabel} @ ${x.hz.toFixed(1)} Hz ligt binnen casus 1's venster ${lo}–${hi} Hz`,
          ).toBe(false);
        }
      }
    }
    // ...en het is een VERKENNING: het budget bindt en de posities zijn centre-first.
    expect(field.field.parameters.positionPolicy).toBe('centre-first');
    expect(field.field.parameters.alignmentPolicy).toBe('one');
    expect(field.field.candidates.length).toBeLessThanOrEqual(field.field.parameters.chainBudget as number);
  });

  it('A7 — een SYNTHETISCHE verschuiving beweegt élke afleiding mee, en de grondwaarheid beweegt met haar mee', () => {
    /* De nieuwe-meting-test (A7), en op deze casus is zij scherper dan op casus
     * 1: daar bewijst een verschuiving dat een band MEEBEWEEGT, hier bewijst zij
     * ook WAARHEEN. De frequentie-as van élke impedantiesweep wordt met een
     * factor geschaald; dan schaalt élke resonantie van het model met diezelfde
     * factor, dus de extractie hoort exact op `factor × grondwaarheid` uit te
     * komen. Een schatter die een constante onthoudt haalt dat niet.
     *
     * De factor is bewust geen rond getal en geen octaaf: 1,37 kan met niets
     * samenvallen dat de engine ergens anders vandaan zou kunnen halen. */
    const FACTOR = 1.37;
    const shifted = files.map((f) =>
      f.impedance ? { ...f, impedance: { ...f.impedance, freq: f.impedance.freq.map((x) => x * FACTOR) } } : f,
    );
    const r = casus2Report(null, manifest, shifted, golden);
    for (const d of r.ingest.drivers) {
      const gt = truth.drivers[d.driver] as Record<string, unknown>;
      const box = gt.kast as Record<string, number | string>;
      const base = box.soort === 'gesloten' ? (box.f_c_hz as number) : box.soort === 'reflex' ? (box.f_b_hz as number) : (gt.f_s_hz as number);
      const got = box.soort === 'reflex' ? d.impedance!.reflex!.fbHz : d.impedance!.fundamentalHz!;
      expect(got / (base * FACTOR) - 1, `${d.driver}: de resonantie volgt de verschuiving niet`).toBeLessThan(0.02);
      /* En de Q's mogen NIET meebewegen: een frequentieschaling verandert de
       * vorm van de kromme niet. Zonder deze helft is de eerste ook waar voor
       * een schatter die alles met de as vermenigvuldigt. */
      const sealed = d.impedance!.sealed;
      if (sealed && sealed.qmc !== null) {
        const q0 = box.soort === 'gesloten' ? (box.Q_mc as number) : (gt.Q_ms as number);
        expect(Math.abs(sealed.qmc / q0 - 1), `${d.driver}: Q beweegt mee met de as`).toBeLessThan(0.07);
      }
    }
    /* En twee derivaties verderop: de W-M-vensters vloer is k·f_c van de mid,
     * dus hij hoort met dezelfde factor mee te schuiven. */
    const wm0 = REPORT.predesign.windows.find((w) => w.lower === 'woofer' && w.upper === 'mid')!;
    const wm1 = r.predesign.windows.find((w) => w.lower === 'woofer' && w.upper === 'mid')!;
    expect(Math.abs(wm1.floorHz! / (wm0.floorHz! * FACTOR) - 1), 'de vensterdrempel onthoudt een constante').toBeLessThan(0.02);
  });

  it('klasse A is klasse A: dezelfde afleidingen op ELK bevroren netwerk', () => {
    /* De controle die de skill voorschrijft om een klasse te BEPALEN in plaats
     * van te beweren: reproduceer de referentie op alle kandidaatnetlists.
     * Identiek ⇒ A. Zonder netlist is er niets te herhalen, en dan zegt de
     * claim dat en slaagt niet stilletjes. */
    const keys = Object.keys(NETLISTS);
    if (keys.length === 0) {
      expect(REPORT.subject.network).toBeNull();
      return;
    }
    const base = JSON.stringify({
      gate: REPORT.ingest.drivers.map((d) => [d.driver, d.onAxis!.bandHz, d.re!.ohm, d.impedance!.fundamentalHz]),
      windows: REPORT.predesign.windows.map((w) => [w.lower, w.upper, w.floorHz, w.ceilingHz]),
      anchor: REPORT.predesign.gaps?.anchor ?? null,
    });
    for (const k of keys) {
      const r = casus2Report(k, manifest, files, golden);
      expect(
        JSON.stringify({
          gate: r.ingest.drivers.map((d) => [d.driver, d.onAxis!.bandHz, d.re!.ohm, d.impedance!.fundamentalHz]),
          windows: r.predesign.windows.map((w) => [w.lower, w.upper, w.floorHz, w.ceilingHz]),
          anchor: r.predesign.gaps?.anchor ?? null,
        }),
        `${k}: een klasse-A-afleiding beweegt met de netlist`,
      ).toBe(base);
    }
  });

  it('DCR-toepassing: elke spoel van een geleverde netlist draagt het koper dat HAAR gestelde familie voorspelt', () => {
    /* A5e.3 op een casus die andere draaddiktes stelt dan casus 1 (1,2 / 0,8 /
     * 0,7 tegen 1,4 / 1,0 / 1,0 mm). De claim is niet "er staat een DCR" maar
     * dat het EXACT de fit van de familie van die weg is bij de inductie die
     * geschreven staat — één implementatie, en de netlist is de lezer. */
    const keys = Object.keys(NETLISTS);
    if (keys.length === 0) {
      expect(readdirSync(CASUS2_DIR).filter((f) => /^KAND-V2-\d+\.adsfilter\.json$/.test(f))).toEqual([]);
      return;
    }
    expect(CASUS2_COIL_DCR.stated, 'de spoelfamilies horen GESTELD te zijn op deze casus').toBe(true);
    const model = CASUS2_COIL_DCR.model!;
    let coils = 0;
    for (const k of keys) {
      const parts = deserializeFilter(readFileSync(join(CASUS2_DIR, NETLISTS[k]), 'utf-8')).parts;
      const ways = waysOfElements(crossoverToNetlist({ name: k, parts: [...parts] } as VxpCrossover).netlist);
      for (const p of parts) {
        if (p.type !== 'Inductor' || p.partId === undefined || p.catalog) continue;
        const mH = p.params.find((q) => q.name === 'L')?.value;
        const dcr = p.params.find((q) => q.name === 'DCR')?.value;
        const way = (ways.get(p.partId) ?? []).find((w: string) => model.familyByWay[w] !== undefined);
        if (way === undefined) continue;
        expect(typeof mH, `${k}/${p.partId}: geen inductie`).toBe('number');
        expect(typeof dcr, `${k}/${p.partId}: geen DCR-param — de stempel is niet toegepast`).toBe('number');
        const fit = model.fits[model.familyByWay[way]];
        const want = dcrOf(mH! * 1e-3, fit)?.ohm;
        expect(want, `${k}/${p.partId}: de familie levert geen DCR`).toBeTypeOf('number');
        expect(Math.abs(dcr! / want! - 1), `${k}/${p.partId} (${way}): ${dcr} Ω tegen ${want} uit ${fit.family}`).toBeLessThan(0.01);
        coils++;
      }
    }
    expect(coils, 'geen enkele spoel gecontroleerd — de claim zou leeg zijn').toBeGreaterThan(0);
  });

  it('elke bevroren netlist heeft een klasse-B-blok dat reproduceert, en manifest ↔ schijf ↔ herkomst zijn het eens', () => {
    const keys = Object.keys(NETLISTS);
    const onDisk = readdirSync(CASUS2_DIR).filter((f) => /^KAND-V2-\d+\.adsfilter\.json$/.test(f));
    const live = keys.filter((k) => /^KAND_V2_\d+$/.test(k));
    expect(live.length, 'wezen: bestanden op schijf die het manifest niet noemt').toBe(onDisk.length);
    if (keys.length === 0) return;
    const kandidaten = golden.kandidaten as unknown as Record<string, Record<string, number | null>>;
    for (const k of keys) {
      const ref = kandidaten[k];
      expect(ref, `${k}: geen klasse-B-blok`).toBeTruthy();
      const r = casus2Report(k, manifest, files, golden);
      expect(r.metrics.epdr!.minZOhm).toBeCloseTo(ref.min_Z_ohm as number, 3);
      expect(r.metrics.dissipation!.totalFraction).toBeCloseTo(ref.dissipatiefractie as number, 6);
    }
    const herkomstPath = join(CASUS2_DIR, '..', 'casus2_v2_herkomst.json');
    if (existsSync(herkomstPath)) {
      const h = JSON.parse(readFileSync(herkomstPath, 'utf-8')) as { bestanden: { name: string }[] };
      expect(h.bestanden.map((b) => b.name).sort()).toEqual(live.map((k) => k.replace('KAND_V2_', 'KAND-V2-')).sort());
    }
  });
});
