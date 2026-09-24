/**
 * V50 — BUILDABILITY as pure functions, in the four shapes the metric skill
 * asks for: a HAND CALCULATION on a network small enough to solve on paper,
 * the OFF states with the missing input named (P4/F0), a NEW MEASUREMENT
 * (change the input, the derived figure moves the way physics says), and the
 * bridge to M-A (the watts are M-A's own elements, not a second integral).
 */

import { describe, expect, it } from 'vitest';
import { cplx, type Complex } from '../../complex.ts';
import type { Netlist } from '../../network.ts';
import { buildAnalysis } from './analysis.ts';
import { dissipation } from './electrical.ts';
import {
  BUILDABILITY_VERSION,
  capacitorLoads,
  coilLoads,
  resistorLoads,
  worstCapacitor,
  worstCoil,
  worstResistor,
} from './buildability.ts';

/**
 * The paper network: generator (Rg 0) → L1 (1 mH) → R1 (2 Ω) → driver (a
 * pure 8 Ω), with R2 (100 Ω) shunting the driver. Every current is a single
 * complex division, so every figure below is checkable by hand.
 */
const GRID = [100, 1000, 10000];
const DRIVER_Z: Complex[] = GRID.map(() => cplx(8, 0));
const netlist: Netlist = {
  elements: [
    // Rg 1 mΩ rather than 0: the solver divides the delivered current by Rg.
    { kind: 'source', id: 'G', volts: 2.83, seriesR: 1e-3, nodes: [1, 0] },
    { kind: 'L', id: 'L1', value: 1e-3, seriesR: 0, nodes: [1, 2] },
    { kind: 'R', id: 'R1', value: 2, nodes: [2, 3] },
    { kind: 'R', id: 'R2', value: 100, nodes: [3, 0] },
    { kind: 'driver', id: 'D1', model: 'w', nodes: [3, 0], inverted: false },
  ],
  nodeCount: 4,
} as unknown as Netlist;

const analysis = () => buildAnalysis(netlist, GRID, { w: DRIVER_Z });

