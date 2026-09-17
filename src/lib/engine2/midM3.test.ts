/**
 * M-3 — DE ACCEPTATIE VAN DE HERMERGDE MID.
 *
 * Vier groepen, en de tweede draagt de sessie. (1) De MERGE reproduceert uit de
 * fixture — één implementatie, twee lezers (A3g), de vorm die M-2 voor de
 * woofers zette. (2) WAT DE REPARATIE VERPLAATST, met de tegenproef ernaast:
 * de fase beweegt onder de splice en de MAGNITUDE nergens, en boven de splice
 * is het bestand bit-identiek aan het verre veld dat het draagt. (3) DE SET:
 * `'m3'` is de standaard en verwisselt precies één bestand. (4) DE NETLISTS:
 * geen enkel poortoordeel wisselt, de mid→tweeter-fase staat exact stil, en de
 * woofer→mid-fase beweegt met de ordegrootte van de fout.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrd } from '../parsers/frd.ts';
import { parseTabular } from '../parsers/tabular.ts';
import { parseArtaHeader } from './ingest/manifest.ts';
import { readGateHeader, readMergeBlock } from '../xoWindow.ts';
import {
  CABINET_STEP_HZ,
  MID_FAR_FILE,
  MID_M1_FILE,
  MID_M3_FILE,
  MID_NEAR_FILE,
  SPLICE_BAND_HZ,
  STEP,
  VALID_FROM_HZ,
  assertM1ModelMatches,
  buildM3MidMerge,
  deltaBands,
  m1MidResponse,
} from './midM3.fixture.ts';
import { CASUS1_DIR } from './koan2026_09.fixture.ts';
import {
  CASUS1_SESSION_ID,
  casus1Files,
  casus1Manifest,
  casus1Set67L,
  casus1SetM3,
  casus1SetOf,
  loadGolden,
} from './casus1.fixture.ts';
import { corpusBank } from './casus1Corpora.fixture.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

const read = (name: string): string => readFileSync(join(CASUS1_DIR, name), 'utf8');
const golden = loadGolden();

/** Recorded by `scripts/measure-m3-mid-phase.ts`; every number here reproduces. */
const RECORD = JSON.parse(
  readFileSync(join(CASUS1_DIR, '..', 'casus1_m3_hermeting.json'), 'utf8'),
) as {
  voor_set: string;
  na_set: string;
  netlists: Record<string, { voor: Rd; na: Rd }>;
  oordeelswissels: string[];
};
interface Rd {
  pairs: { pair: string; mk: number | null; n: number }[];
  rmsDb: number | null;
  verdicts: { gate: string; subject: string; active: boolean; pass: boolean; tolOnly: boolean }[];
}

