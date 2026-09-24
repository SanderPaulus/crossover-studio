/**
 * U-5c — DE FASESPORINGSEIS KRIJGT HAAR GETAL (Sander, 24-09-2026: 30°).
 *
 * ER VIEL NIETS TE BOUWEN EN DAT IS DE HELFT VAN HET VERHAAL. `maxPhaseTrackingDeg`
 * is sinds F3 een v2-eis met een instelveld, een registerrij, een guided-scherm,
 * een plaats in `RELAXABLE` en een lezer in de shortlist; H-5 corrigeerde de
 * aanname dat zij ontbrak en noteerde dat alleen het GETAL miste. Wat U-5c
 * toevoegt is dat getal, de lezer die het uit het manifest haalt in plaats van
 * het over te typen (P6), en de twee plaatsen waar het de shortlist bereikt.
 *
 * EEN EIS EN GEEN POORT, en die scheiding is hier geen haarkloverij. Een poort
 * is een BESCHERMING die de relaxatieladder nooit mag verruimen; fasesporing is
 * smaak (A5e.1), staat naast het SPL-venster in `RELAXABLE`, en de ladder MAG
 * haar verruimen met het etiket dat dat zegt. De opdracht van deze sessie noemde
 * hem een poort; dat is het mechanisme niet, en een test die dat woord zou
 * volgen zou een bescherming testen die niet bestaat.
 *
 * VIJF GROEPEN.
 *
 *  1. HET GESTELDE GETAL — gelezen, nergens getypt, op beide casussen.
 *  2. WAT HIJ DOET — leeg is niet beoordeeld, gesteld weigert met GEMETEN tegen
 *     GESTELD in de eenheid van de eis, en hij oordeelt PER OVERNAME.
 *  3. WAAROM ER NIETS GEREGENEREERD HOEFT: een eis bereikt de TUNER niet. Dat
 *     is een structurele eigenschap en zij wordt hier nagemeten in plaats van
 *     aangenomen — zij is de hele grond onder "geen herbeoordeling".
 *  4. WAT 30° OVER DIT BOEK ZEGT, uit de OPGENOMEN M-K-kolommen: geen nieuwe
 *     run, geen bevroren corpus herbeoordeeld.
 *  5. CASUS 1h, waar hij op élke rij bijt op een getal dat H-1 zelf als het
 *     verkeerde aanwijst. Gepind zodat die bevinding niet stil kan worden.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  evaluateRequirements,
  RELAXABLE,
  type CandidateMeasurements,
  type RequirementSettings,
} from './requirements/requirements.ts';
import { RELAXABLE_SETTING_KEYS } from './optimizer/relaxation.ts';
import { buildShortlist, type ShortlistInput } from './optimizer/shortlist.ts';
import { CHOICE_KEYS, GREY_KEYS, POLISH_KEYS } from './optimizer/choices.ts';
import type { TopologyDescriptor } from './optimizer/diversity.ts';
import type { GateVerdict } from './optimizer/gates.ts';
import type { VxpPart } from '../parsers/vxp.ts';
import { CASUS1_MAX_PHASE_TRACKING_DEG, CASUS1_REQUIREMENTS } from './casus1V2.fixture.ts';
import { CASUS1H_MAX_PHASE_TRACKING_DEG, CASUS1H_REQUIREMENTS } from './casus1h.fixture.ts';
import { loadGolden } from './casus1.fixture.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = (...p: string[]) => readFileSync(join(HERE, ...p), 'utf-8');
const FIXTURES = join(HERE, '..', '..', '..', 'test-fixtures');

/* ================================================================== *
 * Een bank van twee kandidaten en twee overnames
 * ================================================================== */

const cap = (id: string, uF: number): VxpPart => ({
  id,
  kind: 'C',
  value: uF * 1e-6,
  nodes: [1, 2],
  series: {},
} as unknown as VxpPart);

const topo: TopologyDescriptor = {
  flanks: [
    { way: 'low', side: 'lp', kind: 'LR', order: 4 },
    { way: 'high', side: 'hp', kind: 'LR', order: 4 },
  ],
  inverted: [],
};

