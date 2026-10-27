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
import { V2_FORM_FIELDS, V2_INPUT_REGISTER, V2_UNGOVERNED_ROWS } from '../v2InputRegister.ts';

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
    /* U-9 fase 2 — V15: WAS 'v1-only' (U-5c). IS 'read': U-9 mat (N1) dat de
     * TUNER de schuif leest — `network.weights` komt uit de ruwe invoer en de
     * hook spreidt ze als laatste — terwijl de ontwerpstap en de synthese de
     * verklaarde 50/50 krijgen. Het gebrek dat U-5c vond staat er nog (de
     * verklaring leest de schuif niet), maar "doet niets" was half waar. */
    status: 'read',
    why: 'de tuner leest hem (U-9, N1); ontwerpstap en synthese krijgen de verklaarde DEFAULT_PHASE_PRIORITY (M-4)',
  },
  { control: 'Phase metric', state: 'phaseMetricMode', reaches: 'phaseMetric', status: 'read', why: 'de kandidaat STELT hem uit de ketensettings (put)' },
  { control: 'Amplitude target', state: 'ampTarget', reaches: 'ampTarget', status: 'read', why: 'idem' },
  { control: 'Weight for in-room sound', state: 'dirWeight', reaches: 'directivityWeight', status: 'read', why: 'GREY: expliciet overgenomen, nooit verklaard' },
  { control: 'Power response', state: 'powerMetric', reaches: 'powerMetric', status: 'read', why: 'de kandidaat STELT hem uit de ketensettings (put)' },
  { control: 'DI-fold weight', state: 'powerFoldWeight', reaches: 'powerFoldWeight', status: 'read', why: 'GREY' },
  /* U-10 fase 3 (V15) — WAS: 'Error smoothing' (errorSmoothOct), v1-only. IS:
   * het besturingselement en zijn state zijn weg; elke route leest
   * SEARCH_SMOOTHING_OCTAVES. Er is geen v1-only rij meer in dit paneel. */
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

/**
 * Het gegroepeerde Filters-paneel, als bron. U-9 fase 2 — V15: WAS de regio
 * tussen de koppen "Goals & weighting" en "Filter shape"; IS het hele paneel
 * tussen zijn markers, want die v1-koppen zijn weg en hun velden staan in de
 * groep waar hun gemeten effect ze plaatst (B-2.1).
 */