describe('M-3 — de merge reproduceert', () => {
  it('[bytes] de fixture levert byte-identiek het bestand dat op schijf staat', () => {
    /* A3g: het script SCHRIJFT en deze test LEEST, allebei door dezelfde
     * `buildM3MidMerge`. Een tweede implementatie hier zou een tweede antwoord
     * zijn op de vraag wat de merge is.
     *
     * `[bytes]` OM DE M-2-REDEN, en zij is V46's precisering: dit herberekent
     * een FFT-cepstrum, een niveaufit, een vertragingsfit en een crossfade, en
     * legt het resultaat op DRIE DECIMALEN naast 13 640 weggeschreven rijen.
     * Byte-identiek geldt per (machine, runtime); een laatste-bit-verschil op
     * een andere runtime kan een van die 27 280 afrondingen omklappen. Uit CI,
     * dus — precies zoals de drie reproductieclaims van `koan2026_09.test.ts`.
     * Wat er WEL portable is staat eronder: de fasedelta per band, de
     * monotonie, de bit-identiteit boven de splice en elke claim over de
     * netlists lezen grootheden met een tolerantie, en die draaien in CI. */
    expect(buildM3MidMerge().text).toBe(read(MID_M3_FILE));
  });

  it('band, shelf en geldigheidsvloer zijn die van M-1 — precies EEN factor beweegt', () => {
    const m1 = assertM1ModelMatches();
    expect(m1.stepHz).toBe(STEP.hz);
    expect(m1.stepDepthDb).toBe(STEP.depthDb);
    expect(m1.bandHz).toEqual([SPLICE_BAND_HZ[0], SPLICE_BAND_HZ[1]]);
    expect(m1.validFromHz).toBe(VALID_FROM_HZ);
  });

  it('hij is gebouwd uit dezelfde twee bestanden die M-1 noemt, en uit geen poort', () => {
    const block = parseArtaHeader(parseTabular(read(MID_M3_FILE)).comments).merge!;
    const m1block = parseArtaHeader(parseTabular(read(MID_M1_FILE)).comments).merge!;
    expect(block.nfSource).toBe(MID_NEAR_FILE);
    expect(block.ffSource).toBe(MID_FAR_FILE);
    expect(block.nfSource).toBe(m1block.nfSource);
    expect(block.ffSource).toBe(m1block.ffSource);
    /* Gesloten pod: niets verzonnen (P4). */
    expect(block.portModel).toMatch(/none/i);
  });

  it('BEIDE lezers van de app lezen het blok terug en zijn het eens', () => {
    /* De v1-laag mag engine2 niet importeren, dus dit zijn twee onafhankelijke
     * parsers op één conventie — P-1's vorm, één bestand verder. */
    const text = read(MID_M3_FILE);
    const v2 = parseArtaHeader(parseTabular(text).comments);
    const v1 = readMergeBlock(text);
    expect(v1).not.toBeNull();
    expect(v1!.kind).toBe(v2.merge!.kind);
    expect(v1!.validFromHz).toBe(v2.statedValidity!.fromHz);
    expect(v1!.validFromHz).toBe(VALID_FROM_HZ);
    expect(v1!.spliceBandHz).toEqual(v2.merge!.spliceBandHz);
    expect(v1!.nfSource).toBe(v2.merge!.nfSource);
    expect(v1!.ffSource).toBe(v2.merge!.ffSource);
  });

  it('de kastafleiding is die van het project zelf (baffleStepHz), niet een tweede formule', () => {
    /* M-2's fixture beantwoordt dezelfde vraag met c/(pi*W) = 419,9 Hz; élke
     * andere plek in dit casusboek draagt Elliotts 442. De mid leest de ENE
     * functie die de rest van de engine ook leest. Zie de fixture voor de
     * bevinding. */
    expect(CABINET_STEP_HZ).not.toBeNull();
    expect(CABINET_STEP_HZ!).toBeCloseTo(442.3, 1);
  });
});

