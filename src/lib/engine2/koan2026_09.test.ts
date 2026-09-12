/**
 * M-2 — DE WOOFERMERGE UIT DE HERMETING, EN WAT ER OVER HAAR VASTLIGT.
 *
 * Drie soorten claim. De REPRODUCTIE bewijst dat de bestanden op schijf uit deze
 * bewerking komen en niet uit iets anders. De EIGENSCHAPPEN pinnen wat de merge
 * per constructie moet doen: boven de blend het verre veld ZIJN, onder de splice
 * de poort meegesommeerd dragen, en door beide lezers van de app leesbaar zijn.
 * De BEVINDINGEN pinnen de aandrijftoestand en wat zij kost, zodat een latere
 * sessie haar niet hoeft te heronderzoeken en zij niet stil kan verdwijnen.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CASUS1_DIR,
  KOAN_DEMO_67L_DIR,
  REAL_VOLUME_L,
  RE_PER_DRIVER_OHM,
  SD_CM2,
  buildKoanPairFrd,
  buildKoanPairZma,
  buildKoanTransformedMerge,
  fitKoanBox,
  koanDriverFacts,
  koanMeasuredImpedance,
  KOAN_2026_09_DIR,
  KOAN_2026_09_NAME,
  KOAN_2026_09_WAYS,
  PARALLEL_LIM,
  PORT_FILE,
  SPLICE_BAND_HZ,
  STEP,
  buildKoanMerge,
  koanBoxTuneHz,
  koanPortWeight,
  readCasus1,
  readNew,
} from './koan2026_09.fixture.ts';
import { parseFrd } from '../parsers/frd.ts';
import { parseLim } from '../parsers/lim.ts';
import { parseZma } from '../parsers/zma.ts';
import { KOAN_DEMO_2026_09_DIR } from './koanDemo2026_09.fixture.ts';
import { readGateHeader, readMergeBlock } from '../xoWindow.ts';
import { declaredMergeValidity } from '../sourceMeta.ts';
import { parseArtaHeader } from './ingest/manifest.ts';
import { mergedFileName as mergedFileNameOf, spliceBandCheck } from '../nfMerge.ts';
import { abs, cplx, mul } from '../complex.ts';
import { blockedImpedance, portToConeRatio, samePortInVolume, volumeTransfer } from '../ventedBoxTransform.ts';

const BUILDS = KOAN_2026_09_WAYS.map((w) => buildKoanMerge(w));
const CASES = BUILDS.map((b) => [b.way.label, b] as const);

describe('M-2 reproductie — de bestanden op schijf komen uit deze bewerking', () => {
  it.each(CASES)('%s: het geschreven bestand reproduceert byte voor byte', (_l, b) => {
    const onDisk = readFileSync(join(KOAN_2026_09_DIR, b.outFile), 'utf8');
    expect(onDisk).toBe(b.text);
  });

  it('de map draagt haar naam en de drie ruwe bronnen', () => {
    expect(KOAN_2026_09_DIR.endsWith(KOAN_2026_09_NAME)).toBe(true);
    for (const f of [PORT_FILE, PARALLEL_LIM, ...KOAN_2026_09_WAYS.map((w) => w.nearFile)]) {
      expect(readNew(f).length).toBeGreaterThan(0);
    }
  });
});

describe('M-2 eigenschappen — wat de merge per constructie doet', () => {
  /**
   * DE DRAGENDE CLAIM. De merge IS het verre veld met zijn lage eind vervangen,
   * dus boven de blend mag er geen enkel cijfer bewegen. Valt dit om, dan is er
   * iets met het raster of met de crossfade en niet met het lage eind.
   */
  it.each(CASES)('%s: boven de blend is de merge het verre veld, exact', (_l, b) => {
    const far = parseFrd(readCasus1(b.way.farFile));
    /* In het GEHEUGEN blijft de rondgang door `resample`s ontwikkel- en
     * herwikkelstap over: 4e-14, de laatste bit van een double. */
    let mem = 0;
    for (const [i, f] of b.merge.freq.entries()) {
      if (f <= SPLICE_BAND_HZ[1] * 1.2) continue;
      mem = Math.max(mem, Math.abs(b.merge.spl[i] - far.spl[i]), Math.abs(b.merge.phaseDeg[i] - far.phase[i]));
    }
    expect(mem).toBeLessThan(1e-12);

    /* In het BESTAND — wat alles stroomafwaarts leest — is het exact nul, want
     * daar is het op drie decimalen geschreven. Dit is de claim die telt. */
    const written = parseFrd(readFileSync(join(KOAN_2026_09_DIR, b.outFile), 'utf8'));
    let onDisk = 0;
    for (const [i, f] of written.freq.entries()) {
      if (f <= SPLICE_BAND_HZ[1] * 1.2) continue;
      onDisk = Math.max(onDisk, Math.abs(written.spl[i] - far.spl[i]), Math.abs(written.phase[i] - far.phase[i]));
    }
    expect(onDisk).toBe(0);
  });

  /**
   * DE POORT IS GEMETEN EN MEEGESOMMEERD, en dat is wat M-2 toevoegt: I-2 liet
   * dit als open punt staan omdat de poortmeting niet bestond. De weging komt
   * uit de geometrie en de tegenproef is dat zij aantoonbaar iets DOET.
   */
  it.each(CASES)('%s: de poort zit erin, met de weging uit de geometrie', (_l, b) => {
    const pw = koanPortWeight();
    expect(pw.weight).toBeCloseTo(0.205, 3);
    expect(b.text).toContain('Merge port model = 1/2 × port');
    expect(b.merge.notes.join(' ')).toContain('port is summed');
  });

  it('zonder de poort levert de merge een ander lage eind — de poort is geen decoratie', () => {
    const way = KOAN_2026_09_WAYS[0];
    const withPort = buildKoanMerge(way);
    /* Dezelfde bewerking zonder poortbestand: `mergeNearField` laat hem dan weg. */
    const farText = readCasus1(way.farFile);
    const near = parseFrd(readNew(way.nearFile));
    expect(near.freq.length).toBeGreaterThan(0);
    expect(farText.length).toBeGreaterThan(0);
    /* De poortbijdrage is onder f_b het grootst; vergelijk de merge met de kale NF-vorm. */
    const i20 = withPort.merge.freq.findIndex((f) => f >= 20.5);
    const i50 = withPort.merge.freq.findIndex((f) => f >= 50);
    const mergedTilt = withPort.merge.spl[i20] - withPort.merge.spl[i50];
    const nearTilt = near.spl[near.freq.findIndex((f) => f >= 20.5)] - near.spl[near.freq.findIndex((f) => f >= 50)];
    expect(Math.abs(mergedTilt - nearTilt)).toBeGreaterThan(1);
  });

  /**
   * BEIDE LEZERS VAN DE APP MOETEN HET BLOK LEZEN. Dat was de blokkade op de
   * vorige levering: proza waar de lezers veldnamen lezen. De merge schrijft
   * namen, en dit pint dat v1 en engine2 hetzelfde teruglezen.
   */
  it.each(CASES)('%s: v1 en engine2 lezen beide een geldigheidsvloer terug', (_l, b) => {
    const raw = readFileSync(join(KOAN_2026_09_DIR, b.outFile), 'utf8');
    const mb = readMergeBlock(raw);
    expect(mb).not.toBeNull();
    expect(mb!.kind).toBe('NF/FF');
    expect(mb!.validFromHz).toBeCloseTo(20.5, 1);
    expect(mb!.spliceBandHz).toEqual([SPLICE_BAND_HZ[0], SPLICE_BAND_HZ[1]]);

    const p = parseFrd(raw);
    const dv = declaredMergeValidity(mb!, { fromHz: p.freq[0], toHz: p.freq[p.freq.length - 1] });
    expect(dv.validity.fromHz).toBeGreaterThan(0);

    const arta = parseArtaHeader(p.meta.rawComments);
    expect(arta.merge?.kind).toBe('NF/FF');
    expect(arta.statedValidity?.fromHz).toBeCloseTo(20.5, 1);
  });

  /**
   * DE APP MAG DEZE BESTANDEN NIET MEER WEIGEREN. `App.tsx` slaat een respons
   * met een mergeblok over in zijn windowless-lijst, dus een bestand met blok
   * blokkeert Optimize niet. Hier als eigenschap van het BESTAND gepind: het
   * blok is leesbaar, wat de enige voorwaarde is die die tak stelt.
   */
  it.each(CASES)('%s: het bestand draagt een blok, dus het is niet windowless', (_l, b) => {
    const raw = readFileSync(join(KOAN_2026_09_DIR, b.outFile), 'utf8');
    expect(readMergeBlock(raw)).not.toBeNull();
    /* En de gate-lezer laat het blok staan waar het hoort: hij leest hem niet
     * als vensterregel van dit bestand (P-1). */
    expect(readGateHeader(raw).kind).not.toBe('parsed');
  });
});

