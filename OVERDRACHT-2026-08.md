# Overdracht — augustus 2026

Stand van zaken na de serie die begon met "de optimizer is achteruitgegaan".
Alles hieronder is gemeten, niet beredeneerd; waar een getal staat is er een
run achter.

---

## Het patroon dat de hele serie verklaart

**Een beslissing genomen op een grootheid die een latere trap nog verandert.**
Vijf keer, in vijf niet-verwante hoeken van de code:

| plek | de beslissing | wat er later mee gebeurde |
|---|---|---|
| Merger | de gain-fit | de baffle step hoorde er vóór — anders fit je een verschil weg dat er hoort te zijn |
| Ranker | oordeelde over `audit.rSourceOhm` | bevroren vóór de shrink ladder en de snap; die verzetten het nog |
| Evaluatieband | kostfunctie las het grid | kandidaten kwamen van de geldigheidsband — 19,9% bandbreedte verschil |
| Knie | gekozen op de pre-EQ-score | de EQ-trede verbetert de fase daarna met een factor vier |
| Fase-guard | trial-seed droeg de fx van het incumbent | de acceptatiepoort vergeleek tegen een score die niet bij dat ontwerp hoorde |

De vorm is telkens dezelfde: een getal beschrijft iets anders dan waar het aan
vastzit. Het is niet te vinden met tests die groen zijn — alle vijf hadden
groene tests — alleen met een meting die het geleverde ding opnieuw doormeet.

**De structurele remedie staat in `netOptimizer.ts`** (A3g): élke grootheid
waarop geoordeeld mag worden leeft in `before`/`after`, en die twee zijn het
enige dat `report(metrics, parts)` bouwt — een functie die geen getal kan
maken zonder de onderdelen waar het bij hoort. Alles daarbuiten is diagnose en
draagt dat in zijn naam (`audit.rSourceTunedOhm`).

---

## Gerepareerd

**De R_src-wal in `fxOf` (A3e) — 17 graden M-T-fase.** Een `INFEASIBLE`-wal in
de doelfunctie. Gebisect op één kandidaat, alles verder gelijk:

```
ec00d7c (ervoor)      25 parts  ±1,54 dB  W-M  5,5°  M-T 10,6°
5b0e4e8 (A3d)         25 parts  ±1,54 dB  W-M  5,5°  M-T 10,6°
28f3b9f (A3e)         24 parts  ±2,54 dB  W-M 18,3°  M-T 27,5°
HEAD                  24 parts  ±2,54 dB  W-M 18,3°  M-T 27,5°
HEAD, wal verwijderd  25 parts  ±1,54 dB  W-M  5,5°  M-T 10,6°
```

Waarom het pijn doet: met 1e6 ligt élk overtredend punt op een plateau
waarvan de enige gradiënt de overschrijding is. Een simplex die daar start
navigeert blind. **"Exact nul binnen de grens" is waar en niet ter zake — de
zoektocht start niet binnen.** Een constraint is geen veiliger soort
objective-term; het is hetzelfde ding met een andere naam.

**De gate-vloer (A3h).** ARTA schrijft `Right window = 5,021 ms, Tukey 0.25` —
het woord "gate" komt er niet in voor. Tien bestanden die hun venster netjes
melden lazen als "geen venster", en een 4,5 ms uit een kastveld sprong in.
Evaluatieband 508 → 455 Hz. `readGateHeader` geeft nu `parsed` / `absent` /
`unparseable`; een globaal veld valt niet meer in voor een bestandseigenschap.

**De vier kostfunctie-banden (A3d)** lezen `evalBand` in plaats van het grid.

**De bevroren ranker (A3g)** oordeelt op `after.rSourceOhm`, gemeten op de
geleverde onderdelen.

**De knie (deze ronde)** wordt gekozen ná de EQ-trede. Drie dingen moesten
tegelijk waar zijn — multi-start (het knielandschap is multimodaal), EQ
opnieuw afleiden per proefknie, en géén continue polish erna. Ontwerpstap
3,631 → 2,928 fx, M-T 9,5 → 4,7, knie 1930 → 2095.

**Het EQ-budget is een plafond geworden.** Een band of knie wordt alleen
genomen als het slechtste paar niet verslechtert. Het omslagpunt is geen
constante (4 banden op de ene set, 1 op de andere), dus een default zou fout
zijn geweest.

**De testdrivers zijn drivers.** `testDrivers.ts` — T-S-model met gepoorte
dubbele piek en zadel op Fb, semi-inductieve spreekspoel. Geen enkele test in
de suite had ooit een gepoorte woofer met een zadel gezien.

---

## Vastgesteld, niet gerepareerd

**De vlakke fase-richting in de doelfunctie.** Twee kandidaten landen op
±1,49 en ±1,48 dB — 0,01 dB uit elkaar — met M-T 12,3 tegen 7,3°. De
amplitudekant convergeert strak, de fase waaiert uit; in een vlakke richting
bepaalt het startpunt de uitkomst.

Gemeten wat meer fasegewicht doet aan de spreiding over drie kandidaten
(ontwerpstap):