describe('M-3 — wat de reparatie verplaatst, en wat niet', () => {
  const nieuw = parseFrd(read(MID_M3_FILE));
  const oud = m1MidResponse();
  const bands = deltaBands(
    nieuw.freq,
    { spl: nieuw.spl, phase: nieuw.phase },
    { spl: oud.spl, phase: oud.phase },
  );
  const at = (lo: number): (typeof bands)[number] => bands.find((b) => b.from === lo)!;

  it('DE MAGNITUDE beweegt nergens meer dan de afronding van het bestand zelf', () => {
    /* Dit is waarom de fout vier sessies onopgemerkt bleef: élke poort, élke
     * eis en élke RMS leest magnitudes, en die staan stil. */
    /* Afgerond op zes decimalen: het bestand draagt er DRIE, dus een verschil
     * van precies een afrondingsstap leest in drijvende komma als
     * 0,0010000000000047748 en die staart is geen meting. */
    for (const b of bands) {
      expect(Number(b.dbMax.toFixed(6)), `${b.from}-${b.to} Hz`).toBeLessThanOrEqual(0.001);
    }
  });

  it('DE FASE loopt op naarmate je zakt, en is boven 800 Hz exact nul', () => {
    expect(at(20).degRms).toBeGreaterThan(20);
    expect(at(40).degRms).toBeGreaterThan(15);
    expect(at(80).degRms).toBeGreaterThan(10);
    /* De ordegrootte over de W-M-kruisband, en zij is KLEIN — de 18-29 graden
     * die I-2 noemt liggen ONDER 150 Hz. */
    expect(at(150).degRms).toBeGreaterThan(1);
    expect(at(150).degRms).toBeLessThan(10);
    expect(at(300).degRms).toBeLessThan(3);
    /* Boven de splice IS de merge het verre veld. */
    expect(at(800).degRms).toBe(0);
    expect(at(800).degMax).toBe(0);
  });

  it('de monotonie is de claim en niet een enkel getal: dieper is erger', () => {
    /* Zonder deze claim zou een willekeurige faseverschuiving dezelfde
     * bandgetallen kunnen halen. De fout is een MINIMUMFASE-fout van een shelf,
     * dus zij groeit monotoon naar beneden. */
    const order = [20, 40, 80, 150, 300, 500, 800].map((lo) => at(lo).degRms);
    for (let i = 1; i < order.length; i++) expect(order[i], `band ${i}`).toBeLessThan(order[i - 1]);
  });

  it('BOVEN DE SPLICE is het bestand bit-identiek aan het verre veld dat het draagt', () => {
    /* De claim die "exact nul boven 800" iets laat betekenen: daar is de merge
     * geen merge meer. Op het raster van het verre veld zelf, dus punt voor
     * punt en niet geinterpoleerd. */
    const far = parseFrd(read(MID_FAR_FILE));
    let n = 0;
    for (let i = 0; i < nieuw.freq.length; i++) {
      if (nieuw.freq[i] < 1000) continue;
      expect(nieuw.freq[i]).toBe(far.freq[i]);
      expect(Math.abs(nieuw.spl[i] - far.spl[i]), `${nieuw.freq[i]} Hz`).toBeLessThanOrEqual(0.001);
      n++;
    }
    expect(n).toBeGreaterThan(1000);
  });

  it('de gestelde vloer is NIET verbreed, en de afgeleide staat ernaast', () => {
    /* De app zou voor een gesloten kast ~20,5 Hz afleiden (de conus is de hele
     * straler). Dat is een RUIMERE claim over dezelfde bestanden dan M-1 wilde
     * maken, en M-3 verandert een fasewiskunde en geen meting. */
    const b = buildM3MidMerge();
    expect(b.validFromHz).toBe(VALID_FROM_HZ);
    expect(b.derivedValidFromHz).not.toBeNull();
    expect(b.derivedValidFromHz!).toBeLessThan(VALID_FROM_HZ);
    expect(b.validFromReason).toMatch(/STATED/);
  });
});