describe('V50 — buildability', () => {
  it('carries a version string', () => {
    expect(BUILDABILITY_VERSION).toMatch(/^buildability\/\d+\.\d+$/);
  });

  it('coil peak current, by hand: |I| = V_peak / |Z_total| at the frequency where |Z| is smallest', () => {
    const a = analysis();
    const loads = coilLoads(a, { peakInputVolts: 50 });
    expect(loads).toHaveLength(1);
    const l1 = loads[0];
    expect(l1.id).toBe('L1');
    // Load seen by the coil: Rg + R1 + (R2 ∥ 8 Ω) = 0.001 + 2 + 7.4074 = 9.4084 Ω, plus jωL.
    // At 100 Hz: |Z| = √(9.4084² + 0.6283²) = 9.4294 Ω → 50 / 9.4294 = 5.303 A.
    expect(l1.atHz).toBe(100);
    expect(l1.peakA!).toBeCloseTo(50 / Math.hypot(0.001 + 2 + (100 * 8) / 108, 2 * Math.PI * 100 * 1e-3), 3);
    // No rating anywhere: reported, not rated.
    expect(l1.allowedA).toBeNull();
    expect(l1.ratingSource).toBeNull();
  });

  it('resistor watts are M-A\'s own elements — the same fraction, times the stated power', () => {
    const a = analysis();
    const d = dissipation(a, { amplifierPowerW: 100 });
    const loads = resistorLoads(d, { continuousPowerW: 100, resistorClassW: 10, marginFraction: 0.5 });
    expect(loads.map((l) => l.id).sort()).toEqual(['R1', 'R2']);
    for (const l of loads) {
      const e = d.elements.find((x) => x.id === l.id)!;
      expect(l.fraction).toBe(e.fraction);
      expect(l.watts).toBeCloseTo(e.fraction * 100, 12);
      expect(l.allowedW).toBe(5);
      expect(l.ratingSource).toBe('stated resistor class');
    }
    // The series 2 Ω carries the whole current; the 100 Ω shunt a fraction of it.
    const r1 = loads.find((l) => l.id === 'R1')!;
    const r2 = loads.find((l) => l.id === 'R2')!;
    expect(r1.watts!).toBeGreaterThan(r2.watts!);
  });

  it('OFF states name the missing input: no power → no watts; no margin → no allowance; no peak → no current', () => {
    const a = analysis();
    const d = dissipation(a, { amplifierPowerW: 100 });
    const noPower = resistorLoads(d, { resistorClassW: 10, marginFraction: 0.5 });
    expect(noPower.every((l) => l.watts === null)).toBe(true);
    expect(noPower.every((l) => l.allowedW === 5)).toBe(true);
    const noMargin = resistorLoads(d, { continuousPowerW: 100, resistorClassW: 10 });
    expect(noMargin.every((l) => l.allowedW === null && l.ratingW === 10)).toBe(true);
    const noClass = resistorLoads(d, { continuousPowerW: 100, marginFraction: 0.5 });
    expect(noClass.every((l) => l.allowedW === null && l.ratingW === null)).toBe(true);
    const noPeak = coilLoads(a, { coilClassA: 3 });
    expect(noPeak[0].peakA).toBeNull();
    expect(noPeak[0].atHz).toBeNull();
    expect(noPeak[0].allowedA).toBe(3);
  });

  it('a catalogue rating on the part outranks the stated class, and names its SKU', () => {
    const a = analysis();
    const d = dissipation(a, { amplifierPowerW: 100 });
    const loads = resistorLoads(d, {
      continuousPowerW: 100,
      resistorClassW: 10,
      marginFraction: 0.5,
      ratings: { R1: { powerW: 20, source: 'catalogue SKU-20W' } },
    });
    expect(loads.find((l) => l.id === 'R1')!.allowedW).toBe(10);
    expect(loads.find((l) => l.id === 'R1')!.ratingSource).toBe('catalogue SKU-20W');
    expect(loads.find((l) => l.id === 'R2')!.allowedW).toBe(5);
    const coils = coilLoads(a, {
      peakInputVolts: 50,
      coilClassA: 3,
      ratings: { L1: { maxCurrentA: 6, source: 'catalogue SKU-CORE' } },
    });
    expect(coils[0].allowedA).toBe(6);
    expect(coils[0].ratingSource).toBe('catalogue SKU-CORE');
  });

  it('NEW MEASUREMENT: doubling the peak input doubles every coil current and moves nothing else', () => {
    const a = analysis();
    const one = coilLoads(a, { peakInputVolts: 25 });
    const two = coilLoads(a, { peakInputVolts: 50 });
    expect(two[0].peakA!).toBeCloseTo(2 * one[0].peakA!, 12);
    expect(two[0].atHz).toBe(one[0].atHz);
    // ...and doubling the continuous power doubles every resistor's watts while the fraction stands.
    const d = dissipation(a, { amplifierPowerW: 100 });
    const p1 = resistorLoads(d, { continuousPowerW: 100 });
    const p2 = resistorLoads(d, { continuousPowerW: 200 });
    for (let i = 0; i < p1.length; i++) {
      expect(p2[i].watts!).toBeCloseTo(2 * p1[i].watts!, 12);
      expect(p2[i].fraction).toBe(p1[i].fraction);
    }
  });

  it('the worst element is the one with the LEAST HEADROOM, and a rated element outranks an unrated one', () => {
    const a = analysis();
    const d = dissipation(a, { amplifierPowerW: 100 });
    // R1 burns more watts but is rated 100 W; R2 burns less and is rated 0.5 W → R2 has the least headroom.
    const loads = resistorLoads(d, {
      continuousPowerW: 100,
      marginFraction: 1,
      ratings: { R1: { powerW: 100, source: 'a' }, R2: { powerW: 0.5, source: 'b' } },
    });
    expect(worstResistor(loads)!.id).toBe('R2');
    // With no allowance anywhere, the hottest one is reported.
    const bare = resistorLoads(d, { continuousPowerW: 100 });
    expect(worstResistor(bare)!.id).toBe('R1');
    // A rated element always outranks an unrated one, however cool it runs.
    const mixed = resistorLoads(d, {
      continuousPowerW: 100,
      marginFraction: 1,
      ratings: { R2: { powerW: 1000, source: 'c' } },
    });
    expect(worstResistor(mixed)!.id).toBe('R2');
    expect(worstCoil(coilLoads(a, { peakInputVolts: 50 }))!.id).toBe('L1');
    expect(worstCoil(coilLoads(a, {}))).toBeNull();
  });
});

/* ================================================================== *
 * U-5c — de spanning over een condensator
 * ================================================================== */