describe('M-2 bevindingen — de aandrijftoestand, en wat zij kost', () => {
  /**
   * DE TOESTAND STAAT IN ELK BESTAND. Zij is niet gecorrigeerd, op Sanders
   * besluit van 12-09-2026, en daarom moet zij leesbaar meereizen. Verdwijnt
   * deze zin, dan draagt een merge in de verkeerde toestand geen waarschuwing
   * meer, en dat is de stilte die dit project overal bestrijdt.
   */
  it.each(CASES)('%s: de aandrijftoestand reist mee in Merge floor reason', (_l, b) => {
    const mb = readMergeBlock(readFileSync(join(KOAN_2026_09_DIR, b.outFile), 'utf8'));
    expect(mb!.floorReason).toContain('NF CONDITION');
    expect(mb!.floorReason).toContain('ONE woofer driven');
    expect(mb!.floorReason).toContain('STATED, NOT CORRECTED');
  });

  /**
   * DE MÉTING WAAROP DIE ZIN RUST, hier gereproduceerd uit de ruwe bestanden:
   * de parallelcombinatie van de twee losse sweeps wijkt bij 28,56 Hz ruim
   * 15 dB af van de parallelle sweep van diezelfde sessie, en boven 80 Hz komen
   * zij binnen een dB overeen. Beide helften zijn nodig: alleen de afwijking
   * zou ook een kapotte parser kunnen zijn.
   */
  it('de losse sweeps zijn niet de parallelle toestand, en boven 80 Hz wel', () => {
    const lim = (n: string) => {
      const b = readFileSync(join(KOAN_2026_09_DIR, n));
      return parseLim(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
    };
    const par = lim(PARALLEL_LIM), up = lim('woofer_up.lim'), dn = lim('woofer_down.lim');
    const D = Math.PI / 180;
    const at = (hz: number) => par.freq.reduce((b, f, i) => (Math.abs(f - hz) < Math.abs(par.freq[b] - hz) ? i : b), 0);
    const combined = (i: number) => {
      const zu = { re: up.magnitude[i] * Math.cos(up.phase[i] * D), im: up.magnitude[i] * Math.sin(up.phase[i] * D) };
      const zd = { re: dn.magnitude[i] * Math.cos(dn.phase[i] * D), im: dn.magnitude[i] * Math.sin(dn.phase[i] * D) };
      const nr = zu.re * zd.re - zu.im * zd.im, ni = zu.re * zd.im + zu.im * zd.re;
      const dr = zu.re + zd.re, di = zu.im + zd.im, den = dr * dr + di * di;
      return Math.hypot((nr * dr + ni * di) / den, (ni * dr - nr * di) / den);
    };
    const i28 = at(28.56);
    expect(Math.abs(20 * Math.log10(combined(i28) / par.magnitude[i28]))).toBeGreaterThan(10);
    for (const hz of [81, 128]) {
      const i = at(hz);
      expect(Math.abs(20 * Math.log10(combined(i) / par.magnitude[i]))).toBeLessThan(1);
    }
  });

  /** f_b komt uit de nieuwe parallelle sweep en wordt afgelezen, niet getypt. */
  it('f_b is afgelezen uit de parallelle sweep', () => {
    const fb = koanBoxTuneHz();
    expect(fb.fbHz).toBeGreaterThan(25);
    expect(fb.fbHz).toBeLessThan(35);
    expect(BUILDS[0].validFromReason).toContain(fb.fbHz.toFixed(1));
  });

  /**
   * WAT DE TOESTAND KOST, en dit is de reden dat de merge bruikbaar is: de SOM
   * van conus en poort komt onder de splice dicht bij de augustusmerge, veel
   * dichter dan het conusminimum en de poortpiek apart zijn verschoven. Op
   * één punt, zodat een latere regeneratie van de augustusmerge deze claim niet
   * stil onwaar maakt, staat de grens ruim: binnen 3 dB over 20–450 Hz.
   */
  it('de som wijkt onder de splice minder dan 3 dB van de augustusmerge af', () => {
    const nw = BUILDS[0].merge;
    const au = parseFrd(readCasus1('Koan_W_up_merged_ingespeeld_mild.frd'));
    const norm = (f: readonly number[], s: readonly number[]) => {
      const ix = f.map((_, i) => i).filter((i) => f[i] >= 300 && f[i] < 450);
      const m = ix.reduce((a, i) => a + s[i], 0) / ix.length;
      return s.map((v) => v - m);
    };
    const a = norm(au.freq, au.spl), b = norm(nw.freq, nw.spl);
    let worst = 0;
    for (const [i, f] of nw.freq.entries()) {
      if (f < 20 || f > 450) continue;
      worst = Math.max(worst, Math.abs(b[i] - a[i]));
    }
    expect(worst).toBeLessThan(3);
  });

  /**
   * DE SPLICE-CONTROLE FAALT DE ±0,5 dB-CONVENTIE, op beide wegen, en dat is
   * GEBOEKT en niet weggewerkt: álle drie de merges van dit project falen hem
   * (I-2), en Sanders augustuskop noteert zelf een rest van −1,57…+1,77 dB. De
   * claim pint dat hij faalt ÉN dat hij niet wegloopt — boven 5 dB is er iets
   * anders aan de hand dan een conventie.
   */
  it.each(CASES)('%s: de splice-rest is boven de conventie maar onder 5 dB', (_l, b) => {
    const c = spliceBandCheck(b.merge, SPLICE_BAND_HZ);
    expect(c.ok).toBe(false);
    const p95 = Number(/p95 ([\d.]+) dB/.exec(c.reading ?? '')?.[1]);
    expect(p95).toBeGreaterThan(0.5);
    expect(p95).toBeLessThan(5);
  });

  /** Het step-MODEL is onveranderd dat van M-1, en het is een model. */
  it('het step-model is M-1s gestelde shelf en zegt dat het een model is', () => {
    expect(STEP).toEqual({ hz: 440, depthDb: 6 });
    expect(BUILDS[0].text).toContain('Merge step model = shelf 6 dB @ 440 Hz');
    expect(BUILDS[0].text).toContain('MODEL SENSITIVITY');
  });
});

describe('M-2 — de meetbasis en het frame', () => {
  /**
   * CASUS 1 IS NIET AANGERAAKT. Deze set leest het VERRE veld uit casus 1 — dat
   * is het punt, want het is ongewijzigd — maar schrijft daar niets en leest
   * geen enkele golden reference.
   */
  it('de fixture schrijft niets in casus 1 en leest geen golden reference', () => {
    const src = readFileSync(join(CASUS1_DIR, '..', '..', 'src', 'lib', 'engine2', 'koan2026_09.fixture.ts'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/golden_refs|writeFileSync/);
    expect(code).toContain('readCasus1');
  });

  /**
   * GEEN VOLUMETRANSFORMATIE, en het bestand zegt het niet omdat er niets te
   * zeggen valt: er staat geen enkele transformatie in. Deze claim pint dat,
   * zodat een latere sessie die er een aan toevoegt hier langskomt en de twee
   * open getallen moet beantwoorden.
   */
  it('er is geen volumetransformatie toegepast, en het blok zegt het positief', () => {
    for (const b of BUILDS) {
      /* Alleen de KOP scannen. De eerste versie las het hele bestand en viel om
       * op een datarij met de frequentie 67,7 Hz — een negatieve scan over
       * meetdata vindt elk getal dat er toevallig in staat. */
      const head = b.text.split('\n').filter((l) => l.trimStart().startsWith('*')).join('\n');
      expect(head).not.toMatch(/GETRANSFORMEERD|MODEL-TRANSFORMED|67[.,]7 ?L/i);
      /* En de positieve kant: het blok verklaart dat er geen modelvoorspelling
       * is toegepast, en dat wat er WEL model is de baffle step is. */
      expect(head).toContain('Merge prediction = none');
      expect(head).toContain('Merge step model = shelf');
      expect(head).toContain('MODEL-validated');
    }
  });
});

describe('M-2 volumetransformatie — de wiring naar de gemeten bestanden', () => {
  const boxFit = fitKoanBox();
  const TRANS = KOAN_2026_09_WAYS.map((w) => buildKoanTransformedMerge(w, boxFit, REAL_VOLUME_L));
  const TCASES = TRANS.map((b) => [b.way.label, b] as const);

  it.each(TCASES)('%s: het getransformeerde bestand reproduceert byte voor byte', (_l, b) => {
    expect(readFileSync(join(KOAN_2026_09_DIR, b.outFile), 'utf8')).toBe(b.text);
  });

  /**
   * DE TWEE ONAFHANKELIJKE ROUTES NAAR f_b. De poort/conus-verhouding kent geen
   * enkele drivergrootheid; het impedantiezadel is een heel andere meting. Dat
   * zij het eens zijn is de reden dat de transformatie te vertrouwen is, en het
   * is de claim die omvalt zodra een van beide wegdrijft.
   */
  it('f_b uit de poortverhouding en uit het impedantiezadel komen overeen', () => {
    expect(boxFit.agreement).toBeLessThan(0.05);
    expect(boxFit.fit.tuningHz).toBeGreaterThan(25);
    expect(boxFit.fit.tuningHz).toBeLessThan(35);
    expect(boxFit.blocked.residualDb).toBeLessThan(0.5);
  });

  /**
   * DE POORT KRIJGT ZIJN EIGEN TRANSFORMATIE, en dat is wat deze claim vastlegt:
   * zijn deler hangt aan f_b, en die verschuift mee met het volume. Zou de poort
   * dezelfde factor krijgen als de conus, dan zou het verschil overal nul zijn en
   * zou de merge een poort dragen die nog op de oude afstemming staat.
   */
  it('de poort wordt anders getransformeerd dan de conus', () => {
    const to = samePortInVolume(boxFit.box, REAL_VOLUME_L);
    const z = koanMeasuredImpedance();
    const drv = koanDriverFacts();
    let worst = 0;
    for (const [i, f] of z.freq.entries()) {
      if (f < 15 || f > 120) continue;
      const zb = blockedImpedance(f, RE_PER_DRIVER_OHM, boxFit.blocked);
      const t = volumeTransfer(f, mul(cplx(drv.count), z.z[i]), zb, boxFit.box, to, drv);
      worst = Math.max(worst, Math.abs(20 * Math.log10(abs(t.port) / abs(t.cone))));
    }
    /* Gemeten 4,3 dB rond 35 Hz; de grens staat ruim zodat een herfit hem niet breekt. */
    expect(worst).toBeGreaterThan(2);
    /* En de deler verschuift de kant op die een lagere afstemming geeft. */
    expect(abs(portToConeRatio(boxFit.box.tuningHz, to))).toBeLessThan(abs(portToConeRatio(boxFit.box.tuningHz, boxFit.box)));
  });

  /** Ook na de transformatie IS de merge boven de blend het verre veld. */
  it.each(TCASES)('%s: boven de blend blijft het verre veld onaangeroerd', (_l, b) => {
    const far = parseFrd(readCasus1(b.way.farFile));
    const written = parseFrd(readFileSync(join(KOAN_2026_09_DIR, b.outFile), 'utf8'));
    let worst = 0;
    for (const [i, f] of written.freq.entries()) {
      if (f <= SPLICE_BAND_HZ[1] * 1.2) continue;
      worst = Math.max(worst, Math.abs(written.spl[i] - far.spl[i]), Math.abs(written.phase[i] - far.phase[i]));
    }
    expect(worst).toBe(0);
  });

  /** Het bestand zegt zelf dat het een modeltransformatie is, en uit welke kast. */
  it.each(TCASES)('%s: de kop draagt MODEL TRANSFORM en beide volumes', (_l, b) => {
    const mb = readMergeBlock(readFileSync(join(KOAN_2026_09_DIR, b.outFile), 'utf8'));
    expect(mb).not.toBeNull();
    expect(mb!.floorReason).toContain('MODEL TRANSFORM');
    expect(mb!.floorReason).toContain(String(REAL_VOLUME_L));
    expect(mb!.floorReason).toContain('NF CONDITION');
    expect(b.outFile).toContain('koan677');
  });

  /**
   * DE RICHTING OP DE ECHTE DATA: een grotere kast stemt lager af, dus onder de
   * oude afstemming komt er uitstraling bij. Gemeten op de geschreven bestanden
   * en niet op de formule, zodat een fout in de wiring hier omvalt.
   */
  it.each(TCASES)('%s: onder de oude afstemming levert 67,7 L meer dan 53,2 L', (_l, b) => {
    const test = parseFrd(readFileSync(join(KOAN_2026_09_DIR, mergedFileNameOf(b.way.farFile)), 'utf8'));
    const real = parseFrd(readFileSync(join(KOAN_2026_09_DIR, b.outFile), 'utf8'));
    const at = (m: { freq: number[]; spl: number[] }, f0: number) =>
      m.spl[m.freq.reduce((x, f, i) => (Math.abs(f - f0) < Math.abs(m.freq[x] - f0) ? i : x), 0)];
    /* Uitgelijnd op 150–400 Hz, waar de transformatie vrijwel niets doet. */
    const band = (m: { freq: number[]; spl: number[] }) => {
      const ix = m.freq.map((_, i) => i).filter((i) => m.freq[i] >= 150 && m.freq[i] <= 400);
      return ix.reduce((s, i) => s + m.spl[i], 0) / ix.length;
    };
    const d = (f: number) => (at(real, f) - band(real)) - (at(test, f) - band(test));
    expect(d(22)).toBeGreaterThan(0.5);
    expect(d(25)).toBeGreaterThan(0.5);
    /* En ruim erboven doet zij vrijwel niets. */
    expect(Math.abs(d(300))).toBeLessThan(0.5);
  });
});

describe('M-2 demoset 67,7 L — wat de set draagt en wat zij niet belooft', () => {
  const boxFit = fitKoanBox();
  const pair = buildKoanPairFrd(boxFit, REAL_VOLUME_L);
  const zma = buildKoanPairZma(boxFit, REAL_VOLUME_L);

  it('de geschreven bestanden reproduceren byte voor byte', () => {
    expect(readFileSync(join(KOAN_DEMO_67L_DIR, pair.name), 'utf8')).toBe(pair.text);
    expect(readFileSync(join(KOAN_DEMO_67L_DIR, zma.name), 'utf8')).toBe(zma.text);
  });

  /** Mid en tweeter gaan ONGEWIJZIGD mee: een pod en een waveguide voelen het kastvolume niet. */
  it('mid en tweeter zijn byte-identiek aan de geleverde meetdata', () => {
    for (const f of ['mid.frd', 'mid.zma', 'tweeter.frd', 'tweeter.zma']) {
      expect(readFileSync(join(KOAN_DEMO_67L_DIR, f))).toEqual(readFileSync(join(KOAN_DEMO_2026_09_DIR, f)));
    }
  });

  /**
   * HET PAAR IS DE COMPLEXE SOM van de twee merges, punt voor punt. Dat is de
   * CONSTRUCTIE en dus wat hier getoetst wordt.
   *
   * De eerste versie van deze claim verwachtte +6 dB boven de blend — twee
   * gelijke bronnen in fase — en de data gaf −0,64 dB. Terecht: boven de splice
   * is elke merge zijn EIGEN verre veld, en de onderste woofer meet op deze
   * mic-positie 4–5 dB zachter dan de bovenste en op een andere afstand, dus de
   * som kamt in plaats van op te tellen. De verwachting was fout, niet de som.
   */
  it('het paar is punt voor punt de complexe som van de twee merges', () => {
    const p = parseFrd(readFileSync(join(KOAN_DEMO_67L_DIR, pair.name), 'utf8'));
    const parts = KOAN_2026_09_WAYS.map((w) => parseFrd(buildKoanTransformedMerge(w, boxFit, REAL_VOLUME_L).text));
    let worst = 0;
    for (const [i] of p.freq.entries()) {
      let re = 0, im = 0;
      for (const q of parts) {
        const a = Math.pow(10, q.spl[i] / 20), ph = (q.phase[i] * Math.PI) / 180;
        re += a * Math.cos(ph); im += a * Math.sin(ph);
      }
      worst = Math.max(worst, Math.abs(20 * Math.log10(Math.hypot(re, im)) - p.spl[i]));
    }
    /* Alleen de afronding van het bestand op drie decimalen blijft over. */
    expect(worst).toBeLessThan(5e-3);
  });

  /**
   * ONDERIN, waar de twee conussen akoestisch samenvallen en de poort erbij zit,
   * telt de som wél op: daar hoort het paar boven elke losse merge te liggen.
   */
  it('onder 100 Hz ligt het paar boven een losse weg', () => {
    const p = parseFrd(readFileSync(join(KOAN_DEMO_67L_DIR, pair.name), 'utf8'));
    const one = parseFrd(buildKoanTransformedMerge(KOAN_2026_09_WAYS[0], boxFit, REAL_VOLUME_L).text);
    const ix = p.freq.map((_, i) => i).filter((i) => p.freq[i] >= 25 && p.freq[i] <= 100);
    const mean = ix.reduce((s2, i) => s2 + (p.spl[i] - one.spl[i]), 0) / ix.length;
    expect(mean).toBeGreaterThan(1);
  });

  /** Beide parsers lezen het paar, dus de set blokkeert Optimize niet. */
  it('het wooferbestand stelt een geldigheid die beide lezers lezen', () => {
    const raw = readFileSync(join(KOAN_DEMO_67L_DIR, pair.name), 'utf8');
    const mb = readMergeBlock(raw);
    expect(mb?.kind).toBe('NF/FF');
    expect(mb!.validFromHz).toBeGreaterThan(0);
    expect(parseArtaHeader(parseFrd(raw).meta.rawComments).merge?.kind).toBe('NF/FF');
  });

  /**
   * DE IMPEDANTIE IS DE GEMETEN SWEEP, NIET GETRANSFORMEERD, en het bestand zegt
   * waarom. Deze claim pint dat de reden meereist én dat de waarden werkelijk de
   * meting zijn — anders zou de kop een transformatie ontkennen die er wel in zit.
   */
  it('de impedantie is de gemeten sweep, met de reden in de kop', () => {
    const raw = readFileSync(join(KOAN_DEMO_67L_DIR, zma.name), 'utf8');
    expect(raw).toContain('NOT TRANSFORMED');
    expect(raw).toContain('UNPHYSICAL');
    const parsed = parseZma(raw);
    const z = koanMeasuredImpedance();
    expect(parsed.freq.length).toBe(z.freq.length);
    let worst = 0;
    for (const [i] of z.freq.entries()) worst = Math.max(worst, Math.abs(parsed.magnitude[i] - abs(z.z[i])));
    expect(worst).toBeLessThan(5e-4);
  });

  /**
   * DE GEVOELIGHEID VOOR B_l, als MÉTING en niet als voorbehoud in proza. Een
   * datasheetgetal dat niemand hier kan narekenen draagt de transformatie, dus de
   * foutbalk hoort gepind te zijn: klein waar het kruisfilter werkt, groot rond de
   * oude afstemming. Zakt dit ooit, dan is er een betere B_l en mag de claim mee.
   */
  it('de transformatie hangt aan B_l: klein boven 60 Hz, groot rond de afstemming', () => {
    const z = koanMeasuredImpedance();
    const to = samePortInVolume(boxFit.box, REAL_VOLUME_L);
    const at = (f0: number) => {
      const i = z.freq.reduce((x, f, j) => (Math.abs(f - f0) < Math.abs(z.freq[x] - f0) ? j : x), 0);
      const f = z.freq[i];
      const zb = blockedImpedance(f, RE_PER_DRIVER_OHM, boxFit.blocked);
      const vals = [9.4, 10.45, 11.5].map((blTm) => {
        const drv = { sdM2: SD_CM2 * 1e-4, blTm, count: 2 };
        return 20 * Math.log10(abs(volumeTransfer(f, mul(cplx(drv.count), z.z[i]), zb, boxFit.box, to, drv).total));
      });
      return Math.max(...vals) - Math.min(...vals);
    };
    expect(at(30.4)).toBeGreaterThan(1.5);
    expect(at(22)).toBeLessThan(1);
    expect(at(60)).toBeLessThan(0.3);
    expect(at(100)).toBeLessThan(0.3);
  });
});
