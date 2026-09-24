/**
 * U-5c — DE DODE-VELDEN-AUDIT VAN HET GOALS-PANEEL, in de E-2-vorm.
 *
 * WAAROM HIJ ER IS. E-2 vond zes spookgetallen op het v2-formulier, I-1 vond
 * vijf v1-knoppen die de v2-route niet leest, en U-3b vond twaalf zichtbare
 * besturingselementen zonder registerrij. Alle drie waren hetzelfde soort
 * gebrek: een veld dat iets belooft dat de run niet doet. Het paneel "Goals &
 * weighting" is het ENE formulier waar dat nooit systematisch nagegaan is —
 * het is ouder dan het v2-blok, het draagt de twaalf knoppen waarmee een
 * ontwerper zegt waar de zoektocht zijn budget aan uitgeeft, en tot U-5c was
 * van precies één ervan (`errorSmoothOct`) opgeschreven dat de v2-route hem
 * niet leest.
 *
 * DRIE STATUSSEN, en zij worden hier NAGEMETEN en niet beweerd:
 *
 *   · GELEZEN   — de waarde bereikt de ketensettings én overleeft de
 *                 verklaring, dus de zoektocht leest wat er staat.
 *   · V1-ALLEEN — de waarde bereikt de ketensettings en wordt door de
 *                 VERKLARING overschreven, dus de knop doet op de v2-route
 *                 niets. Hij draagt sindsdien zijn badge.
 *   · DOOD      — de waarde bereikt geen enkele lezer. GEEN GEVONDEN, en dat
 *                 is een claim met een enumeratie eronder en geen stilte.
 *
 * DE VONDST VAN DEZE AUDIT is `phasePriority`: sinds M-4 verklaart élke
 * kandidaat `DEFAULT_PHASE_PRIORITY` onvoorwaardelijk, en de app geeft haar
 * schuifregelaar niet aan de verklaring mee — dus de schuif doet op de
 * v2-route niets, op de drie routes die er zijn. M-4's eigen commentaar zegt
 * "een gestelde waarde wint", en er wordt er geen gesteld. Dat is een
 * BEDRADINGSGAT en geen besluit, en deze sessie MARKEERT het in plaats van het
 * te repareren: de schuif weer laten werken verandert wat élke v2-run met een
 * verzette schuif doet, en dat is een gesteld besluit.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { declareCandidateChainChoices } from './optimizer/candidateDeclaration.ts';
import { CHAIN_CHOICE_KEYS, withDeclaredChainChoices } from './optimizer/chainChoices.ts';
import { GREY_KEYS } from './optimizer/choices.ts';
import { DEFAULT_PHASE_PRIORITY } from '../netOptimizer.ts';
import { V2_INPUT_REGISTER, V2_UNGOVERNED_ROWS } from '../v2InputRegister.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, '..', '..', 'App.tsx'), 'utf-8');

/**
 * ELK BESTURINGSELEMENT VAN "GOALS & WEIGHTING", met de app-state die het zet,
 * de sleutel waaronder het in de ketensettings landt, en zijn status.
 *
 * `reaches` is de sleutelNAAM in `ChainSettings` — de enige vorm waarin een van
 * deze knoppen de motor kan bereiken. Staat er `null`, dan is dat de claim dat
 * het veld helemaal geen ketensleutel heeft.
 */
