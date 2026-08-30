/**
 * M-K — DE FASE-INTEGRATIE, OP EEN HANDBEREKENING.
 *
 * De metriek-skill vraagt vier soorten: een eenheidstest tegen een
 * handberekening, een golden reference met tolerantie, een nieuwe-meting-test,
 * en een schone P6-lint. Dit bestand draagt de eerste en de derde; de tweede
 * staat in `goldenCasus1.test.ts` en in `casus1V2Candidates.test.ts`, de vierde
 * is `p6Lint.test.ts` (dit bestand noemt geen frequentie en geen grens).
 *
 * DE BANK IS ZO GEBOUWD DAT ELKE GROND ÉÉN PUNT WEGSTUURT, en dat de twee
 * defecten die V44 aanleiding gaven allebei zichtbaar zijn in dezelfde acht
 * punten: het DODE punt dat het historische overlapvenster binnenlaat (twee
 * takken op de geestvloer liggen per definitie binnen elk relatief venster), en
 * het punt waar één tak dertig dB weg is en dat het historische OCTAAFVENSTER
 * binnenlaat (fase waar de som hem niet voelt). Beide getallen zijn met de hand
 * na te rekenen; zij staan hieronder uitgeschreven.
 */

import { describe, expect, it } from 'vitest';
import {
  phaseIntegration,
  PHASE_INTEGRATION_VERSION,
  CONTROL_WINDOW_OCTAVES,
  type PhaseIntegrationInput,
} from './phaseIntegration.ts';
import { admitPhasePoints, PHASE_ADMISSION_VERSION } from '../../phaseAdmission.ts';
import { DEFAULT_OVERLAP_WINDOW_DB } from '../../integration.ts';

/* ------------------------------------------------------------------ *
 * De bank
 * ------------------------------------------------------------------ */

/** Acht punten, elk een octaaf uit elkaar: elke band is met de hand te lezen. */
const FREQ = [100, 200, 400, 800, 1600, 3200, 6400, 12800];

/** De geestwaarde van deze bank. Een conventie van de bouwer, niet van de maat. */
const GHOST_DB = -400;

/** Geldig van net onder het vierde punt tot net boven het zevende. */
const VALID: [number, number] = [300, 7000];

const LOWER_DB = [0, 0, GHOST_DB, 10, 10, 10, 10, 10];
const UPPER_DB = [0, 0, GHOST_DB, 5, -20, 5, 5, 5];
const LOWER_PH = [0, 0, 0, 10, 0, -170, 30, 0];
const UPPER_PH = [0, 0, 0, 40, 0, 170, -30, 0];

function bank(over: Partial<PhaseIntegrationInput> = {}): PhaseIntegrationInput {
  return {
    freq: FREQ,
    lower: { driver: 'low', db: LOWER_DB, phaseDeg: LOWER_PH, validHz: VALID },
    upper: { driver: 'high', db: UPPER_DB, phaseDeg: UPPER_PH, validHz: VALID },
    crossingHz: 1600,
    overlapWindowDb: DEFAULT_OVERLAP_WINDOW_DB,
    silentFloorDb: GHOST_DB,
    ...over,
  };
}