```
prioriteit   spreiding M-T   spreiding W-M
0,15              9,6°           13,1°
0,35              5,8°           12,0°
0,50              8,9°            2,6°
0,70              8,8°            1,5°
0,90              4,5°            3,7°
```

W-M is grotendeels op te lossen met gewicht; M-T halveert maar blijft op
4,5°. **De weging is een echte bron, niet de enige.**

**Het overlapvenster.** Het 20 dB-venster wordt smaller bij steilere filters,
en een smaller venster is makkelijker goed te scoren. Gemeten op twee sets:

```
              venster(oct)   M-T avg
jouw set LR2      3,12         32,9
         BW3      2,21         43,8
         LR4      1,43         20,6
KOAN     LR2      3,12         44,9
         BW3      2,12         50,9
         LR4      1,76         36,9
```

Richting klopt op beide sets, **maar BW3 breekt het**: tussenliggend venster,
slechtste score. Alignment-kwaliteit en vensterbreedte zijn met deze opzet
niet te scheiden. Een vaste breedte (bv. één octaaf aan weerszijden) is de
voor de hand liggende toets.

**Het systematische synthese-verlies.** Ontwerp → gesynthetiseerd ongetuned →
geleverd, op M-T: 5,2 → 16,7 → 9,6. De synthese kost consequent 7–9 graden,
de tune haalt een deel terug. Gemeten over drie kandidaten liggen de
ongetunede netwerken binnen 1,8° van elkaar terwijl het geleverde 7,7° spant
— **de synthese is het gemiddelde verlies, de tune is de variantiebron.** De
ideale EQ-banden worden passieve traps die fase dragen die het ontwerp niet
modelleert.

**Z_FLOOR_OHM = 2,5** zit nog in de gates, de reparatiepas en de
diskwalificatie. Die waarde komt uit één versterker (NAD M10 V2) en hoort
niet in een tool voor duizend gebruikers. De wal is wél uit de kostfunctie
verwijderd; de rest staat open. Zie de issues.

---

## Wat NIET waar bleek

De gerapporteerde regressie bestond niet. Het referentieontwerp heeft 25
onderdelen (niet 18), de huidige kandidaten zijn **vlakker**, en de "12 en 14
graden" waren P95-waarden naast een uniform gemiddelde — twee verschillende
grootheden. Op één meetlat leveren de kandidaten M-T 7,3 / 12,3 / 15,0, en de
7,3 draagt 18 onderdelen: dat ís de referentie, en de bron van de herinnerde
"18". **Het was variantie, geen achteruitgang.** De R_src-vondst staat op
eigen bewijs, om een andere reden dan waarvoor we zochten.

---

## De refactor A4–A8

Wacht op de reflectievrije meting. Die vervangt de gate-vloer van 455 Hz
volledig en verschuift elk Z-min-getal in deze serie (de woofers zijn niet
ingespeeld: Fs ~31 tegen 24,5 op het blad, de bovenste piek op 52,4 Hz zakt
richting het systeemminimum). Een grote refactor tegen data die op het punt
staat te veranderen is precies de situatie waarin je achteraf niet meer kunt
toewijzen wat wat deed.

- **A4** — import-UI, meerdere bronnen per tak. Golden snapshot tegen de
  post-A3-toestand; één bron via de nieuwe UI moet bit-identiek zijn.
- **A4b** — per-tak banden: een term verklaart welke bronnen hij raakt.
- **A5** — posities per bron. Hier komt ook `micDistanceMm` binnen: zijn set
  is in twee sessies gemeten (mic 935 mm hoog; 1000 mm afstand / 1387 mm
  hoog) en één globaal veld kan die twee niet dragen. ARTA schrijft geen
  afstand, dus dit vraagt een veld per bron, geen betere parser.
- **A6** — hoeksets per bron. **A6b** — één solve, twee aanroepers.
- **A7** — netlijst declareert in plaats van af te leiden; `pickSlotsN` wordt
  legacy achter een vlag. **Test 8 (netwerk-zelfconsistentie) is verplicht in
  dezelfde commit als de tweede Driver-part** — met één part klopt de
  parallelmeting toevallig, met twee is hij een factor 2 fout, en dat werkt
  kwadratisch door in `dissipationWeight`.
- **A8** — poort als eigen bron via `mouthZMm`.

---

## Dataset-feiten die niet uit de data te lezen zijn

Staan in `KOAN_DATASET_NOTES` (`sourceMeta.ts`):

- SPL per woofer los gemeten, impedantie van het paar parallel.
- **De woofers zijn niet ingespeeld** (meting 16 aug 2026).
- **Z-min is op deze set geen filterprobleem**: kale takken parallel 1,43 Ω,
  geleverd netwerk 2,62 Ω — het filter tilt de last al met 1,19 Ω op, en alle
  hefbomen samen kopen 0,26 Ω (10%). Wat overblijft is de bedrading.
- **Twee 8-ohm woofers parallel dragen in deze kast geen 4-ohm typeplaatje.**
  IEC vraagt 3,2 Ω; geen enkele kandidaat haalt het, hoogste 2,63 Ω, en het
  kále paar meet 3,17 Ω.
