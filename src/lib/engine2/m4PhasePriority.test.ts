/**
 * M-4 — DE SCHUIF ALS GESTELDE KETENSLEUTEL, EN WAT DE TABEL ERVAN LEEST.
 *
 * Vier groepen, en geen ervan kost een ketenrun: wat een ketenrun bewijst staat
 * in `chainChoices.test.ts` (de twee live armen daar reproduceren de
 * inherited-arm byte voor byte) en in `casus1V2Candidates.test.ts`.
 *
 *  1. DE BRANCHES — `system.branches`, de takken waarop M-K rustte, nu
 *     uitgedeeld in plaats van weggegooid. De dragende claim is dat zij
 *     OPTELLEN tot `sumDb`: zonder die tegenproef is "dit zijn de takken" niet
 *     te onderscheiden van "dit zijn takken".
 *
 *  2. DE VERKLARING — de zesde ketensleutel, in de vorm die de andere vijf
 *     dragen: onvoorwaardelijk gesteld, uit de motor-standaard afgeleid, een
 *     gestelde waarde wint, en de vingerafdruk beweegt ermee.
 *
 *  3. HET VELD — P2. Zonder gestelde posities bouwt `casus1Field` het veld dat
 *     hij altijd bouwde, en zijn sleutel is byte-identiek; mét posities komen
 *     er kandidaten bij en verdwijnt er geen.
 *
 *  4. DE NULDIEPTE — de LEZING die naast M-K staat. Met de tegenproef die haar
 *     iets waard maakt: zonder omkering is er geen nul.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  casus1Files,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
} from './casus1.fixture.ts';
import { buildReport, type EngineV2Report } from './report.ts';
import { corpusBank } from './casus1Corpora.fixture.ts';
import { candidateFieldKey } from './predesign/candidateField.ts';
import {
  casus1Field,
  casus1V2Declaration,
  CASUS1_M4_PHASE_PRIORITY,
  CASUS1_M4_STATED_ON,
  CASUS1_M4_STATED_PER_AXIS_HZ,
  CASUS1_V2_SETTINGS,
} from './casus1V2.fixture.ts';
import { declareCandidateChainChoices } from './optimizer/candidateDeclaration.ts';
import { chainDeclarationKey, withDeclaredChainChoices } from './optimizer/chainChoices.ts';
import { DEFAULT_PHASE_PRIORITY } from '../netOptimizer.ts';

const golden = loadGolden();
const bank = corpusBank(golden, 'm3');

/** Eén rapport op een geladen netlist, en één op geen netlist. */
const WITH = bank.report('KAND_V2_1');
const WITHOUT: EngineV2Report = (() => {
  const manifest = casus1Manifest(golden);
  const files = casus1Files(manifest);
  return buildReport({
    manifest,
    files,
    filter: null,
    geometry: casus1Geometry(golden),
    settings: bank.settings,
  });
})();

const toC = (db: number, deg: number) => ({
  re: Math.pow(10, db / 20) * Math.cos((deg * Math.PI) / 180),
  im: Math.pow(10, db / 20) * Math.sin((deg * Math.PI) / 180),
});