function goalsRegion(): string {
  const start = APP.indexOf('{/* I-1 FORM · V2 PANEL');
  const end = APP.indexOf('{/* I-1 FORM · V2 PANEL END */}', start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  return APP.slice(start, end);
}

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
    /* U-9 fase 2 — V15: WAS "de regio telt evenveel besturingselementen als de
     * inventaris". IS: élk geïnventariseerd veld staat in het paneel; het
     * paneel draagt nu ook de velden van de andere v1-secties, en die telt de
     * app-brede driftguard (`u9Fase2.test.ts`) tegen het register. */
    const region = goalsRegion();
    for (const g of GOALS) {
      expect(region, g.control).toMatch(new RegExp(`(?:value|checked)=\\{(?:String\\()?${g.state}\\b`));
    }
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

  it('…en de app geeft de schuif nergens aan de verklaring mee — op geen van de vier routes', () => {
    /* Dat is de precieze vorm van het gebrek, en zij is een BRONSCAN omdat
     * geen functietest kan zeggen of de app haar meegeeft. Drie aanroepen:
     * de drieweg, de tweeweg en de tune van een getekend netwerk. */
    const at = [...APP.matchAll(/declareCandidateChainChoices\(\{/g)].map((m) => m.index!);
    /* U-10 (V15-vorm) — waren drie; de tune van een getekend DRIEWEG-netwerk
     * (`runNetOptimizeV2_3`) is sinds U-10 de vierde, en hij geeft de schuif óók niet mee. */
    expect(at.length, 'de app roept de ketenverklaring niet op vier routes aan').toBe(4);
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

  it('élk V1-ALLEEN-veld is verborgen, en élk GELEZEN veld draagt zijn effectbadge', () => {
    /* U-9 fase 2 — V15: WAS "élk v1-only veld draagt `v1Legacy` op beide
     * plaatsen". IS: het ene v1-only veld (`errorSmoothOct`) is `niets` en wordt
     * nergens getekend (fase 1), en élk gelezen veld van het paneel draagt de
     * badge die zegt wat het doet (`fieldBadge`). De schuif draagt sinds N1 geen
     * v1-badge meer maar de gemeten notitie, op het paneel én in de wizard. */
    for (const g of GOALS) {
      const row = V2_INPUT_REGISTER.find((r) => r.id === g.state);
      if (g.status === 'v1-only') {
        expect(row, `${g.control} heeft geen registerrij`).toBeDefined();
        expect(row!.cls, g.control).toBe('v1-legacy');
        expect(row!.effect, g.control).toBe('niets');
        expect(APP).toContain(`{rendersRow('${g.state}') && (`);
      } else {
        expect(APP, `${g.control} draagt een v1-badge die hij niet verdient`).not.toContain(
          `v1Legacy('${g.state}')`,
        );
      }
    }
    const badge = "fieldBadge('phasePriority')";
    expect(APP.split(badge).length - 1, 'de schuif staat op TWEE plaatsen').toBe(2);
    expect(goalsRegion(), 'het expertpaneel draagt de badge niet').toContain(badge);
    const w = APP.indexOf('name="wiz-priority"');
    expect(w).toBeGreaterThan(0);
    expect(APP.slice(w, w + 2500), 'de Goals-stap van de wizard draagt de badge niet').toContain(badge);
    expect(V2_INPUT_REGISTER.find((r) => r.id === 'phasePriority')!.effectNote).toMatch(/tuner reads this slider/);
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
    /* U-9 fase 2 — V15: WAS "de melding staat er op een tweeweg" (U-5c). IS:
     * de knop is op de tweeweg en de hybride VERBORGEN, net als `diWeight`
     * (Sander, 25-10-2026: één regel voor alle vier de per-route velden), dus
     * de melding is weg met de knop. */
    expect(APP).not.toContain('not read on the two-way Engine v2 route');
    const k = APP.indexOf("{t('Source R disqualify ≥')}");
    expect(k).toBeGreaterThan(0);
    expect(APP.slice(Math.max(0, k - 900), k)).toContain('{threeWay && !v2Hybrid && (');
  });

  it('de DRIEWEG-only knop is ook drieweg-only gerenderd, en dat is waarom hij geen badge krijgt', () => {
    /* `diWeight` bereikt `threeWayDesign` en niets op de tweewegroute. Dat is
     * geen dood veld maar een gescopeerd veld, en de app rendert hem achter
     * `threeWay` — dus een tweewegontwerper ziet hem niet en kan er niet door
     * misleid worden. */
    const i = APP.indexOf("{t('DI anchor weight')}");
    expect(i).toBeGreaterThan(0);
    /* U-9 fase 2 — V15: WAS `{threeWay && (`; IS `{threeWay && !v2Hybrid && (` —
     * een hybride draait de tweewegketen, waar hij niets doet. */
    expect(APP.slice(Math.max(0, i - 900), i)).toContain('{threeWay && !v2Hybrid && (');
  });

  it('van de zes knoppen van toen staan er twee in het BESTUURDE paneel; vier zijn weg', () => {
    /* V15: WAS "ongereguleerd geboekt" (U-1/U-5c), daarna (U-9 fase 2) alle zes
     * in het bestuurde paneel. IS (U-10 fase 3.4): errorSmoothOct, scan3Mode en
     * bomCapEur hebben geen registerrij meer, hpLpPref is een rij zonder
     * besturingselement (verliesvrij in het projectbestand, B-4.3), en
     * excursionSpl en phasePriority staan nog in het paneel. */
    for (const id of ['excursionSpl', 'phasePriority']) {
      expect(V2_UNGOVERNED_ROWS, id).not.toContain(id);
      expect(V2_FORM_FIELDS.some((f) => f.row === id && f.form === 'v2-panel'), id).toBe(true);
    }
    for (const id of ['errorSmoothOct', 'scan3Mode', 'bomCapEur']) {
      expect(V2_INPUT_REGISTER.some((r) => r.id === id), id).toBe(false);
    }
    expect(V2_UNGOVERNED_ROWS).toContain('hpLpPref');
    expect(V2_FORM_FIELDS.some((f) => f.row === 'hpLpPref')).toBe(false);
  });
});