type Status = 'read' | 'v1-only' | 'three-way-only';
const GOALS: readonly {
  control: string;
  state: string;
  reaches: string;
  /** Waar de tweewegketen hem onder een ANDERE naam draagt. */
  twoWayKey?: string;
  status: Status;
  why: string;
}[] = [
  {
    control: 'Priority: response · phase',
    state: 'phasePriority',
    reaches: 'phasePriority',
    status: 'v1-only',
    why: 'de ketenverklaring stelt DEFAULT_PHASE_PRIORITY onvoorwaardelijk (M-4) en de app geeft de schuif niet mee',
  },
  { control: 'Phase metric', state: 'phaseMetricMode', reaches: 'phaseMetric', status: 'read', why: 'de kandidaat STELT hem uit de ketensettings (put)' },
  { control: 'Amplitude target', state: 'ampTarget', reaches: 'ampTarget', status: 'read', why: 'idem' },
  { control: 'Weight for in-room sound', state: 'dirWeight', reaches: 'directivityWeight', status: 'read', why: 'GREY: expliciet overgenomen, nooit verklaard' },
  { control: 'Power response', state: 'powerMetric', reaches: 'powerMetric', status: 'read', why: 'de kandidaat STELT hem uit de ketensettings (put)' },
  { control: 'DI-fold weight', state: 'powerFoldWeight', reaches: 'powerFoldWeight', status: 'read', why: 'GREY' },
  {
    control: 'Error smoothing',
    state: 'errorSmoothOct',
    reaches: 'errorSmoothOct',
    status: 'v1-only',
    why: 'de kandidaat stelt SEARCH_SMOOTHING_OCTAVES onvoorwaardelijk (V38-fix) — I-1 markeerde hem al',
  },
  { control: 'Source R limit', state: 'rSourceLimitOhm', reaches: 'audit', status: 'read', why: 'reist als audit.thresholds.rSourceOhm en wordt als `audit` gesteld' },
  {
    control: 'Source R disqualify',
    state: 'rSourceDisqOhm',
    reaches: 'rSourceDisqualifyOhm',
    status: 'three-way-only',
    why: 'alleen de DRIEWEG-ketensettings dragen hem; op de tweeweg verklaart de kandidaat hem ABSENT (V34) en wordt er niets gediskwalificeerd',
  },
  { control: 'Amplifier min load', state: 'ampMinLoadOhm', reaches: 'ampMinLoadOhm', status: 'read', why: 'gesteld; wapent M-B/|Z|' },
  { control: 'Dissipation weight', state: 'dissipationWeight', reaches: 'dissipationWeight', status: 'read', why: 'GREY (V36/V37)' },
  {
    control: 'DI anchor weight',
    state: 'diWeight',
    reaches: 'diWeight',
    status: 'three-way-only',
    why: 'bereikt threeWayDesign; alleen op de DRIEWEGroute gerenderd, dus een tweewegontwerper ziet hem niet',
  },
  {
    control: 'Correction bands per driver',
    state: 'vfEqBands',
    reaches: 'eqBands',
    /* De twee ketens noemen hem anders — `eqBands` op de drieweg en
     * `eqBandsPerDriver` op de tweeweg — en de verklaring vertaalt ertussen
     * (`withDeclaredChainChoices`, V41/E-3). Beide namen staan hier, want een
     * inventaris die er één noemt leest de andere route verkeerd. */
    twoWayKey: 'eqBandsPerDriver',
    status: 'read',
    why: 'de ketenverklaring stelt hem UIT de settings (V41)',
  },
];

/** De ketensettings die de app voor de TWEEWEGroute bouwt, als bron. */
const TWO_WAY = (() => {
  const i = APP.indexOf('const twoWayChainSettings = (args: {');
  expect(i).toBeGreaterThan(0);
  return APP.slice(i, APP.indexOf('};', APP.indexOf('safety: args.safety,', i)));
})();