describe('M-4 — de takken die het M-K-oordeel droegen, uitgedeeld', () => {
  it('staan er met een netlist en NIET zonder (P4: geen netwerk, geen takken)', () => {
    expect(WITH.system.branches).not.toBeNull();
    expect(WITHOUT.system.branches).toBeNull();
    expect(WITHOUT.system.sumDb).toBeNull();
  });

  it('zijn de drie wegen, in de volgorde laag→hoog van het rapport zelf', () => {
    expect(WITH.system.branches!.map((b) => b.driver)).toEqual(WITH.driversLowToHigh);
    for (const b of WITH.system.branches!) {
      expect(b.db.length).toBe(WITH.analysisGrid!.length);
      expect(b.phaseDeg.length).toBe(WITH.analysisGrid!.length);
    }
  });

  it('TELLEN OP TOT `sumDb` — de claim die zegt dat het de takken van dít oordeel zijn', () => {
    /* Zonder deze tegenproef is "dit zijn de takken" niet te onderscheiden van
     * "dit zijn takken": een tweede afleiding die per ongeluk het GEKNIPTE
     * verre veld las zou er even geldig uitzien en een andere som geven. De
     * marge is de afronding van de optelling zelf en geen tolerantie op een
     * grootheid. */
    const grid = WITH.analysisGrid!;
    let worst = 0;
    for (let i = 0; i < grid.length; i++) {
      let re = 0;
      let im = 0;
      for (const b of WITH.system.branches!) {
        const z = toC(b.db[i], b.phaseDeg[i]);
        re += z.re;
        im += z.im;
      }
      worst = Math.max(worst, Math.abs(20 * Math.log10(Math.hypot(re, im)) - WITH.system.sumDb![i]));
    }
    expect(worst).toBeLessThan(1e-9);
  });

  it('dragen de fase waarop M-K per paar oordeelde — het spoor en de maat lezen één ding', () => {
    /* M-K is een gemiddelde |faseverschil| over de TOEGELATEN punten. Die
     * verzameling zit niet in `branches` — dat is juist de arbeidsdeling — maar
     * de fase waarover hij middelt wel, dus het gemiddelde over de band van het
     * paar moet in dezelfde orde liggen als M-K. Een tak die per ongeluk de
     * ONGEFILTERDE meting droeg zou hier ordes naast zitten. */
    const grid = WITH.analysisGrid!;
    for (const p of WITH.system.phaseTracking) {
      const lo = WITH.system.branches!.find((b) => b.driver === p.lower)!;
      const hi = WITH.system.branches!.find((b) => b.driver === p.upper)!;
      let sum = 0;
      let n = 0;
      for (let i = 0; i < grid.length; i++) {
        if (grid[i] < p.bandHz[0] || grid[i] > p.bandHz[1]) continue;
        let d = hi.phaseDeg[i] - lo.phaseDeg[i];
        while (d > 180) d -= 360;
        while (d <= -180) d += 360;
        sum += Math.abs(d);
        n++;
      }
      expect(n).toBeGreaterThan(0);
      expect(Math.abs(sum / n - p.meanAbsDeg)).toBeLessThan(p.meanAbsDeg + 10);
    }
  });
});

describe('M-4 — de zesde ketensleutel', () => {
  it('wordt ONVOORWAARDELIJK gesteld, uit de motor-standaard en niet uit een casusgetal', () => {
    const bare = declareCandidateChainChoices({ stated: {} });
    expect(bare.stated.phasePriority).toBe(DEFAULT_PHASE_PRIORITY);
    expect(bare.absent.some((a) => a.key === 'phasePriority')).toBe(false);
    /* P6 — de standaard is de motor-standaard en niet die van casus 1. Dat zij
     * hier hetzelfde getal zijn is een TOEVAL dat deze claim vastlegt: de dag
     * dat de fixture 0,75 gaat stellen moet de derivatie nog steeds 0,5 geven. */
    expect(DEFAULT_PHASE_PRIORITY).toBe(0.5);
  });

  it('een gestelde waarde wint, en de vingerafdruk beweegt ermee', () => {
    const stated = declareCandidateChainChoices({ stated: { phasePriority: CASUS1_M4_PHASE_PRIORITY } });
    expect(stated.stated.phasePriority).toBe(CASUS1_M4_PHASE_PRIORITY);
    const a = JSON.stringify(chainDeclarationKey(declareCandidateChainChoices({ stated: {} })));
    const b = JSON.stringify(chainDeclarationKey(stated));
    expect(a).not.toBe(b);
    expect(b).toContain('phasePriority');
  });

  it('overschrijft de ketensettings, en schrijft op een run van 50/50 hetzelfde getal terug (P2)', () => {
    /* DIT IS WAAROM HET M-2b-CORPUS BYTE-IDENTIEK BLIJFT. De verklaring wint
     * van de settings — dat is wat `withDeclaredChainChoices` doet — dus de
     * vraag is niet of hij schrijft maar WAT. Op elke casus-1-run zonder
     * M-4-optie is dat het getal dat er al stond. */
    const input = { settings: { phasePriority: CASUS1_V2_SETTINGS.phasePriority } };
    const same = withDeclaredChainChoices(input, declareCandidateChainChoices({ stated: {} }));
    expect(same.settings.phasePriority).toBe(CASUS1_V2_SETTINGS.phasePriority);
    const moved = withDeclaredChainChoices(
      input,
      declareCandidateChainChoices({ stated: { phasePriority: CASUS1_M4_PHASE_PRIORITY } }),
    );
    expect(moved.settings.phasePriority).toBe(CASUS1_M4_PHASE_PRIORITY);
    expect(moved.settings.phasePriority).not.toBe(CASUS1_V2_SETTINGS.phasePriority);
  });

  it('de casus-1-verklaring stelt de schuif van de fixture, en de M-4-optie wint ervan', () => {
    const field = casus1Field(WITH);
    const c = field.field.candidates[0];
    expect(casus1V2Declaration(c).chainDeclaration.stated.phasePriority).toBe(
      CASUS1_V2_SETTINGS.phasePriority,
    );
    expect(
      casus1V2Declaration(c, undefined, { phasePriority: CASUS1_M4_PHASE_PRIORITY }).chainDeclaration.stated
        .phasePriority,
    ).toBe(CASUS1_M4_PHASE_PRIORITY);
  });
});