const measurements = (phases: { subject: string; deg: number }[]): CandidateMeasurements => ({
  response: {
    windowPlusMinusDb: 1.0,
    windowMaxAtHz: 1000,
    windowMinAtHz: 2000,
    rmsDeviationDb: 0.4,
    narrowPeaks: [],
    bandHz: [200, 8000],
    coverage: {
      intendedHz: [200, 8000],
      evaluatedHz: [200, 8000],
      fraction: 1,
      flagged: false,
      limitedBy: { low: 'fixture', high: 'fixture' },
      describe: 'full',
    },
    smoothingOctaves: 1 / 6,
    notes: [],
  },
  phaseTracking: phases.map((p) => ({ subject: p.subject, meanAbsDeg: p.deg })),
});

const candidate = (
  label: string,
  phases: { subject: string; deg: number }[],
  gates: GateVerdict[] = [],
): ShortlistInput<string> => ({
  label,
  parts: [cap('C1', 4)],
  result: label,
  topology: topo,
  measurements: measurements(phases),
  gates,
});

const RUN = 'engine=2.0.0-U5c seed=4242 status=completed';
const phaseOf = (m: CandidateMeasurements, r: RequirementSettings) =>
  evaluateRequirements(m, r).verdicts.filter((v) => v.requirement === 'phase-tracking');

/* ================================================================== *
 * 1 — het gestelde getal
 * ================================================================== */

describe('U-5c — het getal is GESTELD en wordt GELEZEN', () => {
  it('casus 1 stelt 30°, en de fixture leest hem uit het manifest in plaats van hem te typen', () => {
    const e = (loadGolden().manifest_en_geometrie as unknown as {
      gestelde_eisen: { fasesporing_max_graden?: number; fasesporing_max_gesteld_door?: string };
    }).gestelde_eisen;
    expect(e.fasesporing_max_graden).toBe(30);
    expect(e.fasesporing_max_gesteld_door).toContain('Sander Somers, 24-09-2026');
    expect(CASUS1_MAX_PHASE_TRACKING_DEG).toBe(e.fasesporing_max_graden);
    expect(CASUS1_REQUIREMENTS.maxPhaseTrackingDeg).toBe(30);
    /* P6 — het getal staat in het manifest en nergens anders: geen bronbestand
     * van de engine noemt het. */
    expect(SRC('casus1V2.fixture.ts')).not.toMatch(/maxPhaseTrackingDeg:\s*30/);
  });

  it('casus 1h stelt hetzelfde getal, door casus 1’s eigen lezer op casus 1h’s eigen blok', () => {
    expect(CASUS1H_MAX_PHASE_TRACKING_DEG).toBe(30);
    expect(CASUS1H_REQUIREMENTS.maxPhaseTrackingDeg).toBe(30);
  });

  it('hij is een EIS en geen poort: de ladder mag hem verruimen, en dat staat in twee lijsten', () => {
    expect(RELAXABLE).toContain('phase-tracking');
    expect(RELAXABLE_SETTING_KEYS).toContain('maxPhaseTrackingDeg');
  });
});

/* ================================================================== *
 * 2 — wat hij doet
 * ================================================================== */

