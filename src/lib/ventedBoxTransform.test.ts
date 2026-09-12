/**
 * M-2 — DE VOLUMETRANSFORMATIE, ALS ZUIVERE NATUURKUNDE GETOETST.
 *
 * Vier soorten claim, de vorm die de metriek-procedure vraagt. HANDBEREKENING:
 * bij de afstemming is de poort/conus-verhouding exact `j·Q_l`, en dat is met de
 * hand na te rekenen uit de formule zonder een enkele meting. GRONDWAARHEID: de
 * kastformulering reproduceert de poortmassa die casus 2's grondwaarheid
 * opschrijft — een onafhankelijke implementatie met een bekend antwoord. P2: met
 * twee gelijke kasten is de transformatie EXACT de identiteit. NIEUWE MÉTING:
 * de twee fits vinden een gestelde kast terug, en de transformatie beweegt in de
 * richting die de natuurkunde voorschrijft.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { abs, arg, cplx, type Complex } from './complex.ts';
import {
  C_AIR,
  RHO_AIR,
  VENTED_BOX_TRANSFORM_VERSION,
  blockedImpedance,
  boxLoad,
  coneVelocityRatio,
  fitBlockedImpedance,
  fitPortConeRatio,
  portToConeRatio,
  samePortInVolume,
  totalToConeRatio,
  volumeTransfer,
  type DriverFacts,
  type VentedBox,
} from './ventedBoxTransform.ts';

const deg = (c: Complex) => (arg(c) * 180) / Math.PI;

/** Een kast met ronde getallen, zodat elke aflezing met de hand klopt. */
const ROUND: VentedBox = { volumeL: 40, tuningHz: 30, leakageQ: 5 };

describe('M-2 handberekening — de poortdeler bij de afstemming', () => {
  /**
   * BIJ f_b is de noemer `1 − 1 + j/Q_l = j/Q_l`, dus de verhouding is
   * `−1/(j/Q_l) = j·Q_l`: magnitude EXACT Q_l en fase exact +90°. Geen meting
   * nodig, en het is de scherpste controle op de hele formulering.
   */
  it('bij f_b is U_p/U_d exact j·Q_l', () => {
    const r = portToConeRatio(ROUND.tuningHz, ROUND);
    expect(abs(r)).toBeCloseTo(ROUND.leakageQ, 10);
    expect(deg(r)).toBeCloseTo(90, 8);
    expect(r.re).toBeCloseTo(0, 10);
  });

  /** Ruim ONDER de afstemming heft de poort de conus op: de verhouding is −1. */
  it('ruim onder f_b nadert de verhouding −1, dus de som nadert nul', () => {
    const low = ROUND.tuningHz / 50;
    const r = portToConeRatio(low, ROUND);
    expect(abs(r)).toBeCloseTo(1, 3);
    expect(Math.abs(deg(r))).toBeGreaterThan(179);
    expect(abs(totalToConeRatio(low, ROUND))).toBeLessThan(0.02);
  });

  /** Ruim ERBOVEN doet de poort niets: de som IS de conus. */
  it('ruim boven f_b nadert de verhouding nul, dus de som nadert de conus', () => {
    const high = ROUND.tuningHz * 50;
    expect(abs(portToConeRatio(high, ROUND))).toBeLessThan(0.001);
    expect(abs(totalToConeRatio(high, ROUND))).toBeCloseTo(1, 3);
  });

  /** Één octaaf boven f_b is de noemer `1 − 4 + 2j/Q_l`, dus |r| = 1/√(9+4/Q_l²). */
  it('één octaaf boven f_b klopt met de algebra', () => {
    const r = portToConeRatio(ROUND.tuningHz * 2, ROUND);
    const expected = 1 / Math.hypot(3, 2 / ROUND.leakageQ);
    expect(abs(r)).toBeCloseTo(expected, 10);
  });
});