describe('M-3 — de meetset', () => {
  it("'m3' is de standaard en 'koan677' blijft bij naam bereikbaar", () => {
    expect(casus1SetOf(casus1Manifest(golden))).toBe('m3');
    expect(casus1SetOf(casus1Manifest())).toBe('m3');
    /* De gedateerde brug moet aanroepbaar BLIJVEN: elke referentie van vóór
     * M-3 is erop gemeten, en een brug die je niet meer kunt draaien bewijst
     * niets. */
    expect(casus1SetOf(casus1Manifest(golden, 'koan677'))).toBe('koan677');
    expect(new Set(Object.values(CASUS1_SESSION_ID)).size).toBe(4);
  });

  it('zij verwisselt precies EEN bestand, en het is de mid', () => {
    const swap = casus1SetM3(golden);
    expect(Object.keys(swap)).toEqual([MID_M3_FILE]);
    expect(swap[MID_M3_FILE].drv).toBe('mid');
    expect(swap[MID_M3_FILE].vervangt).toBe(MID_FAR_FILE);
    /* Geen `map`: de mid woont in casus 1's eigen map, want M-3 is een
     * BEWERKING en geen meetsessie. */
    expect(swap[MID_M3_FILE].map).toBeUndefined();
  });

  it('de wooferhelft is die van M-2b en de tweeter die van M-1, ongewijzigd', () => {
    const files = casus1Manifest(golden, 'm3').entries.map((e) => e.file);
    for (const w of Object.keys(casus1Set67L(golden))) expect(files, w).toContain(w);
    expect(files).toContain('tweeter_hor_0.txt');
    expect(files).toContain('mid_hor_30.txt');
    expect(files).toContain('mid.lim');
    /* En de M-1-mid is er NIET meer, precies één bestand verderop. */
    expect(files).toContain(MID_M3_FILE);
    expect(files).not.toContain(MID_M1_FILE);
    /* ...terwijl de M-2b-set hem nog wél draagt. */
    expect(casus1Manifest(golden, 'koan677').entries.map((e) => e.file)).toContain(MID_M1_FILE);
  });

  it('zij verwisselt IN DE PLAATS: zelfde weg, zelfde soort, zelfde hoek, zelfde volgorde', () => {
    const oud = casus1Manifest(golden, 'koan677');
    const nu = casus1Manifest(golden, 'm3');
    expect(nu.entries.length).toBe(oud.entries.length);
    let swapped = 0;
    for (const [i, o] of oud.entries.entries()) {
      const n = nu.entries[i];
      expect(n.driver).toBe(o.driver);
      expect(n.kind).toBe(o.kind);
      expect(n.angleDeg).toBe(o.angleDeg);
      if (n.file !== o.file) swapped++;
    }
    expect(swapped).toBe(1);
  });

  it('de set laadt, en de mid die zij laadt draagt het M-3-blok', () => {
    const files = casus1Files(casus1Manifest(golden, 'm3'));
    const mid = files.find((f) => f.entry.file === MID_M3_FILE);
    expect(mid).toBeDefined();
    /* `loadMeasurement` parseert de kop al bij het laden, dus de set draagt de
     * geldigheid mee zonder dat iemand het bestand nog eens hoeft te lezen. */
    expect(mid!.entry.header?.merge?.kind).toBe('NF/FF');
    expect(mid!.entry.header?.statedValidity?.fromHz).toBe(VALID_FROM_HZ);
    expect(mid!.response).toBeDefined();
  });
});