describe('M-K — de toelating op drie gronden, met de hand nagerekend', () => {
  it('elke grond stuurt precies de punten weg die zij hoort weg te sturen', () => {
    const r = phaseIntegration(bank());

    /* GROND (a) — meetgeldigheid [300, 7000]: 100, 200 en 12800 vallen erbuiten.
     * GROND (b) — 400 Hz: beide takken staan op de geestvloer.
     * GROND (c) — 1600 Hz: |10 − (−20)| = 30 dB, ruim buiten het venster.
     * Wat overblijft: 800, 3200 en 6400 Hz. */
    expect(r.rejected.validity).toBe(3);
    expect(r.rejected.silence).toBe(1);
    expect(r.rejected.level).toBe(1);
    expect(r.n).toBe(3);
    expect(r.bandHz).toEqual([800, 6400]);
    expect(r.rejected.validity + r.rejected.silence + r.rejected.level + r.n).toBe(FREQ.length);

    /* |wrap(10 − 40)| = 30, |wrap(−170 − 170)| = |wrap(−340)| = 20,
     * |wrap(30 − (−30))| = 60. Gemiddeld (30 + 20 + 60) / 3. */
    expect(r.meanAbsDeg).toBeCloseTo(110 / 3, 12);
    expect(r.grounds).toEqual({ validity: true, silence: true, level: true });
  });

  it('de twee controlekolommen laten elk hun eigen defect binnen', () => {
    const r = phaseIntegration(bank());

    /* HET OCTAAFVENSTER rond 1600 Hz is [800, 3200], geknipt op [300, 7000] dus
     * onveranderd, en het bevat 800, 1600 en 3200 Hz. Daar zit 1600 Hz bij —
     * het punt waar de bovenste tak dertig dB weg is en zijn fase de som niet
     * kan bewegen. Gemiddeld (30 + 0 + 20) / 3. */
    expect(r.control.octaveClipped.intendedHz).toEqual([800, 3200]);
    expect(r.control.octaveClipped.n).toBe(3);
    expect(r.control.octaveClipped.meanAbsDeg).toBeCloseTo(50 / 3, 12);

    /* HET KALE OVERLAPVENSTER laat álles binnen waar de takken binnen 20 dB van
     * elkaar liggen — inclusief 400 Hz, waar ze allebei DOOD zijn en |Δ| dus
     * exact 0. Dat is het mechanisme dat V38-fix in de zoekmaat vond, hier in
     * de fasemaat. Zeven punten, gemiddeld 110 / 7. */
    expect(r.control.overlapWindow.n).toBe(7);
    expect(r.control.overlapWindow.meanAbsDeg).toBeCloseTo(110 / 7, 12);

    /* En zij zijn alle drie VERSCHILLENDE getallen. Zonder deze assert zou een
     * implementatie die één getal onder drie namen teruggeeft even groen zijn. */
    const three = [r.meanAbsDeg, r.control.octaveClipped.meanAbsDeg, r.control.overlapWindow.meanAbsDeg];
    expect(new Set(three).size).toBe(3);
  });

  it('P2 — zonder geldigheid en zonder geestvloer IS de maat het kale overlapvenster', () => {
    /* De historische verzameling, en zij hoort bit-identiek terug te komen: de
     * twee gronden die niets te lezen krijgen ONTHOUDEN zich, zij vallen niet
     * terug op een grens die zij niet hebben (P4). */
    const r = phaseIntegration(
      bank({
        lower: { driver: 'low', db: LOWER_DB, phaseDeg: LOWER_PH, validHz: null },
        upper: { driver: 'high', db: UPPER_DB, phaseDeg: UPPER_PH, validHz: null },
        silentFloorDb: null,
      }),
    );
    expect(r.meanAbsDeg).toBe(r.control.overlapWindow.meanAbsDeg);
    expect(r.n).toBe(r.control.overlapWindow.n);
    expect(r.grounds).toEqual({ validity: false, silence: false, level: true });
  });

  it('grond (b) is niet dood: zonder geldigheid haalt zij de geest er alsnog uit', () => {
    /* DE TEGENPROEF DIE DE GROND VERDIENT. Waar (a) gewapend is voegt (b) niets
     * toe — de geldige band ligt per constructie binnen de gemeten
     * uitgestrektheid. Waar (a) ONTBREEKT is (b) het enige dat tussen de maat en
     * de stille geest staat, en dat is precies de v1-route. */
    const noValid = {
      lower: { driver: 'low', db: LOWER_DB, phaseDeg: LOWER_PH, validHz: null },
      upper: { driver: 'high', db: UPPER_DB, phaseDeg: UPPER_PH, validHz: null },
    };
    const zonder = phaseIntegration(bank({ ...noValid, silentFloorDb: null }));
    const met = phaseIntegration(bank({ ...noValid, silentFloorDb: GHOST_DB }));
    expect(zonder.n - met.n).toBe(1);
    expect(met.rejected.silence).toBe(1);
    expect(met.meanAbsDeg).not.toBe(zonder.meanAbsDeg);
  });

  it('grond (b) voegt niets toe zodra (a) gewapend is — gemeten, niet aangenomen', () => {
    const met = phaseIntegration(bank({ silentFloorDb: GHOST_DB }));
    const zonder = phaseIntegration(bank({ silentFloorDb: null }));
    /* Dezelfde toelating, ander etiket op de afwijzing: 400 Hz ligt binnen
     * [300, 7000] en zou dus door (a) NIET geweerd worden — deze bank is met
     * opzet strenger dan de werkelijkheid, waar de geldige band binnen de
     * gemeten uitgestrektheid ligt en de geest er per constructie buiten valt.
     * Vandaar dat hier de TOELATING wél verschilt en de claim over casus 1 in
     * `frozenNetlistGates.test.ts` staat, op echte data. */
    expect(met.n).toBe(zonder.n - 1);
  });
});

