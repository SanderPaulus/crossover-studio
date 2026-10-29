# E-6 fase 0 — de Priority-schuif gemeten (29-10-2026)

Geen engine-wijziging. Script: `scripts/measure-e6-phase-priority.ts`. Data:
`test-fixtures/e6_phase_priority.json`. Geboekt als **V52** in `CLAUDE.md`.

## Stap 2 — wat elke lezer krijgt, per route

Observatoren op `designThreeWay`/`optimizeVirtualFilters` (ontwerpstap), `synthesize`
(synthese) en `optimizeNetworkValues`/`minimizeNetwork` (tuner), door de echte
`handleV2Request`. De payload volgt de app: schuif in `settings.phasePriority`,
ketenverklaring zonder `phasePriority`.

| route | schuif | ontwerpstap | synthese | tuner |
| --- | --- | --- | --- | --- |
| drieweg scan (parsers-fixture) | 0,25 / 0,5 / 0,75 | 0,5 / 0,5 / 0,5 | 0,5 / 0,5 / 0,5 | 0,25 / 0,5 / 0,75 |
| tweeweg scan (casus 1b) | idem | 0,5 | 0,5 | 0,25 / 0,5 / 0,75 |
| hybride scan (casus 1h, gemeten vorm) | idem | 0,5 | 0,5 | 0,25 / 0,5 / 0,75 |
| ⚙ Optimize tweeweg en drieweg | idem | draait niet | draait niet | 0,25 / 0,5 / 0,75 |
| ✂ Minimize tweeweg en drieweg | idem | draait niet | draait niet | 0,25 / 0,5 / 0,75 |

Op 0,5 is er geen splitsing. `chainDeclarationKey` beweegt op geen enkele route met de
schuif, de run-vingerafdruk wel (via de grijze gewichten).

## Stap 3 — P2

- Op 0,5 is de huidige stand byte-identiek aan "alle drie op 0,5": dezelfde
  netlist-digest op beide fixtures (parsers `8997ffde`, casus 1b `c1464f54`).
- Casus 1, 1b, 1h en 2 stellen `phasePriority: 0,5` in hun settings en verklaren 0,5.
  Geen corpus en geen live ketenrun kan door een reparatie bewegen.

## Stap 4 — wat de splitsing kost

Drie armen, één factor verschillend: (i) **split** = de app vandaag (ontwerp 0,5,
tuner s), (ii) **alle drie op s**, (iii) **alle drie op 0,5**.

**Parsers-fixture** (drieweg, budget 80 evaluaties, geen poorten gewapend; BOM op de
casus-1-catalogus zonder spoelfamilie, dus indicatief):

| arm | s | uitkomst | rms dB | ± dB | M-K W→M / M→T ° | onderdelen | BOM € |
| --- | --- | --- | --- | --- | --- | --- | --- |
| alle op 0,5 | — | geleverd | 0,705 | 1,580 | 6,74 / 4,49 | 42 | 31,14 |
| split | 0,25 | geleverd | 0,636 | 1,423 | 8,17 / 7,49 | 40 | 24,61 |
| alle op s | 0,25 | geleverd | 0,533 | 1,369 | 6,40 / 4,81 | 43 | 27,89 |
| split | 0,75 | geleverd | 0,780 | 1,855 | 5,89 / 3,77 | 42 | 27,38 |
| alle op s | 0,75 | geleverd | 0,820 | 1,744 | 5,60 / 3,95 | 42 | 26,28 |

**Casus 1b, kandidaat 1947,9 Hz LR4** (de geleverde van het corpus, alle poorten
gewapend, min |Z| = M-B/|Z| tegen de vloer 2,6 Ω):

| arm | s | uitkomst | rms dB | M-K ° | min \|Z\| Ω | onderdelen | BOM € | s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| alle op 0,5 | — | geleverd | 0,588 | 2,58 | 2,600 | 32 | 77,61 | 274 |
| split | 0,25 | geleverd | 0,561 | 2,98 | 2,600 | 32 | 76,61 | 235 |
| alle op s | 0,25 | **geweigerd**: M-C tweeter −16,0 dB tegen −20 | — | — | — | — | — | 141 |
| split | 0,75 | geleverd | 0,600 | 2,50 | 2,600 | 30 | 77,71 | 273 |
| alle op s | 0,75 | geleverd | 0,699 | 3,76 | **3,404** | **25** | **39,75** | 129 |