describe('M-3 — de netlists, herlezen zonder te regenereren', () => {
  const before = corpusBank(golden, 'koan677');
  const after = corpusBank(golden, 'm3');
  const keys = Object.keys(RECORD.netlists);

  it('de opname beschrijft de twee sets die zij zegt te beschrijven', () => {
    expect(RECORD.voor_set).toBe('koan677');
    expect(RECORD.na_set).toBe('m3');
    expect(keys.length).toBe(6);
  });

  it.each(keys)('%s — GEEN enkel poortoordeel wisselt', (key) => {
    const vb = before.report(key).gates.verdicts;
    const va = after.report(key).gates.verdicts;
    expect(va.length).toBe(vb.length);
    for (const b of vb) {
      const a = va.find((x) => x.gate === b.gate && x.subject === b.subject);
      expect(a, `${b.gate} op ${b.subject}`).toBeDefined();
      expect(a!.active, `${b.gate} op ${b.subject} actief`).toBe(b.active);
      expect(a!.pass, `${b.gate} op ${b.subject} pass`).toBe(b.pass);
      expect(a!.withinToleranceOnly, `${b.gate} op ${b.subject} tolerantie`).toBe(b.withinToleranceOnly);
    }
  });

  it('de opname zelf zegt dat er nul wissels waren', () => {
    expect(RECORD.oordeelswissels).toEqual([]);
  });

  it.each(keys)('%s — de mid→tweeter-fase staat EXACT stil', (key) => {
    /* Die overname ligt op ~2251 Hz, ruim boven de splice, waar de merge het
     * verre veld zelf is. Dit is de claim die zegt dat M-3 alleen raakt wat hij
     * hoort te raken. */
    const b = before.report(key).system.phaseTracking.find((p) => p.lower === 'mid')!;
    const a = after.report(key).system.phaseTracking.find((p) => p.lower === 'mid')!;
    expect(a.n).toBe(b.n);
    expect(a.meanAbsDeg).toBeCloseTo(b.meanAbsDeg, 9);
    /* De octaafgeknipte controlekolom KNIPT op meetgeldigheid en staat dus
     * ook stil. De ONGEKNIPTE kolom bewust niet: die leest onder de
     * geldigheidsvloer en beweegt op acht netlists van het casusboek wel —
     * V44's eigen bewijsmateriaal, geboekt in v44_fasematen. */
    const oc = (v: number | null): number => (v === null ? Number.NaN : v);
    expect(oc(a.control.octaveClipped.meanAbsDeg)).toBeCloseTo(oc(b.control.octaveClipped.meanAbsDeg), 9);
  });

  it.each(keys)('%s — de woofer→mid-fase beweegt, en met de ordegrootte van de fout', (key) => {
    const b = before.report(key).system.phaseTracking.find((p) => p.lower === 'woofer')!;
    const a = after.report(key).system.phaseTracking.find((p) => p.lower === 'woofer')!;
    const d = Math.abs(a.meanAbsDeg - b.meanAbsDeg);
    expect(d).toBeGreaterThan(0.1);
    /* De kruisband ligt op 253-519 Hz, waar de fasefout 1,9-7,0 graden rms is;
     * M-K is een gemiddelde over een band en beweegt dus minder. Een sprong van
     * een orde groter zou betekenen dat er iets anders bewoog dan deze fase. */
    expect(d).toBeLessThan(3);
  });

  it('M-K beweegt in BEIDE richtingen — een gerepareerde meting is geen verbetering', () => {
    /* De verwachting was "M-K verbetert". Dat is onwaar en het is de moeite
     * waard om te weten waarom: M-K is een gemiddelde |faseverschil|, en de
     * OUDE waarde was geen slechtere meting maar een BETEKENISLOZE. Of de
     * gerepareerde waarde hoger of lager uitkomt hangt af van welke kant van
     * nul het paar zat. */
    const deltas = keys.map((k) => {
      const b = before.report(k).system.phaseTracking.find((p) => p.lower === 'woofer')!;
      const a = after.report(k).system.phaseTracking.find((p) => p.lower === 'woofer')!;
      return a.meanAbsDeg - b.meanAbsDeg;
    });
    expect(deltas.some((d) => d > 0)).toBe(true);
    expect(deltas.some((d) => d < 0)).toBe(true);
  });

  it('de opgenomen M-K-waarden reproduceren uit een verse meting', () => {
    const tol = (golden.toleranties as { graden: number }).graden;
    for (const key of keys) {
      for (const [set, bank] of [['voor', before], ['na', after]] as const) {
        const rec = RECORD.netlists[key][set as 'voor' | 'na'];
        const fresh = bank.report(key).system.phaseTracking;
        for (const p of rec.pairs) {
          const f = fresh.find((x) => `${x.lower}→${x.upper}` === p.pair)!;
          expect(f, `${key} ${set} ${p.pair}`).toBeDefined();
          expect(p.mk, `${key} ${set} ${p.pair} opgenomen`).not.toBeNull();
          expect(Math.abs(f.meanAbsDeg - p.mk!), `${key} ${set} ${p.pair}`).toBeLessThanOrEqual(tol);
          expect(f.n, `${key} ${set} ${p.pair} punten`).toBe(p.n);
        }
      }
    }
  });
});