/**
 * EEN TWEEDE PAPIEREN NETWERK, want het eerste draagt geen condensator.
 *
 * Generator (Rg 1 mΩ) → C1 → driver (zuiver 8 Ω). Eén serieketen, dus de
 * stroom is één complexe deling en de spanning over C1 is |I|·X_C — met de
 * hand na te rekenen op elk rasterpunt.
 */
const CAP_GRID = [100, 1000, 10000];
const CAP_Z: Complex[] = CAP_GRID.map(() => cplx(8, 0));
const RG = 1e-3;
const C_FARAD = 10e-6;

const capNetlist = (seriesR = 0): Netlist =>
  ({
    elements: [
      { kind: 'source', id: 'G', volts: 2.83, seriesR: RG, nodes: [1, 0] },
      { kind: 'C', id: 'C1', value: C_FARAD, seriesR, nodes: [1, 2] },
      { kind: 'driver', id: 'D1', model: 'w', nodes: [2, 0], inverted: false },
    ],
    nodeCount: 3,
  }) as unknown as Netlist;

const capAnalysis = (seriesR = 0) => buildAnalysis(capNetlist(seriesR), CAP_GRID, { w: CAP_Z });

/** X_C = 1/(ωC), de enige grootheid die deze som nodig heeft. */
const xc = (hz: number, farad = C_FARAD) => 1 / (2 * Math.PI * hz * farad);