describe('M-4 — het veld met gestelde posities ernaast', () => {
  const plain = casus1Field(WITH);
  const withStated = casus1Field(WITH, { perAxisHz: CASUS1_M4_STATED_PER_AXIS_HZ, on: CASUS1_M4_STATED_ON });

  it('P2 — zonder gestelde posities is het veld en zijn SLEUTEL onveranderd', () => {
    /* De E-2-regel, één veld verder: een run die niets stelt hoort byte-identiek
     * te stempelen aan elke casus-1-run sinds C-2. */
    expect(candidateFieldKey(plain.field)).toEqual(candidateFieldKey(casus1Field(WITH).field));
    expect(plain.field.parameters.statedSize).toBeUndefined();
    expect(plain.field.candidates.every((c) => c.stated === undefined)).toBe(true);
  });

  it('mét posities komen er precies twee kandidaten BIJ, en er verdwijnt er geen', () => {
    const stated = withStated.field.candidates.filter((c) => c.stated);
    expect(stated.length).toBe(2);
    expect(withStated.field.candidates.length).toBe(plain.field.candidates.length + 2);
    expect(withStated.field.parameters.derivedSize).toBe(plain.field.parameters.derivedSize);
    /* De gestelde posities zijn de gevraagde, op de as die deze sessie varieert. */
    expect(stated.map((c) => c.crossings[0].hz).sort((a, b) => a - b)).toEqual(
      [...CASUS1_M4_STATED_PER_AXIS_HZ[0]].sort((a, b) => a - b),
    );
    for (const c of stated) expect(c.crossings[1].hz).toBe(CASUS1_M4_STATED_PER_AXIS_HZ[1][0]);
  });

  it('en zij liggen BINNEN beide vensters — deze sessie stapt nergens overheen', () => {
    /* Anders dan U-5, waar twee van de drie gestelde posities buiten het venster
     * lagen en dat de hele bevinding was. Hier komen alle drie de getallen uit
     * het afgeleide veld zelf, dus een positie buiten het venster zou betekenen
     * dat het venster sinds M-2b bewogen is. */
    for (const c of withStated.field.candidates.filter((x) => x.stated)) {
      expect(c.stated!.outsideWindow, `${c.label} ligt buiten een venster`).toBe(false);
    }
  });
});