describe('M-3 — de toegelaten puntenverzameling beweegt nergens', () => {
  /* DE STERKSTE VORM VAN "ALLEEN DE FASE BEWOOG", en zij is over het HELE
   * casusboek te controleren zonder er 115 rapporten voor te bouwen: de brug
   * bewaart elke rij die bewoog, dus wat er NIET in staat is onbewogen en wat
   * er wel in staat kan veld voor veld tegen de nieuwe lezing gelegd worden.
   *
   * De drie gronden van de toelating (meetgeldigheid, stille geest, niveau)
   * lezen alle drie MAGNITUDES en geldigheden, en die staan stil. Dus mogen
   * `punten`, `band_Hz` en `afgewezen` op geen enkele rij bewegen — de
   * octaafgeknipte en de ongeknipte kolom wel, want dat zijn fasewaarden. */
  const block = (golden.manifest_en_geometrie as unknown as {
    v44_fasematen: {
      per_netlist: Row[];
      _waarden_M2b_tot_M3: { per_netlist: Row[]; bewogen_rijen: number; onbewogen_rijen: number };
    };
  }).v44_fasematen;
  interface Row {
    netlist: string;
    paar: string;
    mk_graden: number | null;
    punten: number;
    band_Hz: (number | null)[];
    octaafgeknipt_graden: number | null;
    overlapvenster_graden: number | null;
    afgewezen: Record<string, number>;
  }
  const key = (r: Row): string => `${r.netlist} ${r.paar}`;
  const nu = new Map(block.per_netlist.map((r) => [key(r), r]));
  const toen = block._waarden_M2b_tot_M3.per_netlist;

  /**
   * M-4 — DE NETLISTS DIE NA M-3 AAN HET CASUSBOEK ZIJN TOEGEVOEGD.
   *
   * De brug hieronder is een GEDATEERDE boekhouding: zij telt de rijen die M-3
   * bewoog en die hij onbewogen liet, en samen waren dat élke rij van het blok
   * TOEN. `per_netlist` beweegt sindsdien mee met het casusboek, dus de som
   * hoort tegen de rijen van de netlists van TOEN gelegd te worden en niet
   * tegen alles — de V47/V48-les, hier op een brug in plaats van op een rang.
   *
   * GELEZEN UIT DE HERKOMST van de sessie die ze toevoegde, niet uitgeschreven:
   * een sessie die netlists bevriest schrijft een herkomst, en die herkomst is
   * de enige plek die weet welke dat waren. Komt er een derde familie bij, dan
   * valt deze claim om totdat iemand haar herkomst hier noemt — en dat is het
   * moment waarop iemand moet kijken.
   */
  const SINCE_M3 = (() => {
    const out = new Set<string>();
    for (const file of ['casus1_m4_herkomst.json']) {
      const path = join(HERE, '..', '..', '..', 'test-fixtures', file);
      if (!existsSync(path)) continue;
      const h = JSON.parse(readFileSync(path, 'utf-8')) as { bestanden: { key: string }[] };
      for (const b of h.bestanden) out.add(b.key);
    }
    return out;
  })();

  it('de brug telt op: bewogen + onbewogen is elke rij van de netlists van TOEN', () => {
    const b = block._waarden_M2b_tot_M3;
    expect(b.bewogen_rijen).toBe(toen.length);
    const rowsThen = block.per_netlist.filter((r) => !SINCE_M3.has(r.netlist)).length;
    expect(b.bewogen_rijen + b.onbewogen_rijen).toBe(rowsThen);
    expect(toen.length).toBeGreaterThan(0);
    /* En de uitgesloten verzameling is precies de familie die zij zegt te zijn:
     * geen enkele netlist van vóór M-3 mag erin wegvallen. */
    for (const k of SINCE_M3) expect(k).toMatch(/^KAND_V2_\d+F$/);
    expect(block.per_netlist.length - rowsThen).toBe(
      block.per_netlist.filter((r) => SINCE_M3.has(r.netlist)).length,
    );
  });

  it('op GEEN enkele bewogen rij verschuift het puntental, de band of een afwijzing', () => {
    for (const was of toen) {
      const is = nu.get(key(was));
      expect(is, key(was)).toBeDefined();
      expect(is!.punten, `${key(was)} punten`).toBe(was.punten);
      expect(is!.band_Hz, `${key(was)} band`).toEqual(was.band_Hz);
      expect(is!.afgewezen, `${key(was)} afwijzingen`).toEqual(was.afgewezen);
    }
  });

  it('elke bewogen rij bewoog ALLEEN in een fasewaarde, en er bewoog er ook echt een', () => {
    let moved = 0;
    for (const was of toen) {
      const is = nu.get(key(was))!;
      const phaseMoved =
        is.mk_graden !== was.mk_graden ||
        is.octaafgeknipt_graden !== was.octaafgeknipt_graden ||
        is.overlapvenster_graden !== was.overlapvenster_graden;
      expect(phaseMoved, `${key(was)} staat in de brug maar bewoog nergens`).toBe(true);
      moved++;
    }
    expect(moved).toBe(toen.length);
  });

  it('elke mid|tweeter-rij in de brug bewoog UITSLUITEND in de ongeknipte kolom', () => {
    /* V44's eigen bewijsmateriaal, als claim: de enige weg waarlangs een
     * fasereparatie onder 800 Hz een overname op 2251 Hz kan bereiken is de
     * maat die niet tegen de meetgeldigheid knipt. */
    const mt = toen.filter((r) => r.paar === 'mid|tweeter');
    expect(mt.length).toBeGreaterThan(0);
    for (const was of mt) {
      const is = nu.get(key(was))!;
      expect(is.mk_graden, `${key(was)} M-K`).toBe(was.mk_graden);
      expect(is.octaafgeknipt_graden, `${key(was)} octaafgeknipt`).toBe(was.octaafgeknipt_graden);
      expect(is.overlapvenster_graden, `${key(was)} ongeknipt`).not.toBe(was.overlapvenster_graden);
    }
    /* En zij staan bij NAAM in de brug — de V30-vorm: boekhouding, geen
     * vrijstelling, en een lijst die kan groeien valt hier op. */
    const named = (block._waarden_M2b_tot_M3 as unknown as {
      mid_tweeter_alleen_ongeknipte_controle: { netlists: string[]; aantal: number };
    }).mid_tweeter_alleen_ongeknipte_controle;
    expect(named.aantal).toBe(mt.length);
    expect([...named.netlists].sort()).toEqual(mt.map((r) => r.netlist).sort());
  });
});