describe('U-5c — de piekspanning over elke condensator', () => {
  it('MET DE HAND: |V_C| = V_piek · X_C / |Z_totaal|, en het maximum ligt op het LAAGSTE rasterpunt', () => {
    const loads = capacitorLoads(capAnalysis(), { peakInputVolts: 50 });
    expect(loads).toHaveLength(1);
    const c = loads[0];
    expect(c.id).toBe('C1');
    expect(c.farad).toBe(C_FARAD);
    /* De reactantie is het grootst waar de frequentie het laagst is, en op
     * deze keten is dat ook waar de spanning het grootst is. */
    expect(c.atHz).toBe(100);
    const hand = (hz: number) => (50 * xc(hz)) / Math.hypot(RG + 8, xc(hz));
    expect(c.peakV!).toBeCloseTo(hand(100), 9);
    // En dat is GEEN benadering van V_piek: bij 100 Hz is X_C 159 Ω tegen 8 Ω
    // last, dus vrijwel de hele generatorspanning staat over de condensator.
    expect(xc(100)).toBeCloseTo(159.15, 2);
    expect(c.peakV!).toBeGreaterThan(49);
    expect(c.peakV!).toBeLessThan(50);
    expect(c.why).toBeNull();
  });

  it('DE REDEN DAT DIT ERTOE DOET: in een resonante tak staat er een VEELVOUD van de ingang over', () => {
    /* De vuistregel gaat niet over de ingangsspanning maar over wat een
     * serieresonantie ermee doet: bij resonantie heffen X_L en X_C elkaar op,
     * de stroom wordt door de weerstand alleen begrensd, en over élk van de
     * twee reactanties staat Q keer de bronspanning. Dat is waarom een
     * valcondensator het onderdeel is dat een bouwer opblaast — en waarom
     * "de versterker levert 50 V" geen antwoord op de vraag is. */
    const L = 10e-3;
    const f0 = 1000;
    const C = 1 / ((2 * Math.PI * f0) ** 2 * L);
    const net = {
      elements: [
        { kind: 'source', id: 'G', volts: 2.83, seriesR: RG, nodes: [1, 0] },
        { kind: 'L', id: 'L1', value: L, seriesR: 0, nodes: [1, 2] },
        { kind: 'C', id: 'C1', value: C, seriesR: 0, nodes: [2, 3] },
        { kind: 'driver', id: 'D1', model: 'w', nodes: [3, 0], inverted: false },
      ],
      nodeCount: 4,
    } as unknown as Netlist;
    const a = buildAnalysis(net, CAP_GRID, { w: CAP_Z });
    const c = capacitorLoads(a, { peakInputVolts: 50 })[0];
    expect(c.atHz).toBe(f0);
    // Q = X / R op resonantie, en de spanning over C is Q keer de ingang.
    const Q = (2 * Math.PI * f0 * L) / (RG + 8);
    expect(Q).toBeGreaterThan(7);
    expect(c.peakV!).toBeCloseTo(50 * Q, 6);
    expect(c.peakV!).toBeGreaterThan(300);
  });

  it('de ESR telt mee, want dat is het onderdeel dat een bouwer koopt — EN ZIJ VERLAAGT DE LEZING', () => {
    /* EEN VERWACHTING DIE DE DATA WEERLEGDE, en zij staat hier omdat zij
     * terugkomt. De eerste vorm van deze claim was "meer ESR is meer spanning
     * over hetzelfde onderdeel", want de ESR zit in de TELLER: |Z_element| =
     * √(ESR² + X_C²). Zij is onwaar, en het rekensommetje zegt waarom — de ESR
     * zit óók in de NOEMER, want hij staat in de lus, en waar X_C ≫ R wint de
     * noemer. Gemeten: 49,94 V zonder ESR tegen 49,86 V met 5 Ω ESR. */
    const zero = capacitorLoads(capAnalysis(0), { peakInputVolts: 50 })[0];
    const esr = capacitorLoads(capAnalysis(5), { peakInputVolts: 50 })[0];
    const hand = (hz: number, r: number) =>
      (50 * Math.hypot(r, xc(hz))) / Math.hypot(RG + 8 + r, xc(hz));
    expect(zero.peakV!).toBeCloseTo(hand(100, 0), 9);
    expect(esr.peakV!).toBeCloseTo(hand(100, 5), 9);
    expect(esr.peakV!).toBeLessThan(zero.peakV!);
    /* EN DE TEGENPROEF DIE ZEGT DAT DE ESR WÉL IN DE TELLER ZIT, want zonder
     * haar is de claim hierboven ook waar voor een lezing die het element als
     * zuivere reactantie behandelt: bij DEZELFDE stroom is de gerapporteerde
     * spanning hoger dan de puur reactieve. */
    const reactiveOnly = (50 * xc(100)) / Math.hypot(RG + 8 + 5, xc(100));
    expect(esr.peakV!).toBeGreaterThan(reactiveOnly);
  });

  it('NIEUWE MÉTING: de ingang schaalt lineair en de CAPACITEIT verplaatst iets anders', () => {
    const a = capAnalysis();
    const one = capacitorLoads(a, { peakInputVolts: 25 })[0];
    const two = capacitorLoads(a, { peakInputVolts: 50 })[0];
    expect(two.peakV!).toBeCloseTo(2 * one.peakV!, 12);
    expect(two.atHz).toBe(one.atHz);
    /* En de tegenproef die er twee grootheden van maakt: een KLEINERE
     * condensator heeft meer reactantie, dus meer spanning bij dezelfde
     * ingang — een verandering die de ingangsschaal niet kan nabootsen. */
    const small = capacitorLoads(buildAnalysis(
      {
        elements: [
          { kind: 'source', id: 'G', volts: 2.83, seriesR: RG, nodes: [1, 0] },
          { kind: 'C', id: 'C1', value: C_FARAD / 10, seriesR: 0, nodes: [1, 2] },
          { kind: 'driver', id: 'D1', model: 'w', nodes: [2, 0], inverted: false },
        ],
        nodeCount: 3,
      } as unknown as Netlist,
      CAP_GRID,
      { w: CAP_Z },
    ), { peakInputVolts: 50 })[0];
    expect(small.peakV!).toBeGreaterThan(two.peakV!);
    expect(small.farad).toBeCloseTo(C_FARAD / 10, 15);
  });

  it('P4/F0 — zonder piekingang is er GEEN lezing, en de reden noemt de ontbrekende invoer', () => {
    const c = capacitorLoads(capAnalysis(), {})[0];
    expect(c.peakV).toBeNull();
    expect(c.atHz).toBeNull();
    expect(c.why).toContain('peak power and nominal load');
    // Een nul zou als meting lezen; de lijst zelf blijft er wel, met het onderdeel erin.
    expect(c.id).toBe('C1');
    expect(c.farad).toBe(C_FARAD);
    expect(worstCapacitor([c])).toBeNull();
  });

  it('en het is RAPPORTAGE: er is geen toegestane waarde om tegen te vergelijken', () => {
    /* Bewust, en niet bij gebrek aan moeite: de catalogus draagt `powerW` voor
     * weerstanden en `maxCurrentA` voor kernspoelen en NIETS voor
     * condensatoren. Een toelating hier verzinnen zou data verzinnen (A3h). */
    const c = capacitorLoads(capAnalysis(), { peakInputVolts: 50 })[0];
    expect(Object.keys(c).sort()).toEqual(['atHz', 'farad', 'id', 'peakV', 'why']);
    expect(worstCapacitor(capacitorLoads(capAnalysis(), { peakInputVolts: 50 }))!.id).toBe('C1');
  });
});