describe('U-5c — leeg is niet beoordeeld, gesteld weigert met gemeten tegen gesteld', () => {
  const bad = measurements([{ subject: 'low|high', deg: 42.5 }]);

  it('LEEG: de maat wordt gerapporteerd en niets oordeelt haar (P4)', () => {
    const [v] = phaseOf(bad, {});
    expect(v.active).toBe(false);
    expect(v.pass).toBe(true);
    expect(v.limit).toBeNull();
    expect(v.statedLimit).toBeNull();
    expect(v.reason).toBe('42.5° — no requirement stated');
  });

  it('GESTELD: hij faalt, en de reden noemt GEMETEN tegen GESTELD in graden', () => {
    const [v] = phaseOf(bad, { ...CASUS1_REQUIREMENTS });
    expect(v.active).toBe(true);
    expect(v.pass).toBe(false);
    expect(v.limit).toBe(30);
    expect(v.missBy).toBeCloseTo(12.5, 9);
    expect(v.reason).toBe('42.5° misses 30.0° by 12.5°');
  });

  it('NIET GEMETEN is niet GEFAALD — dezelfde regel als de poorten', () => {
    const [v] = phaseOf({ ...bad, phaseTracking: [] }, { ...CASUS1_REQUIREMENTS });
    expect(v.active).toBe(true);
    expect(v.pass).toBe(true);
    expect(v.value).toBeNull();
    expect(v.reason).toContain('could not be evaluated');
  });

  it('PER OVERNAME: goed op de ene en slecht op de andere is NIET gehaald', () => {
    const m = measurements([
      { subject: 'woofer|mid', deg: 8 },
      { subject: 'mid|tweeter', deg: 41 },
    ]);
    const vs = phaseOf(m, { ...CASUS1_REQUIREMENTS });
    expect(vs.map((v) => v.subject)).toEqual(['woofer|mid', 'mid|tweeter']);
    expect(vs.map((v) => v.pass)).toEqual([true, false]);
    expect(evaluateRequirements(m, { ...CASUS1_REQUIREMENTS }).feasible).toBe(false);
    /* De tegenproef die er een uitspraak over de VORM van maakt: het gemiddelde
     * van 8 en 41 is 24,5 en zou de eis halen. Een enkel gemiddeld getal zou dit
     * ontwerp dus doorlaten, en dat is precies waarom de eis per overname leest. */
    expect((8 + 41) / 2).toBeLessThan(30);
  });

  it('door de SHORTLIST: de rij valt weg, en de diagnose noemt de eis bij naam', () => {
    const field = [
      candidate('spoort', [{ subject: 'woofer|mid', deg: 12 }]),
      candidate('spoort niet', [{ subject: 'woofer|mid', deg: 42.5 }]),
    ];
    /* SIZE 1, en dat is geen detail: met een gevraagde twee zou de ladder gaan
     * klimmen omdat er maar één haalbaar is, en dan komt de tweede rij terug
     * met het etiket erbij — wat de eis doet, niet wat zij nalaat. De claim
     * hieronder gaat over de eis zelf; de ladder heeft zijn eigen claim. */
    const s = buildShortlist(field, RUN, { requirements: { ...CASUS1_REQUIREMENTS }, size: 1 });
    expect(s.label).toBeNull();
    expect(s.rows.map((r) => r.label)).toEqual(['spoort']);
    expect(s.feasibleCount).toBe(1);
    /* En zonder de eis komen ze allebei terug — zonder deze tegenproef is de
     * eerste claim ook waar voor een shortlist die de tweede om iets anders
     * weggooide. */
    const zonder = buildShortlist(field, RUN, { size: 2 });
    expect(zonder.feasibleCount).toBe(2);
    expect(zonder.rows.map((r) => r.label).sort()).toEqual(['spoort', 'spoort niet']);
  });

  it('de LADDER mag hem verruimen, en zegt dat — waar een poort nooit zou wijken', () => {
    /* Dit is de eerlijke vorm van "gewapend" voor een smaak-eis: met te weinig
     * haalbare kandidaten klimt de ladder tot er genoeg zijn, en het etiket
     * reist met de rijen mee. Wie een onverruimbare grens wil, vraagt om een
     * ander mechanisme en niet om een ander getal. */
    const field = [candidate('net erboven', [{ subject: 'woofer|mid', deg: 33 }])];
    const s = buildShortlist(field, RUN, { requirements: { ...CASUS1_REQUIREMENTS }, size: 1 });
    expect(s.relaxation.stated.maxPhaseTrackingDeg).toBe(30);
    expect(s.relaxation.inForce.maxPhaseTrackingDeg!).toBeGreaterThan(30);
    expect(s.label).toContain('phase tracking');
    expect(s.rows).toHaveLength(1);
    /* De tegenproef: een POORT wijkt niet, wat de ladder ook doet. */
    const gated = buildShortlist(
      [
        candidate('poort weigert', [{ subject: 'woofer|mid', deg: 5 }], [
          {
            gate: 'M-B/|Z|',
            metric: 'M-B',
            title: 'Minimum |Z|',
            subject: 'system',
            value: 1.2,
            unit: 'Ω',
            limit: 2.6,
            direction: 'min',
            active: true,
            pass: false,
            withinToleranceOnly: false,
            reason: '1.20 Ω falls below the stated floor of 2.60 Ω',
            specRef: 'A4 M-B',
          },
        ]),
      ],
      RUN,
      { requirements: { ...CASUS1_REQUIREMENTS }, size: 1 },
    );
    expect(gated.rows).toHaveLength(0);
  });
});

/* ================================================================== *
 * 3 — waarom er niets geregenereerd hoeft
 * ================================================================== */

