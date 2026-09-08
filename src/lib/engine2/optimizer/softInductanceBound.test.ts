/**
 * C-2 — HET A5d.6-PLAFOND ALS ZACHTE GRENS, ALS KEUZE VAN DE TUNER.
 *
 * DE BEVINDING WAAR DIT UIT VOORTKOMT (E-4). `bump-series-l` keert het
 * LF-budget om naar een plafond op de seriespoel van de laagste weg, en die
 * inversie modelleert de weg als een KALE serie R+L in de gemeten
 * driverimpedantie (`H = Z/(Z + R + jωL)`). De POORT — M-D op het geleverde
 * netwerk — lost het ECHTE netwerk op, met elke shunt die de tak draagt. Dat
 * zijn twee verschillende functies van hetzelfde ontwerp, en op casus 1 dempen
 * die shunts de reflexpiek zo sterk dat de inversie mediaan 1,74 dB en uiterst
 * 8,70 dB te hoog leest. Gemeten over het hele casusboek: NEGENENZESTIG van 161
 * bevroren netlists staan boven hun plafond en binnen het budget, en NUL
 * andersom. Een kooi die maar in één richting fout staat sluit ontwerpen uit
 * die de eis toelaat.
 *
 * WAT DIT BESTAND PINT, en wat elders staat. Hier staan de claims over de
 * TUNER, op een SYNTHETISCH plafond, om dezelfde reden als bij V48: de vraag is
 * of de tuner een zacht plafond scoort in plaats van te klemmen, niet of de
 * inversie klopt. Hoe de doos gebouwd wordt staat in `bounds.ts` en wordt hier
 * ook gepind (dezelfde bound, twee filings); wat de inversie op het echte
 * casusboek doet staat in `frozenNetlistGates.test.ts` (de E-4-verzameling);
 * de classificatie en de kandidaatverklaring in `choiceKeyGuard.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import { optimizeNetworkValues, type NetOptimizeOptions } from '../../netOptimizer.ts';
import { searchBoxFor, type InvertedBound } from './bounds.ts';
import { H_PER_MH } from '../constants.ts';
import { v2DriverZ, v2Responses, v2SeedParts, V2_GRID } from './v2.fixture.ts';

const { wBase, tBase } = v2Responses();
const driverZ = v2DriverZ();
const ADJUST = { offsetMm: 0, trimDb: 0, inverted: false } as const;

const SEED = v2SeedParts();
const valOf = (id: string, name: string): number =>
  SEED.find((p) => p.partId === id)!.params.find((q) => q.name === name)!.value;

/** De vrije seriespoel van de lage weg. */
const COIL_ID = 'L1';
const SEED_L_SI = valOf(COIL_ID, 'L') * H_PER_MH;
/**
 * Het synthetische plafond: de HELFT van de zaadspoel. Bewust ONDER het zaad,
 * want dat is precies de toestand die E-4 mat — het levende corpus draagt
 * 3,8-6,3 mH tegen een plafond van ~2,5 mH — en het is de enige toestand
 * waarin een kooi en een straf zich verschillend gedragen. Afgeleid uit de
 * fixture, nergens ingetypt.
 */
const CEILING_SI = SEED_L_SI / 2;

const inductanceOf = (parts: readonly { partId?: string; params: { name: string; value: number }[] }[]): number =>
  parts.find((p) => p.partId === COIL_ID)!.params.find((q) => q.name === 'L')!.value * H_PER_MH;

function group(soft: boolean) {
  return [
    { ids: [COIL_ID], maxSI: CEILING_SI, fixedSI: 0, label: 'low series inductance', ...(soft ? { soft: true } : {}) },
  ] as NonNullable<NetOptimizeOptions['valueSumCeilings']>;
}

/** Kort budget: elke claim hier gaat over de GRENS, niet over kwaliteit. */
function run(extra: Partial<NetOptimizeOptions>) {
  return optimizeNetworkValues(v2SeedParts(), V2_GRID, wBase, tBase, driverZ, ADJUST, {
    phasePriority: 0.5,
    staged: { rippleDb: 1.5, phaseDeg: 8 },
    maxIterations: 120,
    ...extra,
  });
}

/** De bound zoals `invertBudgets` hem oplevert — één bound, twee filings. */
const BUMP_BOUND: InvertedBound = {
  rule: 'bump-series-l',
  subject: 'mid',
  quantity: 'total series inductance',
  maxSI: CEILING_SI,
  unit: 'H',
  slack: false,
  parameters: { path_R_ohm: 0 },
  notes: [],
};