describe('M-2 grondwaarheid — de kastformulering tegen casus 2', () => {
  /**
   * CASUS 2 IS EEN SYNTHETISCHE CASUS MET GRONDWAARHEID, en haar generator is
   * een onafhankelijke implementatie van dezelfde natuurkunde. Haar
   * grondwaarheid schrijft de POORTMASSA op; deze module leidt die af uit
   * volume en afstemming. Dat de twee op vier cijfers overeenkomen is de enige
   * controle in dit bestand die niet uit de formule zelf volgt.
   */
  it('de poortmassa reproduceert die van casus 2 grondwaarheid', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const truth = JSON.parse(
      readFileSync(join(here, '..', '..', 'test-fixtures', 'casus2', 'grondwaarheid.json'), 'utf8'),
    ) as { drivers: { woofer: { kast: { volume_l: number; f_b_hz: number; lek_Q: number; poortmassa_kg_per_m4: number } } } };
    const k = truth.drivers.woofer.kast;
    const box: VentedBox = { volumeL: k.volume_l, tuningHz: k.f_b_hz, leakageQ: k.lek_Q };

    /* M_ap is de imaginaire helft van de poorttak gedeeld door ω. */
    const f = box.tuningHz;
    const { Zp } = boxLoad(f, box);
    const mapFromModule = Zp.im / (2 * Math.PI * f);
    expect(mapFromModule).toBeCloseTo(k.poortmassa_kg_per_m4, 3);

    /* En R_ap volgt uit diezelfde grondwaarheid via de lekkage-Q. */
    const Cab = (box.volumeL * 1e-3) / (RHO_AIR * C_AIR * C_AIR);
    expect(Zp.re).toBeCloseTo(Math.sqrt(k.poortmassa_kg_per_m4 / Cab) / k.lek_Q, 6);
  });

  /** De compliantie volgt uit V/(ρc²) en nergens anders uit. */
  it('de kastcompliantie is V/(rho c kwadraat)', () => {
    const f = 100;
    const { Zc } = boxLoad(f, ROUND);
    const Cab = (ROUND.volumeL * 1e-3) / (RHO_AIR * C_AIR * C_AIR);
    expect(Zc.im).toBeCloseTo(-1 / (2 * Math.PI * f * Cab), 6);
    expect(Zc.re).toBe(0);
  });
});

describe('M-2 P2 — twee gelijke kasten geven de identiteit, exact', () => {
  const driver: DriverFacts = { sdM2: 255e-4, blTm: 10.45, count: 2 };
  const zb = cplx(5.8, 1.2);
  const zOne = cplx(12, -4);

  /**
   * DE DRAGENDE EIGENSCHAP. Niet bij benadering: de deltaterm is per
   * constructie nul, dus élke teruggave is bit-voor-bit 1. Zou dit ooit een
   * tolerantie nodig hebben, dan telt de transformatie iets op dat er niet in
   * hoort.
   */
  it('volumeTransfer is exact 1 op alle drie de kanalen', () => {
    for (const f of [12, 20, 30, 45, 80, 200, 500]) {
      const t = volumeTransfer(f, zOne, zb, ROUND, { ...ROUND }, driver);
      for (const [name, c] of [['cone', t.cone], ['port', t.port], ['total', t.total]] as const) {
        expect(c.re, `${name} @ ${f} Hz`).toBe(1);
        expect(c.im, `${name} @ ${f} Hz`).toBe(0);
      }
    }
  });

  it('coneVelocityRatio is exact 1 bij gelijke kasten', () => {
    for (const f of [15, 30, 60, 120]) {
      const r = coneVelocityRatio(f, zOne, zb, ROUND, { ...ROUND }, driver);
      expect(r.re).toBe(1);
      expect(r.im).toBe(0);
    }
  });
});