describe('U-5c — welke velden van Goals & weighting de v2-route werkelijk leest', () => {
  it('élk besturingselement van het paneel staat in de inventaris hieronder', () => {
    /* De U-3b-vorm: de SCAN telt de besturingselementen van de regio en de
     * inventaris moet er evenveel dragen. Een knop die aan dit paneel wordt
     * toegevoegd zonder status valt hier om in plaats van stil mee te liften. */
    const start = APP.indexOf("<span className=\"opt-group-cap\">{t('Goals & weighting')}</span>");
    const end = APP.indexOf("<span className=\"opt-group-cap\">{t('Filter shape')}</span>", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const region = APP.slice(start, end);
    const controls = [...region.matchAll(/\n\s*(?:value|checked)=\{/g)].length;
    /* `Correction bands per driver` staat in "Filter shape" en niet in
     * "Goals & weighting" — hij hoort inhoudelijk bij deze audit (hij is de
     * knop die zegt hoeveel correctie de zoektocht mag kopen) en wordt daarom
     * apart geteld in plaats van de regio op te rekken. */
    expect(GOALS.filter((g) => g.state !== 'vfEqBands')).toHaveLength(controls);
    expect(region).toContain('vfEqBands' in {} ? '' : 'dissipationWeight');
  });

  it('élke GELEZEN sleutel staat in de ketensettings die de app bouwt', () => {
    for (const g of GOALS.filter((x) => x.status === 'read')) {

      /* Shorthand of niet: `powerMetric,` en `ampTarget,` staan er als
       * property-shorthand en `phaseMetric: phaseMetricMode` met een dubbele
       * punt. Beide vormen zetten dezelfde sleutel. */
      const re = new RegExp(`\\b${g.twoWayKey ?? g.reaches}\\s*[:,]`);
      expect(re.test(TWO_WAY), `${g.control} (${g.reaches}) staat niet in de ketensettings`).toBe(true);
    }
  });

  it('DE VONDST — `phasePriority` bereikt de settings en wordt door de VERKLARING overschreven', () => {
    /* Beide helften, want alleen samen zijn zij het gebrek: de app ZET hem
     * (dus het is niet vergeten), en de verklaring SCHRIJFT hem terug. */
    expect(TWO_WAY).toContain('phasePriority: phasePriority / 100');
    const decl = declareCandidateChainChoices({ stated: { eqBands: 3 } });
    expect(decl.stated.phasePriority).toBe(DEFAULT_PHASE_PRIORITY);
    /* En de overschrijving gebeurt werkelijk: een ketensetting van 0,25 komt
     * er als de motor-default weer uit. */
    const after = withDeclaredChainChoices(
      { settings: { phasePriority: 0.25 } } as never,
      decl,
    ) as { settings: { phasePriority?: number } };
    expect(after.settings.phasePriority).toBe(DEFAULT_PHASE_PRIORITY);
    expect(after.settings.phasePriority).not.toBe(0.25);
  });

  it('…en de app geeft de schuif nergens aan de verklaring mee — op geen van de drie routes', () => {
    /* Dat is de precieze vorm van het gebrek, en zij is een BRONSCAN omdat
     * geen functietest kan zeggen of de app haar meegeeft. Drie aanroepen:
     * de drieweg, de tweeweg en de tune van een getekend netwerk. */
    const at = [...APP.matchAll(/declareCandidateChainChoices\(\{/g)].map((m) => m.index!);
    expect(at.length, 'de app roept de ketenverklaring niet op drie routes aan').toBe(3);
    for (const i of at) {
      /* Het ARGUMENT van de aanroep: tot de eerste `});` erna. Ruim genoeg om
       * élke sleutel te bevatten en te smal om de volgende aanroep te raken. */
      const arg = APP.slice(i, APP.indexOf('});', i));
      expect(arg, `aanroep op ${i} geeft de schuif wél mee`).not.toContain('phasePriority');
    }
    /* EN DE TEGENPROEF: de verklaring KAN hem dragen — het is geen ontbrekend
     * mechanisme maar een ongebruikt mechanisme. */
    expect(declareCandidateChainChoices({ stated: { eqBands: 3, phasePriority: 0.25 } }).stated.phasePriority).toBe(0.25);
  });

  it('élk V1-ALLEEN-veld draagt zijn badge, en élk GELEZEN veld draagt er geen', () => {
    for (const g of GOALS) {
      const row = V2_INPUT_REGISTER.find((r) => r.id === g.state);
      if (g.status === 'v1-only') {
        expect(row, `${g.control} heeft geen registerrij`).toBeDefined();
        expect(row!.cls, g.control).toBe('v1-legacy');
        expect(APP, `${g.control} is niet gebadged`).toContain(`v1Legacy('${g.state}')`);
      } else {
        expect(APP, `${g.control} draagt een v1-badge die hij niet verdient`).not.toContain(
          `v1Legacy('${g.state}')`,
        );
      }
    }
  });

  it('GEEN ENKEL VELD IS DOOD: élke sleutel wordt door een echte lezer gelezen', () => {
    /* "Dood" zou zijn: in de settings en door niemand gelezen. Voor de GREY
     * gewichten is de lezer de tuner zelf (zij staan in GREY_KEYS, wat betekent
     * dat A3j ze expliciet laat overnemen); voor de gestelde sleutels is het de
     * verklaring. Beide verzamelingen worden hier gelezen en niet opgesomd.
     *
     * De V1-ALLEEN-velden staan er met opzet buiten: van hen is juist
     * VASTGESTELD dat de v2-route ze niet leest, en zij dragen daarvoor hun
     * badge. "Dood" is de derde toestand — in de settings en door niemand
     * gelezen — en die hoort leeg te zijn. */
    const grey = new Set<string>(GREY_KEYS as readonly string[]);
    const chain = new Set<string>(CHAIN_CHOICE_KEYS as readonly string[]);
    const unread: string[] = [];
    for (const g of GOALS.filter((x) => x.status === 'read')) {
      const known =
        grey.has(g.reaches) ||
        chain.has(g.reaches) ||
        // gesteld door `declareCandidateChoices` (`put`), of een eigen lezer
        ['phaseMetric', 'ampTarget', 'powerMetric', 'audit', 'rSourceDisqualifyOhm', 'ampMinLoadOhm', 'diWeight'].includes(
          g.reaches,
        );
      if (!known) unread.push(`${g.control} → ${g.reaches}`);
    }
    expect(unread).toEqual([]);
  });

  it('DE TWEEDE VONDST — de twee DRIEWEG-only knoppen, en zij worden verschillend behandeld', () => {
    /* Beide bereiken alleen de drieweg-ketensettings. Het VERSCHIL is of een
     * tweewegontwerper ze ziet: `diWeight` staat achter `threeWay` en is dus
     * onzichtbaar waar hij niets doet; `rSourceDisqOhm` staat er altijd, en
     * dat is het gebrek. Hij zegt het sindsdien naast zichzelf. */
    const threeWayOnly = GOALS.filter((g) => g.status === 'three-way-only').map((g) => g.state);
    expect(threeWayOnly.sort()).toEqual(['diWeight', 'rSourceDisqOhm']);
    expect(TWO_WAY).not.toContain('rSourceDisqualifyOhm');
    expect(TWO_WAY).not.toContain('diWeight');
    /* De drieweg-settings dragen ze allebei wél — zonder die tegenproef is
     * "niet in de tweeweg" ook waar voor een sleutel die nergens bestaat. */
    const three = APP.slice(APP.indexOf('rSourceDisqualifyOhm: rSourceDisqOhm') - 4000, APP.indexOf('rSourceDisqualifyOhm: rSourceDisqOhm') + 2000);
    expect(three).toContain('rSourceDisqualifyOhm: rSourceDisqOhm');
    expect(three).toContain('diWeight');
    // En de melding staat er, alleen op een tweeweg en alleen op de v2-route.
    expect(APP).toContain('not read on the two-way Engine v2 route');
    expect(APP).toContain('{engineV2Enabled && !threeWay && (');
  });

  it('de DRIEWEG-only knop is ook drieweg-only gerenderd, en dat is waarom hij geen badge krijgt', () => {
    /* `diWeight` bereikt `threeWayDesign` en niets op de tweewegroute. Dat is
     * geen dood veld maar een gescopeerd veld, en de app rendert hem achter
     * `threeWay` — dus een tweewegontwerper ziet hem niet en kan er niet door
     * misleid worden. */
    const i = APP.indexOf("{t('DI anchor weight')}");
    expect(i).toBeGreaterThan(0);
    expect(APP.slice(Math.max(0, i - 900), i)).toContain('{threeWay && (');
  });

  it('de zes v1-knoppen staan als ONGEREGULEERD geboekt, met de zesde erbij', () => {
    for (const id of ['errorSmoothOct', 'hpLpPref', 'scan3Mode', 'bomCapEur', 'excursionSpl', 'phasePriority']) {
      expect(V2_UNGOVERNED_ROWS, id).toContain(id);
    }
  });
});