describe('U-5c — een EIS bereikt de tuner niet, en dat is de grond onder "geen regeneratie"', () => {
  it('`maxPhaseTrackingDeg` staat in geen enkele classificatie van de tuner', () => {
    /* `choiceKeyGuard` bewaakt dat de drie lijsten SAMEN exact de sleutels van
     * `NetOptimizeOptions` zijn. Staat de eis in geen van drieën, dan bestaat
     * zij daar niet — en dan kan een gesteld getal per constructie geen enkele
     * componentwaarde verplaatsen. */
    const all = [...CHOICE_KEYS, ...GREY_KEYS, ...POLISH_KEYS] as readonly string[];
    expect(all).not.toContain('maxPhaseTrackingDeg');
  });

  it('en geen enkele tuner- of workerbron noemt hem', () => {
    expect(SRC('..', 'netOptimizer.ts')).not.toContain('maxPhaseTrackingDeg');
    expect(SRC('optimizer', 'worker.ts')).not.toContain('maxPhaseTrackingDeg');
    expect(SRC('..', 'designChain.ts')).not.toContain('maxPhaseTrackingDeg');
    expect(SRC('..', 'vfOptimizer.ts')).not.toContain('maxPhaseTrackingDeg');
  });

  it('de twee generatoren geven hem WEL aan de shortlist — gespreid, dus leeg wapent niets', () => {
    const one = SRC('..', '..', '..', 'scripts', 'generate-casus1-v2-candidates.ts');
    const h = SRC('..', '..', '..', 'scripts', 'generate-casus1h-v2-candidates.ts');
    expect(one).toContain('requirements: { ...CASUS1_REQUIREMENTS }');
    expect(h).toContain('requirements: { ...CASUS1H_REQUIREMENTS }');
  });
});

/* ================================================================== *
 * 4 — wat 30° over dit boek zegt
 * ================================================================== */

interface FaseRij {
  netlist: string;
  paar: string;
  mk_graden: number | null;
}

const FASE = (
  loadGolden().manifest_en_geometrie as unknown as {
    v44_fasematen: { per_netlist: FaseRij[] };
  }
).v44_fasematen.per_netlist;

const LIMIT = CASUS1_MAX_PHASE_TRACKING_DEG!;

describe('U-5c — wat 30° over het opgenomen casusboek zegt (geen nieuwe run)', () => {
  it('HAALBAAR: alle drie de referentiefilters halen hem op BEIDE overnames', () => {
    const refs = FASE.filter((r) => ['HUIDIG', 'KAND_A', 'KAND_B'].includes(r.netlist));
    expect(refs).toHaveLength(6);
    for (const r of refs) expect(r.mk_graden!, `${r.netlist} ${r.paar}`).toBeLessThanOrEqual(LIMIT);
    // De slechtste lezing van de ontwerper zelf, met de marge erbij.
    const worst = Math.max(...refs.map((r) => r.mk_graden!));
    expect(worst).toBeCloseTo(20.61, 2);
    expect(LIMIT - worst).toBeGreaterThan(9);
  });

  it('NIET VACUÜM: 25 van de 180 netlists van dit boek gaan er op minstens één overname overheen', () => {
    const byNetlist = new Map<string, FaseRij[]>();
    for (const r of FASE) byNetlist.set(r.netlist, [...(byNetlist.get(r.netlist) ?? []), r]);
    const over = [...byNetlist].filter(([, rs]) =>
      rs.some((r) => r.mk_graden !== null && r.mk_graden > LIMIT),
    );
    expect(byNetlist.size).toBe(180);
    expect(over).toHaveLength(25);
    // Het LEVENDE corpus draagt er precies één, en hij heeft een naam.
    const live = over.filter(([n]) => /^KAND_V2_\d+$/.test(n)).map(([n]) => n);
    expect(live).toEqual(['KAND_V2_3']);
    // Vier van de vijf M5-netlists vallen af — de spiegelarmen van M-5.
    expect(over.filter(([n]) => n.startsWith('M5_KAND_')).map(([n]) => n).sort()).toEqual([
      'M5_KAND_1',
      'M5_KAND_2',
      'M5_KAND_3',
      'M5_KAND_5',
    ]);
  });

  it('DE SCHERPSTE LEZING: 30° had VIJF van de zeven M-5-leveringen gevangen — precies de spiegelarmen', () => {
    /* M-5 schreef dat de LR2-spiegels "winnen op de rekening en het betalen in
     * fasetracking". Dit getal zegt hoeveel dat kost, in de eenheid waarin het
     * betaald wordt — en de twee die hem halen zijn de twee LR4-textbookarmen. */
    const TAB = JSON.parse(readFileSync(join(FIXTURES, 'casus1_m5_lr2.json'), 'utf8')) as {
      meetsets: string[];
      per_meetset: Record<
        string,
        { rijen: { delivered: boolean; lowAlign: string; arm: string; vector: { mk: { graden: number | null }[] } | null }[] }
      >;
    };
    const delivered = TAB.meetsets.flatMap((s) =>
      TAB.per_meetset[s].rijen.filter((r) => r.delivered && r.vector),
    );
    expect(delivered).toHaveLength(7);
    const over = delivered.filter((r) => r.vector!.mk.some((m) => (m.graden ?? 0) > LIMIT));
    expect(over).toHaveLength(5);
    for (const r of over) expect(r.arm, `${r.lowAlign} ${r.arm}`).not.toBe('textbook');
    const within = delivered.filter((r) => !over.includes(r));
    for (const r of within) {
      expect(r.lowAlign).toBe('LR4');
      expect(r.arm).toBe('textbook');
    }
  });
});