describe('C-2 — het A5d.6-plafond als zachte grens', () => {
  it('de premisse: het plafond ligt ONDER de zaadspoel, dus kooi en straf kunnen verschillen', () => {
    /* Zonder deze assert zijn alle claims hieronder even waar voor een plafond
     * dat het zaad toch al toelaat, en dan meten zij niets — de V23-regel. */
    expect(CEILING_SI).toBeLessThan(SEED_L_SI);
    expect(CEILING_SI).toBeGreaterThan(0);
  });

  it('`searchBoxFor` filet dezelfde bound twee kanten op, en nooit allebei', () => {
    /* De doos is waar het besluit landt. Hard: een per-onderdeel-plafond in
     * `valueCeilings` plus een sompoort die projecteert. Zacht: dezelfde
     * getallen in `valueSoftCeilings` plus dezelfde sompoort met `soft`. Een
     * onderdeel mag in precies één van de twee kaarten staan — anders zou het
     * harde plafond terugkomen langs de achterdeur, één spoel tegelijk. */
    const hard = searchBoxFor(SEED, [BUMP_BOUND]);
    expect(hard.valueCeilings[COIL_ID]).toBeCloseTo(CEILING_SI, 12);
    expect(hard.valueSoftCeilings).toBeUndefined();
    expect(hard.valueSumCeilings).toHaveLength(1);
    expect(hard.valueSumCeilings[0].soft).toBeUndefined();

    const soft = searchBoxFor(SEED, [BUMP_BOUND], {}, undefined, 'soft');
    expect(soft.valueSoftCeilings?.[COIL_ID]).toBeCloseTo(CEILING_SI, 12);
    expect(soft.valueCeilings[COIL_ID]).toBeUndefined();
    expect(soft.valueSumCeilings).toHaveLength(1);
    expect(soft.valueSumCeilings[0].soft).toBe(true);
    expect(soft.valueSumCeilings[0].maxSI).toBe(hard.valueSumCeilings[0].maxSI);
    // The soft filing says so where a reader of the run will look for it.
    expect(soft.notes.join(' ')).toContain('filed SOFT');
    expect(soft.notes.join(' ')).toContain('M-D');
  });

  it('P2 — de soft-velden weggelaten is de doos die er altijd stond', () => {
    /* Absent = `'box'`, byte voor byte, en dat is de claim die elke v1-run en
     * elke kandidaat die niets stelt draagt. De tweede helft is de eigenlijke
     * P2-claim: een groep die het `soft`-veld op `undefined` meedraagt kost
     * niets, want anders zou het wapenen zelf een verschil zijn. */
    const a = run({ valueCeilings: { [COIL_ID]: CEILING_SI }, valueSumCeilings: group(false) });
    const b = run({ valueCeilings: { [COIL_ID]: CEILING_SI }, valueSumCeilings: group(false) });
    expect(JSON.stringify(a.parts)).toBe(JSON.stringify(b.parts));
    const noSoftMap = run({
      valueCeilings: { [COIL_ID]: CEILING_SI },
      valueSoftCeilings: {},
      valueSumCeilings: group(false),
    });
    expect(JSON.stringify(noSoftMap.parts)).toBe(JSON.stringify(a.parts));
  });

  it('een KOOI houdt de spoel op of onder het plafond; een STRAF laat haar erboven', () => {
    /* Het mechanische verschil, en het is de hele sessie in twee runs. De
     * harde doos klemt per onderdeel en projecteert de som, dus geen enkel
     * geëvalueerd of geleverd punt ligt erboven. De zachte doos scoort de
     * overschrijding en verbiedt niets, dus een tune die de spoel elders
     * terugverdient mag haar houden — en op deze fixture doet zij dat. */
    const caged = run({
      valueCeilings: { [COIL_ID]: CEILING_SI },
      valueSumCeilings: group(false),
    });
    const soft = run({
      valueSoftCeilings: { [COIL_ID]: CEILING_SI },
      valueSumCeilings: group(true),
    });
    // 4 significant digits is what the tuner writes out; nothing closer is meaningful.
    expect(inductanceOf(caged.parts)).toBeLessThanOrEqual(CEILING_SI * (1 + 1e-3));
    expect(inductanceOf(soft.parts)).toBeGreaterThan(CEILING_SI * (1 + 1e-3));
    // ...and the two are therefore different networks (V23: a key with no effect reports nothing).
    expect(JSON.stringify(soft.parts)).not.toBe(JSON.stringify(caged.parts));
  });

  it('de straf is EXACT NUL binnen het plafond, en bereikt de zoektocht erbuiten', () => {
    /* "Zacht" mag niet "afwezig" gaan betekenen, en het mag ook niet "overal
     * een beetje duurder" gaan betekenen. De twee helften samen zeggen wat het
     * wél is — dezelfde vorm als de soloverliesmuur en de bouwbaarheidsvensters
     * in `netOptimizer.ts`: nul binnen de grens, zodat het pad door het gezonde
     * gebied onaangeraakt is, en van nul verschillend erbuiten.
     *
     * DE EERSTE HELFT IS BEWUST HET PLAFOND BOVEN DE REALISME-RAND en niet
     * een plafond dat er net onder ligt, en dat verschil is zelf een bevinding
     * die het opschrijven waard is: een zacht plafond BINNEN het venster van de
     * app verandert het netwerk óók als de levering er ruim onder blijft, want
     * de simplex evalueert onderweg punten erboven en die kosten sindsdien
     * iets. De straf is dus nul in het PUNT en niet nul in het PAD. Boven de
     * eigen rand van de app doet de sleutel per constructie niets — dat is wat
     * `valueSoftCeilings` documenteert — en dát is de byte-claim die hier
     * te maken valt. */
    const free = run({});
    const above = 1; // one henry: far outside the largest coil the app's own realism window admits
    const inside = run({
      valueSoftCeilings: { [COIL_ID]: above },
      valueSumCeilings: [{ ids: [COIL_ID], maxSI: above, fixedSI: 0, label: 'low series inductance', soft: true }],
    });
    expect(JSON.stringify(inside.parts)).toBe(JSON.stringify(free.parts));

    /* En erbuiten: een plafond ONDER de levering levert aantoonbaar een ander
     * netwerk. Zonder deze tegenproef zijn de claims hierboven even waar voor
     * een sleutel die nergens op aangesloten is (V23). Het is met opzet GEEN
     * claim dat de spoel dan omlaag gaat: op deze fixture wil het objectief de
     * spoel zo sterk dat een straf van deze orde hem niet verplaatst, en dat
     * is precies wat "hij mag hem nog steeds kopen" betekent. */
    const outside = run({
      valueSoftCeilings: { [COIL_ID]: CEILING_SI },
      valueSumCeilings: group(true),
    });
    expect(JSON.stringify(outside.parts)).not.toBe(JSON.stringify(free.parts));
  });
});