De ± -kolom leest op casus 1b in alle geleverde armen 70,5–70,7 dB. Dat is niet de
schuif (de arm die er niets aan verandert leest het ook). **Uitgezocht in E-7 (V53):** het
dode 20-kHz-punt werd in de gladding meegenomen. Ná de reparatie: "alle op 0,5" ±1,18, "alle op
0,75" ±1,55, netlists ongewijzigd.

**Referentie, niet herhaald:** M-4 (16-09-2026) draaide op casus 1 "alle op 0,75" op twee
gestelde kruispunten. 362,3 Hz werd geweigerd op M-D; 518,8 Hz leverde en was
slechter op M-K, nuldiepte, rms en BOM (+91 %).

**Lezing.**
- De split-arm beweegt weinig: alleen de tuner verschuift, op een topologie die
  ontworpen is op 50/50. Hij levert op beide fixtures en heeft niemand gekozen.
- Pas als de schuif ook de ontwerpstap bereikt, verandert het ontwerp echt. Op
  casus 1b wordt het dan bij 0,25 een weigering (M-C) en bij 0,75 een ander,
  goedkoper netwerk: de helft van de BOM, 7 onderdelen minder, min |Z| 3,40 Ω, maar
  rms +0,11 dB en M-K +1,2°.
- De richting is per casus anders. Op casus 1 (M-4) kostte 0,75 91 % meer aan BOM,
  op casus 1b 49 % minder. Elke arm is één kandidaat met één seed.

## Stap 5 — wie de schuif gebruikt

- **App-startwaarde** 50 (`appDefaults.ts`), met de U-9-markering "app default".
- **Guided** vraagt hem niet (U-9 fase 3). De **Wizard** (alleen expert) heeft de radio
  25/50/75.
- **Een oud project** opent met zijn eigen waarde (`setPhasePriority(d.phasePriority)`),
  zonder melding. Die waarde stuurt dan de tuner, niet de ontwerpstap.
- `v1Carryover` noemt hem niet. Hij staat niet in `V1_FIELD_DEFAULTS` (U-5c).

## B-5 — besloten: optie B (Sander, 29-10-2026)

Eén waarde, drie lezers: de motor. De schuif en de Wizard-radio zijn weg; ontwerpstap,
synthese en tuner lezen allemaal `DEFAULT_PHASE_PRIORITY` (0,5).

## Fase 1 — wat er veranderd is

- **De reparatie zit op één plek.** `threeWayNetworkFacts` en `twoWayNetworkFacts`
  (worker.ts) bouwen de declared chain input nu eerst en lezen de tunergewichten
  daaruit (`chainInput.settings.phasePriority`). De ene bron is
  `declareCandidateChainChoices`; zonder kandidaat is de verklaring de identiteit en
  leest de tuner de eigen instelling van de aanroeper, zoals vóór E-6.
- **Na de reparatie, dezelfde trace** (`stap2_lezers_na_E6` in de JSON): op alle zeven
  routes krijgen ontwerpstap, synthese en tuner 0,5, ook bij een ruwe 0,25 of 0,75.
- **De app** zet `DEFAULT_PHASE_PRIORITY` op alle zes plaatsen waar zij keteninstellingen
  bouwt, ook op de twee benoemde v1-routes (`vfRounds`, `soloChain`). Die lezen dus ook
  geen verborgen knop meer.
- **Een oud project** draagt zijn waarde verliesvrij mee (`v1CarriedRef`, B-4.3), en de
  openmelding noemt hem: *"Priority: response % · phase %, phase share in %, set to "75""*.
  Een nieuw project schrijft geen `phasePriority`. De kop van de melding heet nu
  "Settings this app no longer reads", omdat de schuif geen v1-veld was.
- **Register:** rij `phasePriority` is `niets` met reden E-6, zonder besturingselement
  (`V2_UNGOVERNED_ROWS`). `APP_DEFAULTS` kent hem niet meer.
- **Browsercontrole (tweewegdemo, oud project met 75):** de run stuurt
  `settings = verklaring = 0,5` naar `v2ChainOne` (5 van 5 geleverd); ⚙ Optimize
  components stuurt 0,5 naar `v2TuneNetlist` en levert met elke gewapende poort binnen.
  Geen console-fout.