/* ================================================================== *
 * 5 — casus 1h, waar hij op élke rij bijt
 * ================================================================== */

describe('U-5c — casus 1h: de eis bijt op de GESTUURDE lezing en niet op de delay die je instelt', () => {
  const G1H = JSON.parse(
    readFileSync(join(FIXTURES, 'casus1h', 'golden_refs_casus1h.json'), 'utf8'),
  ) as {
    kandidaten: Record<string, { wm_fase_oct?: number; mt_fase_oct?: number }>;
    manifest_en_geometrie: { gestelde_eisen: Record<string, unknown> };
  };
  const TAB = JSON.parse(readFileSync(join(FIXTURES, 'casus1h_beslistabel.json'), 'utf8')) as {
    hybride: { netlist: string; m_k_wm_graden: number; m_k_wm_graden_op_de_ingestelde_delay: number; m_k_mt_graden: number }[];
  };

  it('élke bevroren netlist gaat er op de GESTUURDE woofer→mid-lezing overheen', () => {
    const rows = Object.entries(G1H.kandidaten).filter(([n]) => /^H_KAND_\d+$/.test(n));
    expect(rows).toHaveLength(4);
    for (const [n, v] of rows) {
      expect(v.wm_fase_oct!, `${n} gestuurd`).toBeGreaterThan(LIMIT);
      // De mid→tweeter-overname haalt hem sowieso — het is één overname die bijt.
      expect(v.mt_fase_oct!, `${n} mt`).toBeLessThanOrEqual(LIMIT);
    }
  });

  it('en dezelfde vier netwerken halen hem RUIM op de delay die het doelblok zegt in te stellen', () => {
    /* H-1's openstaande punt, hier voor het eerst dragend: de zoektocht wordt
     * gestuurd op een klasse-A-delay die is afgeleid vóór er een netwerk was,
     * en de delay die je werkelijk instelt wordt op het GELEVERDE netwerk
     * geherfit. Niets aan deze eis repareert dat, en niets in deze sessie doet
     * alsof. */
    expect(TAB.hybride).toHaveLength(4);
    for (const r of TAB.hybride) {
      expect(r.m_k_wm_graden, `${r.netlist} gestuurd`).toBeGreaterThan(LIMIT);
      expect(r.m_k_wm_graden_op_de_ingestelde_delay, `${r.netlist} ingesteld`).toBeLessThan(LIMIT);
    }
    const dialled = TAB.hybride.map((r) => r.m_k_wm_graden_op_de_ingestelde_delay);
    expect(Math.min(...dialled)).toBeCloseTo(9.15, 2);
    expect(Math.max(...dialled)).toBeCloseTo(16.61, 2);
  });

  it('en het manifest van casus 1h draagt die bevinding, zodat zij niet stil kan worden', () => {
    const e = G1H.manifest_en_geometrie.gestelde_eisen;
    expect(e.fasesporing_max_graden).toBe(30);
    expect(String(e.fasesporing_max_bevinding_op_deze_casus)).toContain(
      'm_k_wm_graden_op_de_ingestelde_delay',
    );
    expect(String(e.fasesporing_max_bevinding_op_deze_casus)).toContain('H-1');
  });
});