describe('M-K — nieuwe meting: de maat beweegt mee, en de twee helften apart', () => {
  it('een tak die wegzakt verlaat het oordeel via grond (c)', () => {
    const dropped = [...UPPER_DB];
    dropped[5] = -40; // 3200 Hz: van 5 dB naar 40 dB onder de andere tak
    const r = phaseIntegration(
      bank({ upper: { driver: 'high', db: dropped, phaseDeg: UPPER_PH, validHz: VALID } }),
    );
    expect(r.rejected.level).toBe(2);
    expect(r.n).toBe(2);
    // 800 en 6400 Hz blijven over: (30 + 60) / 2.
    expect(r.meanAbsDeg).toBeCloseTo(45, 12);
  });

  it('een ruimere meetgeldigheid laat punten toe, en verplaatst de maat', () => {
    const wide = phaseIntegration(bank({
      lower: { driver: 'low', db: LOWER_DB, phaseDeg: LOWER_PH, validHz: [50, 20000] },
      upper: { driver: 'high', db: UPPER_DB, phaseDeg: UPPER_PH, validHz: [50, 20000] },
    }));
    const narrow = phaseIntegration(bank());
    expect(wide.n).toBeGreaterThan(narrow.n);
    expect(wide.meanAbsDeg).not.toBe(narrow.meanAbsDeg);
    /* En de CONTROLEKOLOMMEN bewegen anders: het octaafvenster staat stil (zijn
     * knip lag niet op de geldigheid) en het kale overlapvenster óók, want het
     * las de geldigheid nooit. Zonder deze tegenproef zijn "de maat" en "de
     * controlekolom" niet te onderscheiden. */
    expect(wide.control.octaveClipped.meanAbsDeg).toBe(narrow.control.octaveClipped.meanAbsDeg);
    expect(wide.control.overlapWindow.meanAbsDeg).toBe(narrow.control.overlapWindow.meanAbsDeg);
  });

  it('het kruispunt verplaatst ALLEEN de controlekolom, nooit de maat', () => {
    /* De ±1-octaafband is bij V44 vervallen als toelating, en dit is wat dat
     * betekent: M-K leest het overnamegebied van het NETWERK af en niet van een
     * octaafregel om het kruispunt heen. */
    const a = phaseIntegration(bank({ crossingHz: 1600 }));
    const b = phaseIntegration(bank({ crossingHz: 3200 }));
    expect(b.meanAbsDeg).toBe(a.meanAbsDeg);
    expect(b.n).toBe(a.n);
    expect(b.control.octaveClipped.meanAbsDeg).not.toBe(a.control.octaveClipped.meanAbsDeg);
  });
});

describe('M-K — één implementatie, en zij is geversioneerd', () => {
  it('de metriek leest `admitPhasePoints` en bouwt de toelating niet na', () => {
    const direct = admitPhasePoints(
      FREQ,
      { db: LOWER_DB, phaseDeg: LOWER_PH, validHz: VALID },
      { db: UPPER_DB, phaseDeg: UPPER_PH, validHz: VALID },
      { overlapWindowDb: DEFAULT_OVERLAP_WINDOW_DB, silentFloorDb: GHOST_DB },
    );
    const viaMetric = phaseIntegration(bank());
    expect(viaMetric.meanAbsDeg).toBe(direct.meanAbsDeg);
    expect(viaMetric.n).toBe(direct.n);
    expect(viaMetric.bandHz).toEqual(direct.bandHz);
    expect(viaMetric.rejected).toEqual(direct.rejected);
  });

  it('beide versiestrings staan er, en de vensterbreedte is alleen voor de controle', () => {
    expect(PHASE_ADMISSION_VERSION).toBe('phase-admission/1.0');
    expect(PHASE_INTEGRATION_VERSION).toBe('phase-integration/2.0');
    expect(CONTROL_WINDOW_OCTAVES).toBeGreaterThan(0);
  });
});