describe('M-3 — twee bevindingen die deze sessie niet repareert', () => {
  it("elk bestand van `renderMergeBlock` leest `unparseable` in de v1-gate-lezer", () => {
    /* P-1's faalvorm, en zij is PRE-EXISTENT sinds M-2: de eigen prozaregel van
     * `renderMergeBlock` — `basis: ... (gated far field)` — draagt het woord
     * "gate" zonder millisecondegetal, precies waar `readGateHeader` op valt.
     * De twee wooferbestanden van de HUIDIGE set doen dit al sinds 13-09-2026;
     * M-3 brengt de mid in dezelfde toestand.
     *
     * Het is ONSCHADELIJK omdat P-1 de VOLGORDE repareerde: `sourceMeta`
     * beantwoordt een verklaarde merge vóór de gepoorte tak, en `readMergeBlock`
     * slaagt op alle drie. Deze claim staat er zodat de dag waarop iemand die
     * volgorde omdraait hier langskomt — en zodat "M-3 deed dit" niet geloofd
     * wordt: de M-1-bestanden lezen `absent` en de M-2-bestanden `unparseable`. */
    expect(readGateHeader(read(MID_M3_FILE)).kind).toBe('unparseable');
    expect(readGateHeader(read(MID_M1_FILE)).kind).toBe('absent');
    /* De reparatie die P-1 aanbracht staat en is wat dit onschadelijk maakt:
     * het blok wordt op VELDNAAM gelezen en levert de vloer. */
    expect(readMergeBlock(read(MID_M3_FILE))?.validFromHz).toBe(VALID_FROM_HZ);
  });

  it('de splice-controle faalt de ±0,5 dB-conventie, zoals alle drie de merges van dit project', () => {
    /* I-2 mat het al: mid p95 1,37 dB, de woofers 1,53 en 2,58. Het is een
     * CONVENTIE en geen eigenschap (F0), en M-3 verandert er niets aan — de
     * merge is dezelfde op één fasewiskunde na. Onder 5 dB blijven is wat de
     * claim hier toetst; daarboven is er iets anders aan de hand. */
    const b = buildM3MidMerge();
    const resid: number[] = [];
    for (let i = 0; i < b.merge.freq.length; i++) {
      const f = b.merge.freq[i];
      if (f < SPLICE_BAND_HZ[0] || f > SPLICE_BAND_HZ[1]) continue;
      resid.push(Math.abs(b.merge.farDb[i] - (b.merge.nearAdjDb[i] + b.merge.fit.levelDb)));
    }
    resid.sort((x, y) => x - y);
    const p95 = resid[Math.floor(resid.length * 0.95)];
    expect(p95).toBeGreaterThan(0.5);
    expect(p95).toBeLessThan(5);
  });
});