describe('M-2 nieuwe meting — de fits vinden een gestelde kast terug', () => {
  /**
   * De fit krijgt een kromme die door DEZE module is opgewekt, dus hij hoort
   * haar exact terug te vinden. Dat toetst niet de natuurkunde maar de
   * ZOEKER — of hij in het goede minimum landt en niet in een hoek blijft
   * hangen, wat bij de eerdere T/S-fits juist het probleem was.
   */
  it('fitPortConeRatio vindt f_b, Q_l en de schaal terug', () => {
    const truth: VentedBox = { volumeL: 53.2, tuningHz: 29.4, leakageQ: 3.6 };
    const scale = 2.05;
    const ratio: { freqHz: number; value: Complex }[] = [];
    for (let i = 0; i < 200; i++) {
      const f = 8 * Math.pow(200 / 8, i / 199);
      const r = portToConeRatio(f, truth);
      ratio.push({ freqHz: f, value: cplx(scale * r.re, scale * r.im) });
    }
    const fit = fitPortConeRatio(ratio, { tuningHz: [20, 40], leakageQ: [1, 12], scale: [0.5, 4] });
    expect(fit).not.toBeNull();
    expect(fit!.tuningHz).toBeCloseTo(truth.tuningHz, 2);
    expect(fit!.leakageQ).toBeCloseTo(truth.leakageQ, 2);
    expect(fit!.scale).toBeCloseTo(scale, 3);
    expect(fit!.residual).toBeLessThan(1e-4);
    expect(fit!.points).toBe(200);
  });

  it('fitPortConeRatio weigert een kromme die te kort is', () => {
    expect(fitPortConeRatio([{ freqHz: 30, value: cplx(1) }], { tuningHz: [20, 40], leakageQ: [1, 12], scale: [0.5, 4] })).toBeNull();
  });

  it('fitBlockedImpedance vindt K en n terug uit een staart', () => {
    const re = 5.8;
    const truth = { coefficient: 0.0041, exponent: 0.78 };
    const tail: { freqHz: number; magnitudeOhm: number }[] = [];
    for (let i = 0; i < 60; i++) {
      const f = 3000 * Math.pow(5, i / 59);
      tail.push({ freqHz: f, magnitudeOhm: abs(blockedImpedance(f, re, { ...truth, residualDb: 0 })) });
    }
    const fit = fitBlockedImpedance(tail, re, { coefficient: [5e-4, 0.03], exponent: [0.5, 1] });
    expect(fit).not.toBeNull();
    expect(fit!.coefficient).toBeCloseTo(truth.coefficient, 4);
    expect(fit!.exponent).toBeCloseTo(truth.exponent, 2);
    expect(fit!.residualDb).toBeLessThan(0.01);
  });

  /** Dezelfde poort in een groter volume stemt lager af, met √(V_A/V_B). */
  it('samePortInVolume schaalt f_b en Q_l met de wortel van de volumeverhouding', () => {
    const from: VentedBox = { volumeL: 53.2, tuningHz: 30.76, leakageQ: 2.78 };
    const to = samePortInVolume(from, 67.7);
    const k = Math.sqrt(53.2 / 67.7);
    expect(to.volumeL).toBe(67.7);
    expect(to.tuningHz).toBeCloseTo(from.tuningHz * k, 10);
    expect(to.leakageQ).toBeCloseTo(from.leakageQ * k, 10);
    /* En de poortmassa blijft per constructie dezelfde — dat IS "dezelfde poort". */
    const mapOf = (b: VentedBox) => boxLoad(b.tuningHz, b).Zp.im / (2 * Math.PI * b.tuningHz);
    expect(mapOf(to)).toBeCloseTo(mapOf(from), 6);
  });

  /**
   * DE RICHTING, EN ZIJ IS NIET DE RICHTING DIE INTUÏTIE GEEFT. Bij de
   * AFSTEMMING piekt de akoestische last, want daar resoneren compliantie en
   * poorttak tegen elkaar; daar beweegt de conus dus het MINST. Verplaats je de
   * afstemming naar welke kant ook, dan daalt de last op die frequentie en
   * beweegt de conus MEER. Een groter én een kleiner volume geven op de oude
   * afstemming dus beide een ratio boven 1, en dat is geen fout.
   *
   * Deze claim is geschreven nadat de eerste versie ("een kleinere kast remt de
   * conus") omviel op 1,083. De data had gelijk; de verwachting kwam uit "een
   * stijvere veer remt" en dat is precies de frequentie waar dat niet geldt.
   */
  it('op de oude afstemming laat ELKE verplaatsing de conus meer bewegen', () => {
    const driver: DriverFacts = { sdM2: 255e-4, blTm: 10.45, count: 2 };
    const from: VentedBox = { volumeL: 53.2, tuningHz: 30.76, leakageQ: 2.78 };
    const zb = cplx(5.8, 0.8);
    const at = (v: number) => abs(coneVelocityRatio(from.tuningHz, cplx(8, 2), zb, from, samePortInVolume(from, v), driver));
    expect(at(67.7)).toBeGreaterThan(1);
    expect(at(40)).toBeGreaterThan(1);
  });

  /**
   * DE CLAIM DIE WEL DISCRIMINEERT: ruim ONDER de oude afstemming strekt een
   * groter volume de uitstraling uit en een kleiner volume knijpt haar af. Dat
   * is de eigenschap waarvoor je een transformatie doet, en een teken- of
   * richtingsfout valt hier om.
   */
  it('ruim onder de afstemming levert een groter volume meer en een kleiner minder', () => {
    const driver: DriverFacts = { sdM2: 255e-4, blTm: 10.45, count: 2 };
    const from: VentedBox = { volumeL: 53.2, tuningHz: 30.76, leakageQ: 2.78 };
    const zb = cplx(5.8, 0.8);
    const deep = 18;
    const total = (v: number) => abs(volumeTransfer(deep, cplx(6, 3), zb, from, samePortInVolume(from, v), driver).total);
    expect(total(67.7)).toBeGreaterThan(1);
    expect(total(40)).toBeLessThan(1);
  });
});

describe('M-2 — de versiestring', () => {
  it('draagt haar naam en versie', () => {
    expect(VENTED_BOX_TRANSFORM_VERSION).toBe('vented-box-transform/1.0');
  });
});