describe('M-4 — de nuldiepte met omgepoolde mid, als LEZING', () => {
  const grid = WITH.analysisGrid!;
  const branches = WITH.system.branches!;

  /** De diepte van de nul rond één overname; `flip` = welke weg omgepoold wordt. */
  const depthAt = (crossingHz: number, flip: string | null): number => {
    let best = -Infinity;
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] < crossingHz / 2 || grid[i] > crossingHz * 2) continue;
      let nRe = 0;
      let nIm = 0;
      let fRe = 0;
      let fIm = 0;
      for (const b of branches) {
        const z = toC(b.db[i], b.phaseDeg[i]);
        nRe += z.re;
        nIm += z.im;
        const s = b.driver === flip ? -1 : 1;
        fRe += s * z.re;
        fIm += s * z.im;
      }
      const d = 20 * Math.log10(Math.hypot(nRe, nIm)) - 20 * Math.log10(Math.hypot(fRe, fIm));
      if (Number.isFinite(d) && d > best) best = d;
    }
    return best;
  };

  it('DE TEGENPROEF: zonder omkering is er geen nul', () => {
    /* Dit is de claim die de rest iets waard maakt. Een "nuldiepte" die ook
     * zonder omkering tien dB leest, meet de rimpel van de som en niet de
     * fasetracking van een paar. */
    for (const c of WITH.crossings) {
      if (!Number.isFinite(c.fHz)) continue;
      expect(depthAt(c.fHz, null)).toBeCloseTo(0, 9);
    }
  });

  it('met de mid omgepoold stort de som in bij BEIDE overnames', () => {
    /* Eén omkering, twee nullen — de mid zit in beide paren, en dat is precies
     * waarom de mid de weg is die je omdraait op een drieweg. Ondergrens 6 dB:
     * een ontwerp dat zijn overname niet in fase neemt haalt dat niet, en een
     * scherper getal zou een EIS zijn die niemand gesteld heeft (P4). */
    for (const c of WITH.crossings) {
      if (!Number.isFinite(c.fHz)) continue;
      expect(depthAt(c.fHz, 'mid'), `${c.lower}→${c.upper}`).toBeGreaterThan(6);
    }
  });
});

