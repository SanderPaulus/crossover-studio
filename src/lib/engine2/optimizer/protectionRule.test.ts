/**
 * V47 — WELKE REGEL EEN ONBESCHERMDE BOVENSTE DRIVER VERBIEDT.
 *
 * DE BEVINDING WAAR DIT UIT VOORTKOMT. De volle-band-veiligheidspoort weigert
 * een tune in zijn geheel zodra het beschermingstekort van het GELEVERDE
 * netwerk meer dan een vaste speling boven dat van het ZAAD ligt. Dat is een
 * afstand tot een netwerk dat niemand tegen het doel van deze run heeft gelegd
 * (V31, één regel verderop), dus wat de regel toestaat beweegt mee met wat het
 * zaad toevallig droeg — en zij wordt toegepast IN PLAATS VAN een gestelde eis,
 * niet ernaast.
 *
 * WAT DIT BESTAND PINT, en wat elders staat. Hier staan de claims over de
 * TUNER: dat de default onaangeraakt is (P2 — élke v1-run leest wat hij las),
 * dat `'stated'` de zoektocht werkelijk BEREIKT (V23 — zonder die tegenproef is
 * elke andere claim even waar voor een sleutel die nergens op aangesloten is),
 * dat het de ANDERE veiligheidsvergelijkingen ongemoeid laat, en dat de eis
 * daarna nog steeds ABSOLUUT gehandhaafd wordt in de V31-vorm: een weigering
 * met de gemeten waarde en de eis, en géén zaad.
 *
 * De classificatie en de kandidaatverklaring staan in `choiceKeyGuard.test.ts`,
 * wat de eis op het ECHTE corpus doet in `frozenNetlistGates.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import { optimizeNetworkValues, type NetOptimizeOptions } from '../../netOptimizer.ts';
import type { GriddedResponse } from '../../dsp.ts';
import type { VxpPart } from '../../parsers/vxp.ts';
import { v2DriverZ, v2Responses, v2SeedParts, v2Safety, V2_GRID } from './v2.fixture.ts';

const { wBase, tBase } = v2Responses();
const driverZ = v2DriverZ();
const ADJUST = { offsetMm: 0, trimDb: 0, inverted: false } as const;
const SAFETY = v2Safety();

/**
 * Het niveauverschil dat de takken in de VEILIGHEIDSSET krijgen, dB.
 *
 * EEN FIXTUREKEUZE MET EEN REDEN, en de reden is dat de tweewegfixture het
 * geval anders niet kent. `protSqDb` telt het elektrische tekort boven −15 dB
 * ONDER `xoF/3`, met `xoF` de akoestische overname van de veiligheidsset. Met
 * de kale set ligt die overname zo laag dat de serie-C van de tweeter daar al
 * dertig dB weg is: beide armen meten nul en de vergelijking kan per
 * constructie niet vuren.
 *
 * Een niveauverschil tilt de overname op, en dan is de beschermingsband breed
 * genoeg dat de elektrische overdracht er werkelijk boven de vloer uitkomt —
 * precies de situatie die casus 1 op de HOGE kruising van nature heeft
 * (overname 1,7–2,0 kHz, dus de band reikt tot 570–660 Hz, waar een serie-C van
 * enkele µF in ~6 Ω maar tien tot vijftien dB verzwakt).
 *
 * Het getal is niet gekozen om een drempel te halen maar om het GEVAL te laten
 * bestaan, en de test toont dat allebei: bij nul vuurt de vergelijking niet, en
 * de tegenproef eronder laat zien dat de hefboom dus werkelijk iets doet.
 */
const SAFETY_LEVEL_OFFSET_DB = 30;

const lifted = (r: GriddedResponse, db: number): GriddedResponse => ({
  freq: [...r.freq],
  spl: r.spl.map((v) => v + db),
  phaseDeg: [...r.phaseDeg],
});

const safetySet = (offsetDb: number) => ({
  freqs: SAFETY.freqs,
  w: lifted(SAFETY.w, offsetDb),
  t: SAFETY.t,
  z: SAFETY.z,
});

/** De R/L/C-waarden — wat "hetzelfde netwerk" hier betekent. */
const values = (ps: readonly VxpPart[]): string =>
  JSON.stringify(
    ps
      .filter((p) => p.partId !== undefined)
      .map((p) => [p.partId, p.params.map((q) => [q.name, q.value])]),
  );

const SEED = values(v2SeedParts());

function run(offsetDb: number, extra: Partial<NetOptimizeOptions> = {}) {
  return optimizeNetworkValues(v2SeedParts(), V2_GRID, wBase, tBase, driverZ, ADJUST, {
    phasePriority: 0.5,
    staged: { rippleDb: 1.5, phaseDeg: 8 },
    maxIterations: 200,
    safety: safetySet(offsetDb),
    rejectedTuneReport: true,
    ...extra,
  });
}