describe('M-4 — wat de twee gestelde runs opleverden, uit het opgenomen blad', () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const FIX = join(HERE, '..', '..', '..', 'test-fixtures');
  const herkomst = JSON.parse(readFileSync(join(FIX, 'casus1_m4_herkomst.json'), 'utf-8')) as {
    phase_priority: number;
    gestelde_kruispunten_hz: number[][];
    bestanden: { key: string; tegenhanger: string }[];
    kandidaat_uitkomst: Record<string, { bevroren: boolean; reden?: string; regels?: string[]; tegenhanger?: string }>;
  };
  const table = JSON.parse(readFileSync(join(FIX, 'casus1_m4_vergelijking.json'), 'utf-8')) as {
    paren: { kruispunt_hz: number; basis: Record<string, unknown>; fase: Record<string, unknown> }[];
    fit_onzekerheid: {
      model_gevoeligheid_ms: number;
      residu_gevoeligheid_ms: number;
      graden_bij_overname: { paar: string; hz: number; van_toepassing: boolean; model_graden: number | null }[];
    };
  };

  it('de herkomst zegt wat de run stelde, en het is wat de fixture stelt', () => {
    expect(herkomst.phase_priority).toBe(CASUS1_M4_PHASE_PRIORITY);
    expect(herkomst.gestelde_kruispunten_hz).toEqual(
      CASUS1_M4_STATED_PER_AXIS_HZ.map((a) => [...a]),
    );
  });

  it('ÉÉN van de twee is bevroren en de ander is een WEIGERING met zijn regel', () => {
    /* DE UITKOMST VAN DE SESSIE, als claim en niet als zin. De opdracht vroeg
     * er twee te bevriezen; de motor leverde er één. Een netlist die een
     * gewapende eis niet haalt IS geen netlist (V31), en M-D is bij 1,4 dB
     * gebleven — niets versoepeld. Wat er dan overblijft is de weigering MET de
     * grond, en die hoort even goed geboekt te worden als een levering. */
    const outcomes = Object.values(herkomst.kandidaat_uitkomst);
    expect(outcomes.length).toBe(2);
    expect(outcomes.filter((o) => o.bevroren).length).toBe(1);
    const refused = outcomes.find((o) => !o.bevroren)!;
    expect(refused.regels).toEqual(['budget']);
    expect(refused.reden).toMatch(/resonant lift/);
    /* En de bevroren netlist draagt een tegenhanger die bestaat. */
    expect(herkomst.bestanden.length).toBe(1);
    expect(golden.manifest_en_geometrie.netlists[herkomst.bestanden[0].tegenhanger]).toBeDefined();
  });

  it('de vergelijkingstabel reproduceert uit een VERSE meting', () => {
    /* De M-3-vorm: het opgenomen blad is afgeleid, dus het hoort uit dezelfde
     * bank opnieuw te komen. Reproduceert het niet, dan is er iets aan de
     * meetbank of aan een netlist bewogen en niet aan de tabel. */
    for (const pair of table.paren) {
      for (const side of ['basis', 'fase'] as const) {
        const r = pair[side] as { key: string; mk: { pair: string; deg: number }[]; rmsFullDb: number; minZOhm: number; bomEur: number };
        const rep = bank.report(r.key);
        for (const m of r.mk) {
          const fresh = rep.system.phaseTracking.find((p) => `${p.lower}→${p.upper}` === m.pair);
          expect(fresh, `${r.key} ${m.pair}`).toBeDefined();
          expect(Number(fresh!.meanAbsDeg.toFixed(2)), `${r.key} ${m.pair} M-K`).toBe(m.deg);
        }
        expect(Number((rep.system.response?.rmsDeviationDb ?? NaN).toFixed(3))).toBe(r.rmsFullDb);
        expect(Number((rep.metrics.epdr?.minZOhm ?? NaN).toFixed(3))).toBe(r.minZOhm);
      }
    }
  });

  it('DE BEVINDING: 25/75 leverde op dit kruispunt GEEN strakkere fase', () => {
    /* Als CLAIM en niet als zin, want zij is het antwoord op de vraag waarvoor
     * de sessie bestond. Een latere run die het tegendeel levert hoort hier om
     * te vallen — dat is precies wanneer iemand moet kijken. */
    const pair = table.paren[0];
    const base = pair.basis as { mk: { pair: string; deg: number }[]; bomEur: number };
    const phase = pair.fase as { mk: { pair: string; deg: number }[]; bomEur: number };
    const wmBase = base.mk.find((m) => m.pair === 'woofer→mid')!.deg;
    const wmPhase = phase.mk.find((m) => m.pair === 'woofer→mid')!.deg;
    expect(wmPhase).toBeGreaterThan(wmBase);
    /* En hij was duurder: de BOM is een kolom en geen oordeel (P4), maar het
     * verschil is de rekening die de opdracht vroeg. */
    expect(phase.bomEur).toBeGreaterThan(base.bomEur);
  });

  it('de fit-onzekerheid geldt ONDER de splice en nergens anders', () => {
    /* De helft die A3h afdwingt: boven de splice IS de merge het verre veld,
     * dus daar draagt de gefitte vertraging geen enkele graad, en een getal
     * afdrukken zou plausibel en fout zijn. */
    const wm = table.fit_onzekerheid.graden_bij_overname.find((g) => g.paar === 'woofer→mid')!;
    const mt = table.fit_onzekerheid.graden_bij_overname.find((g) => g.paar === 'mid→tweeter')!;
    expect(wm.van_toepassing).toBe(true);
    expect(wm.model_graden).toBeGreaterThan(0);
    expect(mt.van_toepassing).toBe(false);
    expect(mt.model_graden).toBeNull();
    /* EN DE MAAT VAN HET DING: de onzekerheid van de merge-fit ligt in dezelfde
     * orde als het faseverschil waarover deze sessie gaat. Dat is het
     * verwachtingsmanagement, als getal. */
    const pair = table.paren[0];
    const base = (pair.basis as { mk: { pair: string; deg: number }[] }).mk.find((m) => m.pair === 'woofer→mid')!.deg;
    const phase = (pair.fase as { mk: { pair: string; deg: number }[] }).mk.find((m) => m.pair === 'woofer→mid')!.deg;
    expect(wm.model_graden!).toBeGreaterThan(Math.abs(phase - base));
  });
});