describe('V47 — de beschermingsregel als keuze van de tuner', () => {
  it('de fixture kent het geval werkelijk: zonder hefboom vuurt de vergelijking niet', () => {
    /* De tegenproef die de hefboom eerlijk maakt. Zonder haar is "bij 30 dB
     * vuurt hij" niet te onderscheiden van een regel die altijd vuurt, en dan
     * zou de vergelijking hieronder niets aantonen. */
    const flat = run(0);
    expect(flat.safetyKinds ?? []).not.toContain('protection');
    expect(values(flat.parts)).not.toBe(SEED);
  });

  it('de zaadregel vuurt, en zij meet de afstand tot het ZAAD (V47-instrumentatie)', () => {
    const refused = run(SAFETY_LEVEL_OFFSET_DB);
    expect(refused.safetyKinds).toContain('protection');
    expect(refused.refusal?.by).toBe('safety-gate');
    /* De getallen naast de zin (A3g). Zonder hen zegt een weigering "slechter
     * geworden" zonder te zeggen SLECHTER DAN WAT, en juist dat antwoord bleek
     * op casus 1 het hele punt te zijn. */
    const m = refused.refusal?.measured?.find((x) => /protection/.test(x.quantity));
    expect(m, 'de weigering draagt geen meting').toBeTruthy();
    expect(m!.result).toBeGreaterThan(m!.seed + m!.allowance);
    // En wat er teruggegeven wordt is het ZAAD, ongewijzigd en zo gemeld.
    expect(refused.tuned).toBe(0);
    expect(values(refused.parts)).toBe(SEED);
  });

  it('P2 — afwezig en de historische regel zijn byte-identieke runs', () => {
    /* De default is niet aangeraakt: élke v1-run, en élke v2-run op een project
     * dat geen aandrijfgrens stelt, leest wat hij las. Getoetst op een run die
     * de vergelijking WEL bereikt, want op een run die haar niet bereikt is
     * deze claim vacuüm. */
    const absent = run(SAFETY_LEVEL_OFFSET_DB);
    const legacy = run(SAFETY_LEVEL_OFFSET_DB, { protectionRule: 'seed' });
    expect(values(legacy.parts)).toBe(values(absent.parts));
    expect(legacy.safetyKinds).toEqual(absent.safetyKinds);
    expect(legacy.safetyNote).toBe(absent.safetyNote);
  });

  it("de regel BEREIKT de zoektocht — dezelfde run levert met 'stated' wél een netwerk", () => {
    /* De dragende claim. Zonder haar zijn de andere even waar voor een sleutel
     * die nergens op aangesloten is (V23), en dat geval heeft dit project vier
     * keer eerder aangetroffen. */
    const seedRule = run(SAFETY_LEVEL_OFFSET_DB, { protectionRule: 'seed' });
    const stated = run(SAFETY_LEVEL_OFFSET_DB, { protectionRule: 'stated' });
    expect(seedRule.tuned).toBe(0);
    expect(stated.safetyKinds ?? []).not.toContain('protection');
    expect(stated.tuned).toBeGreaterThan(0);
    expect(values(stated.parts)).not.toBe(values(seedRule.parts));
  });

  it("'stated' laat de ANDERE veiligheidsvergelijkingen staan", () => {
    /* Het is geen schakelaar op de veiligheidspoort. Kruising, vallei en
     * belasting worden nergens absoluut gehandhaafd op deze route, dus zij
     * blijven vergelijken met het zaad — en een sleutel die stilletjes alle
     * vier zou uitzetten is precies de vergissing die deze test uitsluit. */
    const offset = SAFETY_LEVEL_OFFSET_DB - 6;
    const seedRule = run(offset, { protectionRule: 'seed' });
    const stated = run(offset, { protectionRule: 'stated' });
    expect(seedRule.safetyKinds).toContain('valley');
    expect(stated.safetyKinds).toContain('valley');
    expect(values(stated.parts)).toBe(values(seedRule.parts));
  });

  it("de eis wordt daarna ABSOLUUT gehandhaafd, in de V31-vorm en zonder zaad", () => {
    /* Waar de zaadvergelijking wegvalt komt de poort ervoor in de plaats, en
     * zij is strenger van vorm: `gateViolation` wordt geraadpleegd op ÉLK punt
     * waar een pas een netwerk accepteert, en een run die niets toelaatbaars
     * vindt komt terug als weigering met de gemeten waarde en de eis in plaats
     * van als een zaad dat niemand tegen dit doel heeft gelegd (V31, V33). */
    const refused = run(SAFETY_LEVEL_OFFSET_DB, {
      protectionRule: 'stated',
      gateViolation: () => 'M-C: -12.4 dB exceeds the stated limit of -25.0 dB on tweeter',
    });
    expect(refused.refusal?.by).toBe('active-gate');
    expect(refused.refusal?.kinds).toEqual(['gate']);
    expect(refused.refusal?.reason).toContain('exceeds the stated limit');
    expect(refused.refusal?.note).toContain('delivers no network');
    expect(refused.tuned).toBe(0);
    // ...en de geweigerde tune reist mee als RAPPORTAGE, nooit als netwerk.
    expect(refused.rejectedParts).toBeDefined();
    expect(values(refused.rejectedParts!)).not.toBe(SEED);
  });
});
