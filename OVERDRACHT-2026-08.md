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
4,5°.

⚠ **CORRECTIE (aug 2026) — DE DEFAULT STOND AL GOED, dus dit verklaart minder
dan hierboven werd aangenomen.** `phasePriority` heeft default **50**
(`App.tsx:4586`), niet iets onder het omslagpunt van 0,35. De app draait dus
al aan de goede kant daarvan, en — dit is het punt — **de gemeten spreiding
van 7,3–15,0° M-T is ontstaan MÉT die weging.** Ook Sanders eigen project
draaide op 50.

De vlakke fase-richting is daarmee een echte maar SECUNDAIRE bron. De sweep
toont dat W-M-spreiding met gewicht koopbaar is (12,0 → 2,6 tussen 0,35 en
0,50, en de app zit al voorbij die stap); wat hij niet verklaart is de
M-T-spreiding die overblijft.

Verhoging naar 0,70 blijft een OPEN OPTIE, geen aanbeveling: −1,1° W-M-spreiding
voor +0,10 dB vlakheid, maar gemeten op drie kandidaten, één driverset en de
ONTWERPSTAP. Te dun om een globale default op te verzetten; vergt twee
volledige ketenruns voordat er iets verandert.

### De weging op de VOLLE keten gemeten (aug 2026) — en de premisse klopte niet

De opdracht was "de default staat nog onder het omslagpunt van 0,35, zet hem
omhoog". Dat is niet zo: `phasePriority` staat op **50** en dat is de goede
kant van 0,35 (de correctie hierboven). De vraag die overbleef is de enige die
de sweep openliet — is **0,70** beter dan 0,50 — en die is nu beantwoord op
zes VOLLEDIGE ketenruns in plaats van op de ontwerpstap.

Zelfde drie kandidaten, zelfde seeds, alles behalve `phasePriority` gelijk
(KOAN-3-weg-fixtures, doelen 2,5 dB / 15°, in-room 25 %):

```
kandidaat            pp     piek dB  avg dB   W-M °   M-T °  onderdelen
W-M 424 · M-T 2432   0,50    1,702    0,383    4,2     3,3      47
                     0,70    1,619    0,445    4,0     3,4      47
W-M 622 · M-T 2432   0,50    2,389    0,583    5,5    14,6      59
                     0,70    2,306    0,653    3,5     6,5      44
W-M 514 · M-T 1849   0,50    1,327    0,408    5,9     8,9      52   ← winnaar
                     0,70    2,351    0,701    3,8     4,3      46   ← winnaar
```

**De sweep hield stand, en sterker dan op de ontwerpstap.** De M-T-SPREIDING
over het veld gaat van 11,3° (3,3–14,6) naar 3,1° (3,4–6,6); W-M van 1,7°
naar 0,5°. Dat is precies wat de weging hoort te doen: de vlakke fase-richting
in de doelfunctie dichttrekken zodat het startpunt niet meer bepaalt waar een
kandidaat landt.

**De mtPhaseBar-lat (M-T gem. 7,1° op het referentieontwerp), op DEZELFDE
meetlat als de test (455 Hz–16 kHz, 500 pt):**

```
pp 0,50   3,3° · 14,6° · 8,8°   → 1 van 3 haalt de lat; de WINNAAR (8,8°) niet
pp 0,70   3,4° ·  6,6° · 4,3°   → alle drie halen hem; de winnaar op 4,3°
```

Dat is het scherpste resultaat van de ronde: op 0,50 levert de scan een
winnaar die de lat mist, op 0,70 haalt élke kandidaat hem.

**Wat het kost.** Op de winnaar: piek +1,02 dB (1,327 → 2,351) en avg
+0,293 dB (0,408 → 0,701), bij 6 onderdelen MINDER (52 → 46). Over het hele
veld gemiddeld: piek +0,29 dB, avg +0,14 dB, 7 onderdelen minder.

⚠ **DAAROM IS DE DEFAULT NIET VERZET — maar de balans is niet symmetrisch.** Sanders drempel was "meer dan ~0,3 dB
vlakheid inleveren → melden en wachten". Op de winnaar wordt die drempel
gehaald op avg (0,29) en ruim overschreden op piek (1,02). De keuze is
0,3–1,0 dB vlakheid tegen 4,5° M-T, een derde van de fase-spreiding, zes
onderdelen minder, €144 minder en een lat die anders niet gehaald wordt — dat
is een ontwerpersafweging, geen meetresultaat, en hij hoort bij Sander.

**En de BOM gaat de andere kant op, hard.** De winnende kandidaat is opnieuw
gedraaid met de demo-catalogus geladen (alléén om te PRIJZEN — `catalogSnap`
bleef uit, en de run reproduceerde piek/avg/onderdelen exact, dus het is
hetzelfde ontwerp):

```
pp 0,50   52 onderdelen   € 227
pp 0,70   46 onderdelen   €  83
```

**€144 minder** voor hetzelfde paar drivers. Dat is geen bijzaak: het is
dezelfde beweging als de spreiding — met meer fasegewicht landt de keten in
een bekken dat minder correctiewerk nodig heeft, en dat scheelt zowel
onderdelen als dure onderdelen.

### ⚠ CORRECTIE OP DE METING HIERBOVEN — het veld bestond uit AFGEKEURDE ontwerpen

Sander vroeg door: "je zet de winnaar bij 0,50 naast DEZELFDE kandidaat bij
0,70, maar de ranking gebruikt de weging, dus bij 0,70 kan een ander winnen."
De vraag was terecht en het antwoord is erger dan een ranking-detail.

**Wat er wél klopte**: de ranking is bij beide gewichten gedraaid en levert
BEIDE KEREN dezelfde kandidaat (514 × 1849). De vergelijking was dus toevallig
winnaar-tegen-winnaar. Dat had ik moeten TONEN in plaats van laten geloven.

**Wat er niet klopte**: alle zes de runs waren GEDISKWALIFICEERD. De ranking
die ik rapporteerde was een tie-break tussen afgekeurde ontwerpen.

```
kandidaat            Z min      reden
424 × 2432         1,66–1,70 Ω  bron-R 2,60–2,67 Ω ≥ 2,0 grens
622 × 2432         0,03 Ω       last kon niet gerepareerd worden
514 × 1849  (win)  0,00 Ω       idem
```

De "winnaar" die als levering werd voorgelegd presenteert een KORTSLUITING aan
de versterker. Precies daarom is hij zo vlak: spanningssturing verbergt dat
voor élke responsmetriek — de fout waarvoor de amp-vloer ooit is gebouwd, nu
in de meting zelf.

**Mijn eerste diagnose was FOUT en die correctie hoort hier ook.** Ik schreef
dat de harness `safety` niet meegaf (waar) en dat het de oorzaak was (niet
waar). Overgedaan mét de safety-grid, op de huidige boom, met 2,5 Ω als
opgegeven versterker: kandidaat 2 en 3 reproduceren tot op het cijfer
(piek 2,389 / 1,327 bij 0,50), alleen kandidaat 1 bij 0,70 verschuift
(1,619 → 1,739). **De safety-gate wijst deze netwerken niet af.**

**De echte oorzaak zit vóór de tuner, in de SYNTHESE.** Het gesynthetiseerde,
ONGETUNEDE netwerk presenteert al 0,039 Ω @ 5905 Hz. Eén onderdeel eruit halen
tilt hem terug:

```
B·C1 verwijderen:  Z min 0,039 → 2,360 Ω
B·C1 = 102 µF, SERIE-pad van de mid-tak
```

Bij 5905 Hz is 102 µF nog 0,26 Ω — een draadje. Daardoor kijkt de versterker
via die cap recht op de interne resonantie van de mid-ladder (B·L5 0,104 mH
serie + B·C6 10,5 µF shunt), en die presenteert bijna nul.

Het mechanisme is bekend en de bewaker bestaat al — alleen op de verkeerde
trap. `seriesCeilFor` (het serie-pad-realisme-plafond, "een 91 µF seriecap is
een draadje met extra stappen") leeft in de netOptimizer-TUNE. De per-tak
SYNTHESE heeft hem niet, en die synthese fit elke tak in ISOLATIE tegen zijn
eigen driver-impedantie — er is in die trap geen enkele grootheid die de
systeem-INGANGSIMPEDANTIE ziet. Een tak kan dus intern volkomen gezond zijn en
tóch, ver buiten zijn passband, een bijna-kortsluiting aan de versterker
aanbieden.

En de amp-vloer-reparatie kan dat niet meer redden: hij verzet alleen WAARDES,
en om deze last te tillen heeft hij 2,77–3,00 Ω serieweerstand nodig — boven
de 2,0 Ω-diskwalificatiegrens. Vandaar de nette maar dodelijke melding "beide
doelen kunnen hier niet tegelijk waar zijn".

**De winnaar per gewicht, wat Sander vroeg** (zelfde kandidaat, 514 × 1849):

```
                piek dB   avg dB   W-M °   M-T °   parts   BOM    Z min
pp 0,50          1,327    0,408     5,9     8,9     52    €227   0,00 Ω  ✗ afgekeurd
pp 0,70          2,351    0,701     3,8     4,3     46    € 83   0,00 Ω  ✗ afgekeurd
```

Sanders hypothese dat 0,70 op 424 × 2432 zou uitkomen (en de ruil dan
+0,29 dB / −5,5° zou zijn) gaat NIET op: die kandidaat wordt bij 0,70 LAATSTE,
ondanks betere piek (1,739) én betere M-T (3,5°). Niet door de blend maar door
een KLASSE: hij verliest er één extra op bron-R (2,67 Ω tegen de 1,0 Ω-grens).
De rangorde is bovendien identiek mét en zónder opgegeven versterker — met
alles gediskwalificeerd domineert `dqClass` toch. (Kanttekening: die
floorless-herrangschikking is geen getrouwe floorless RUN — de
diskwalificatie-teksten zijn ontstaan in een run mét de 2,5 Ω opgegeven.)

**Conclusie: de wegingsvraag is op dit veld niet te beantwoorden.** Alles wat
er te kiezen valt is onbouwbaar, om een reden die niets met de weging te maken
heeft.

**STAP 1 IS DAARMEE VERVALLEN (Sanders besluit).** `phasePriority` blijft
**50** — niet omdat 0,70 verloor, maar omdat er geen geldige meting ligt om
hem op te verzetten. De sweep (ontwerpstap) en de zes ketenruns staan hierboven
en blijven bruikbaar als achtergrond; als bewijs voor een default-wijziging
tellen ze niet. Opnieuw meten kan pas op een veld dat bouwbare kandidaten
oplevert, en dat vraagt eerst de ingangsimpedantie-vondst hieronder.

### De drie vragen vóór de ingangsimpedantie-check (aug 2026), beantwoord

Sanders voorkeur: de check op de ingangsimpedantie, niet het waarde-plafond —
`seriesCeilFor` is een PROXY voor "dit onderdeel is een draadje", en hier is
het probleem niet de 102 µF maar de resonantie erachter. Afleiden in plaats van
schatten, zoals bij de gate-vloer. Voor er code kwam wilde hij drie dingen
weten. Gemeten op ontwerp + synthese, zónder tune.

**(1) KAN de synthese het zien? JA — en er is geen assemblage voor nodig.**

De bijna-kortsluiting is in élk gemeten geval een eigenschap van ÉÉN TAK OP
ZICHZELF. Het geassembleerde minimum is gelijk aan het minimum van de slechtste
tak alléén, tot op drie decimalen:

```
                            geassembleerd    slechtste tak alleen
W-M 514 · M-T 1849 · eq 2      0,005 Ω           0,005 Ω  (mid)
W-M 424 · M-T 2432 · eq 2      0,692 Ω           0,693 Ω  (mid)
2-weg xo 2400 · eq 2           0,787 Ω           0,787 Ω  (laag)
2-weg xo 3000 · eq 2           0,982 Ω           0,983 Ω  (laag)
W-M 622 · M-T 2432 · eq 2      1,078 Ω           1,084 Ω  (mid)
```

Dat is geen toeval maar de topologie: de takken staan PARALLEL over één
generator, dus Z_in van het systeem is de parallelschakeling van de
tak-ingangsimpedanties, en één tak die naar nul zakt domineert die
parallelschakeling volledig. Het geassembleerde getal ligt consequent een paar
promille ONDER het slechtste tak-getal — dus een tak-check heeft een kleine
marge nodig, geen factor N.

Structureel: `synthesize` bouwt zijn tak al mét generator (`EG`/`RG`,
synthesis.ts:334) en lost hem op met `solveNetwork` (regel 646 in de fitlus,
974 op het eind) — en `solveNetwork` geeft `inputZ` gewoon terug. **De
grootheid ligt er al; er wordt alleen niet naar gekeken.** Geen terugkoppeling
na de assemblage nodig.

**(2) HOE VAAK? Breed, en NIET eigen aan deze driverset of aan 3-weg.**

```
SET A  koan-3way (Sanders gemeten 3-weg, 12 seeds)     3 van 12  < 1 Ω
SET B  KOAN 2-weg (andere set ÉN het 2-weg-codepad)    2 van  6  < 1 Ω
                                                      ─────────
                                                       5 van 18  (28 %)
```

En er zit een scherp patroon in: **het gebeurt uitsluitend mét EQ-banden.**
Alle negen seeds met `eqBands = 0` zijn schoon (laagste 1,014 Ω); vijf van de
negen met `eqBands = 2` duiken onder 1 Ω. De traps en shelf-realisaties die de
EQ-trap toevoegt zijn wat de bijna-kortsluiting maakt.

Dit is dus geen randgeval van één meetset maar een structureel gat in de
synthese — het treft beide driversets en beide codepaden.

**(3) WAAR IN FREQUENTIE? Gemengd — en daarmee vervalt de goedkope check.**

Sanders hoop was: alleen buiten de doorlaatband van elke tak kijken. Dat zou
3 van de 5 gevallen MISSEN:

```
                            Z min            doorlaatband tak    ligging
W-M 514 · M-T 1849 · eq 2   0,005 Ω @ 4799   mid  472–2301 Hz    BUITEN
W-M 622 · M-T 1849 · eq 2   0,005 Ω @ 4799   mid  472–2301 Hz    BUITEN
W-M 424 · M-T 2432 · eq 2   0,692 Ω @ 1004   mid  422–2625 Hz    binnen
2-weg xo 2400 · eq 2        0,787 Ω @ 1639   laag 210–2625 Hz    binnen
2-weg xo 3000 · eq 2        0,983 Ω @ 2134   laag 210–2996 Hz    binnen
```

De check moet dus over de hele band. Wat wél opvalt is dat de twee gevallen
BUITEN de doorlaatband van een andere orde zijn — 0,005 Ω is een echte
kortsluiting, de drie binnen de band zijn 0,7–1,0 Ω: een zware maar niet
onmogelijke last. Twee verschijnselen, één maat die ze allebei vangt.

### De weiger-drempel uit de verdeling (aug 2026), vóór er een getal vastligt

Sanders keuze: de bestaande maat uit `impedanceDiag` — tak-ingangsimpedantie
gedeeld door de KALE driverimpedantie (`branchImpedanceRatios`). Driver- en
apparatuuronafhankelijk, en hij bestaat al: geen nieuwe constante. Twee
populaties, twee gevolgen — kapot wordt geweigerd, zwaar wordt gerapporteerd.

De ratio over alle 18 seeds (48 tak-metingen), gesorteerd:

```
  0,0011    0,005 Ω /  5,01 Ω @  4799 Hz   mid   BUITEN  W-M 514 · M-T 1849 · eq 2
  0,0011    0,005 Ω /  5,01 Ω @  4799 Hz   mid   BUITEN  W-M 622 · M-T 1849 · eq 2
  ───────────────────────────────── KLOOF ×159 ─────────────────────────────────
  0,1746    0,693 Ω /  3,97 Ω @  1004 Hz   mid   binnen  W-M 424 · M-T 2432 · eq 2
  0,1839    0,789 Ω /  4,29 Ω @  1670 Hz   mid   binnen  2-weg xo 2400 · eq 2
  0,2148    0,984 Ω /  4,58 Ω @  2174 Hz   mid   binnen  2-weg xo 3000 · eq 2
  0,2570 … 0,8942   (39 metingen, aaneengesloten)
  1,6421   23,672 Ω / 14,42 Ω @  1124 Hz   tweeter       (serie-element, onschuldig)
```

**De kloof is een factor 159 en er ligt niets in.** Sanders schatting klopte
aan beide kanten: de kapotte populatie zit rond 0,001 (hij gokte 0,002 — de
kale mid meet op 4799 Hz 5,01 Ω, niet 3,4, vandaar het verschil) en de zware
last rond 0,18–0,21 (hij gokte 0,20).

**Voorstel: weigeren onder ratio 0,01.** Het meetkundig midden van de kloof is
0,0139; 0,01 is het ronde getal ernaast — "één procent van wat de driver zelf
aanbiedt". Marges: **9× boven** de kapotte populatie, **17× onder** de laagste
gezonde meting. Beide meer dan een orde.

Twee eerlijkheden die erbij horen:

1. **De verre kant van de kloof is DUN.** Er zijn twee metingen onder 0,01 en
   het is twee keer HETZELFDE verschijnsel (mid-tak, 4799 Hz, twee kandidaten
   die op hetzelfde ontwerp uitkwamen) — één fenomeen, twee waarnemingen, geen
   twee onafhankelijke steekproeven. De drempel is juist daarom op 0,01 gezet
   en niet dichter tegen de data aan: met 9× marge doet één extra waarneming er
   niet toe.
2. **De gezonde populatie is AANEENGESLOTEN vanaf 0,1746.** Er is dus geen
   tweede kloof die "zware last" van "normaal" zou scheiden — precies waarom
   die band gerapporteerd wordt en niet geweigerd.

**Verhouding tot `RATIO_FLAG = 0,7` in hetzelfde bestand.** Die notitie zegt
uitdrukkelijk dat de ratio GEEN schone scheider is en dat alles in de module
read-only is, want "een getal dat goed genoeg is om een ontwerper te tonen is
niet automatisch goed genoeg om een ontwerp op te weigeren". Dat blijft staan
en wordt hier niet overtreden: het gemeten tegenvoorbeeld is een serie-spoel
die op eigen kracht 0,62 haalt, en de weiger-drempel ligt **62× lager**. Op
0,7 scheidt de maat niet; op 0,01 scheidt hij met twee ordes marge. Eén maat,
twee drempels, twee gevolgen — en dat verschil hoort in de module te staan
zodra de check er komt.

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

### Het synthese-verlies onderzocht (aug 2026) — hypothese WEERLEGD, en de reden is leerzaam

De hypothese was: *de ontwerpstap modelleert zijn EQ-banden als fase-vrij,
terwijl de passieve realisatie dat niet is.* Drie metingen, en het antwoord is
nee — maar er ligt iets anders onder dat wél klopt.

**(1) De ideale band draagt gewoon fase.** `evalEqBand` (filters.ts) is een
complexe analoge biquad uit het audio-EQ-cookbook — peak, lowShelf en
highShelf allemaal — dus de ontwerpstap rekent met volledige minimum-fase. De
hypothese in zijn letterlijke vorm is fout.

**(2) Maar de passieve realisatie van een band ís die band niet.** Per band
gemeten door hem uit de spec te halen en de gerealiseerde tak-transfers te
delen (±2 octaven om de bandfrequentie):

```
mid      peak @1576 Hz −2,7 dB Q2,70   gem |Δmag| 3,07 dB   gem |Δφ| 15,6°   worst 77,9°
tweeter  peak @3545 Hz −3,4 dB Q2,47   gem |Δmag| 0,96 dB   gem |Δφ|  8,0°   worst 16,0°
tweeter  peak @5041 Hz −2,2 dB Q5,28   gem |Δmag| 0,48 dB   gem |Δφ|  3,7°   worst 12,4°
woofer   lowShelf @904 −2,3 dB Q0,71   gem |Δmag| 1,51 dB   gem |Δφ| 11,0°   worst 26,8°
```

De mid-band is het duidelijkst: het IDEAAL is −0,03 dB op 414 Hz (een
peak-band is ver weg unity), de realisatie doet daar −2,94 dB. Wat de synthese
bouwde is geen piek-cut maar een breedbandige niveauverschuiving. (Kanttekening
die erbij hoort: de synthese her-fit álle waardes als je een band weghaalt,
dus dit meet "wat deze band met de tak gedaan heeft", niet een geïsoleerde
band. Dat is ook precies de vraag die de ontwerpstap stelt.)

**(3) En het verlies schaalt monotoon met het EQ-budget.** Ontwerp → synthese
(ongetuned), zelfde kandidaten, alleen `eqBandsPerBranch` verschilt:

```
kandidaat A (W-M 514 · M-T 2432)      kandidaat B (W-M 424 · M-T 1849)
eq  ontwerp  synth   Δ M-T            eq  ontwerp  synth   Δ M-T
 0   20,1°   14,1°   −6,0             0   26,9°   20,2°   −6,7
 1   15,3°   12,9°   −2,4             1   11,6°   15,0°   +3,4
 2   10,4°   28,8°  +18,4             2    7,7°   14,2°   +6,5
 4    5,6°   39,3°  +33,6             4    7,6°   13,2°   +5,6
```

**Zonder EQ-banden bestaat het synthese-verlies niet** — de synthese maakt de
M-T-fase dan zelfs BETER. Het "systematische 7–9 graden verlies" is dus geen
eigenschap van de synthese; het is een eigenschap van de EQ-trede.

**(4) MAAR — en dit is de vondst die de remedie omdraait — de TUNE haalt het
volledig terug, en de ontwerpstap voorspelde de levering al goed.** Dezelfde
kandidaat A, hele keten:

```
                    ontwerp   synth (ongetuned)   GELEVERD
eq = 0   M-T          20,1°         14,1°          20,9°     piek 2,887  avg 1,406  36 parts
eq = 2   M-T          10,4°         28,8°           9,9°     piek 2,447  avg 0,692  59 parts
```

Het ONTWERP voorspelt de LEVERING op ~1° nauwkeurig, in beide gevallen. Het
gesynthetiseerde ongetunede netwerk voorspelt geen van beide — het ligt niet
eens tússen de twee in.

**Daarmee is de "5,2 → 16,7 → 9,6"-lezing uit de vorige ronde verkeerd
geframed, en de reden hoort erbij: die drie getallen zijn als een KETEN gelezen
terwijl er geen keten is.** Drie getallen achter elkaar met pijlen ertussen
lezen als een verhaal — verlies hier, herstel daar — en dat verhaal is
verzonnen door de opmaak, niet gemeten. Het middelste getal is geen tussenstand
maar een SEED: het gesynthetiseerde netwerk draagt geen claim over wat er
geleverd wordt, en het ligt op deze meting niet eens tússen de twee andere in
(ontwerp 20,1 → synth 14,1 → geleverd 20,9 bij nul EQ-banden; ontwerp 10,4 →
synth 28,8 → geleverd 9,9 bij twee). Het verschil ontwerp↔synthese meten is dus
een getal over een tussenproduct, en er een oorzaak uit afleiden is de
gedocumenteerde bugfamilie van dit project in een nieuwe vermomming: **een
beslissing genomen op een grootheid die een latere trap nog verandert** — hier
zelfs een DIAGNOSE genomen op zo'n grootheid.

Dat is het generieke deel dat het onthouden waard is: alleen twee getallen die
allebei een CLAIM dragen mogen met een pijl verbonden worden. Ontwerp en
levering doen dat (het ontwerp voorspelt de levering hier op ~1°); de seed
ertussen doet dat niet.

**En de tweede uit dezelfde familie, één ronde later: een TIE-BREAK TUSSEN
GEDISKWALIFICEERDE ONTWERPEN GEPRESENTEERD ALS DE LEVERING.** De stap-1-scan
rangschikte zes kandidaten die allemaal waren afgekeurd — twee met een
kortsluiting aan de versterker — en de kop van die lijst is als "wat de app
levert" voorgelegd. Sander vormde zich er een oordeel over: hij woog 0,3 dB
vlakheid tegen 4,5° fase op ontwerpen die geen van beide gebouwd konden
worden.

Het is dezelfde fout als de pijlen: **een getal beoordeeld zonder de status
ernaast.** De ranking DEED wat hij moest doen — hij zette alle zes in klasse
10 en brak de gelijkstand op de blend — maar een gerangschikte lijst ziet er
hetzelfde uit of de bovenste rij nu bouwbaar is of niet. `disqualified` stond
in het resultaat en werd niet gelezen.

De regel die hieruit volgt, en die breder geldt dan deze twee gevallen: **een
kwaliteitsgetal is pas een uitspraak als de status erbij staat.** Rangschikken
is geen keuren. Elk rapport dat een winnaar noemt hoort te zeggen of er
überhaupt een geldige kandidaat in het veld zat — de scan-note doet dat al in
de app ("er ís een gezonde kandidaat, hij scoort alleen minder vlak" tegen
"geen enkele kandidaat haalde het"), en een meetrapportage hoort dat na te
doen.

**Gevolg voor de prioriteitenlijst.** De voorgestelde remedie — "de ontwerpstap
moet de fase van de passieve realisatie meenemen" — is NIET gerechtvaardigd
door deze meting: de ontwerpstap voorspelt de levering al goed, en de EQ-banden
verdienen hun plek ruimschoots (geleverd 9,9° tegen 20,9° zonder, en avg 0,692
tegen 1,406 dB). Wie de geleverde M-T wil verbeteren moet de KEUZE van de
ontwerpstap sturen, niet de synthese — en dat is precies de knop uit stap 1.
Wat het EQ-budget zelf betreft: 4 banden is op beide kandidaten slechter dan 2
op zowel vlakheid als fase; dat omslagpunt staat als issue in ROADMAP.md.

**En de 4,5° M-T die bij hoog fasegewicht bleef staan?** Die komt hier NIET uit
voort. Dat was een SPREIDING op de ontwerpstap, en de volle ketenmeting van
stap 1 laat zien dat de spreiding met gewicht wegvalt (M-T-veld 3,3–14,6 bij
0,50 tegen 3,4–6,6 bij 0,70). Twee symptomen, twee oorzaken.

**Het systematische synthese-verlies — DE HOOFDVERDACHTE.**
⚠ ACHTERHAALD door de meting hierboven: de CIJFERS in deze alinea kloppen, de
CONCLUSIE eruit niet — ze verbindt een seed met een levering. Blijft staan
omdat de meting anders niet meer te controleren is. Sinds de correctie
hierboven is dit de eerste inhoudelijke stap en niet de tweede: de weging stond
al goed, dus wat de achterstand draagt is dít.

Ontwerp → gesynthetiseerd ongetuned →
geleverd, op M-T: 5,2 → 16,7 → 9,6. De synthese kost consequent 7–9 graden,
de tune haalt een deel terug. Gemeten over drie kandidaten liggen de
ongetunede netwerken binnen 1,8° van elkaar terwijl het geleverde 7,7° spant
— **de synthese is het gemiddelde verlies, de tune is de variantiebron.** De
ideale EQ-banden worden passieve traps die fase dragen die het ontwerp niet
modelleert.

**Te onderzoeken vóór er code verandert**: vergelijk per EQ-band de fase van de
ideale band met die van zijn passieve realisatie. Bevestigt dat de hypothese,
dan is de remedie dat de ONTWERPSTAP die fase meeneemt — niet dat de tune het
achteraf goedmaakt. Toets meteen of het ook de 4,5° M-T verklaart die bij hoog
fasegewicht blijft staan: twee symptomen, mogelijk één oorzaak.

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

### GEBOUWD: de degeneratie-weigering (aug 2026)

`RATIO_DEGENERATE = 0,01` in impedanceDiag.ts, met de gemeten verdeling in de
comment ernaast. `worstImpedanceRatio` is de ENE definitie — `branchImpedanceRatios`
rapporteert ermee, `synthesize` weigert ermee, geen tweede kopie van dezelfde
formule.

**Vorm: weigeren, geen strafterm.** De fit is onaangeroerd; het oordeel valt
één keer, op de afgeronde tak, aan de uitgang van `synthesize`
(`SynthesisResult.degenerateLoad`). Beide ketens zetten het in `disqualified`,
dus de kandidaat blijft zichtbaar en doorgestreept in de scan-tabel en kan
nooit winnen. Een eindige wal wist het landschap dat hij bedekt, óók als hij
exact nul is binnen de grens — dat heeft 17° M-T-fase gekost (A3e) en daarvóór
6 dB rimpel. **Een constraint is geen veiliger soort objective-term.**

De melding noemt tak, frequentie, ratio en beide impedanties, en zegt
uitdrukkelijk dat het een DEGENERATIE is en geen zware last, met "reach niet
naar de versterker- of impedantie-instellingen; de topologie van deze kandidaat
moet veranderen". Anders draait de gebruiker aan de verkeerde knop.

Ook het 2-weg-pad kreeg hem (`ChainResult.disqualified`, nieuw): 2 van de 6
2-weg-seeds in de census zaten onder 1 Ω, dus dit is geen 3-weg-verschijnsel.

**De doctrine in impedanceDiag is verfijnd, niet overtreden.** De oude zin
blijft waar en heeft zijn onderwerp terug: een getal dat goed genoeg is om een
ontwerper te tonen is niet automatisch goed genoeg om een ontwerp op te
weigeren — **maar dat hangt aan de DREMPEL, niet aan de maat.** Op 0,7 scheidt
de ratio niet (een serie-spoel haalt op eigen kracht 0,62); op 0,01 scheidt hij
met de gemeten kloof van ×159. Eén maat, twee drempels, twee gevolgen.

`degenerateLoad.test.ts` pint de KLOOF, niet de constante: de kapotte kant, de
dichtstbijzijnde gezonde kant, het EQ-patroon, de afstand tussen de twee
drempels en de gedeelde definitie. Een synthese-wijziging die een van beide
populaties verschuift faalt zichtbaar, met het getal dat bewoog.

### EIGEN BEVINDING, LOS VAN DE REPARATIE: het is de EQ-trap

De weigering vangt het symptoom. De oorzaak staat open, en het patroon is
scherp genoeg om apart te noteren:

```
eqBands = 0    9 van de 9 seeds schoon      laagste ratio 0,257
eqBands = 2    5 van de 9 onder 1 Ω         twee ervan op 0,005 Ω (ratio 0,0011)
```

**De EQ-trap maakt het**, op beide driversets en in beide codepaden. De per-tak
synthese realiseert de banden als traps en shelf-pads en fit ze tegen de
DRIVER-impedantie in isolatie; niets in die trap kijkt naar wat de tak aan de
versterker aanbiedt. Wat nog niet bekend is: of het aan een specifieke
realisatievorm ligt (de shunt-trap tussen laddersecties is de eerste
verdachte), aan een waardebereik, of aan de wisselwerking met de seriecap
ervoor. Dat verdient een eigen meting — zie ROADMAP.

---

## Wat er open blijft

1. **Waarom de EQ-realisatie degenereert** (hierboven). De weigering is een
   vangnet, geen verklaring.
2. **Stap 1 opnieuw meten** — de fase-weging (0,50 tegen 0,70) is niet te
   beslissen zolang de kandidaten onbouwbaar zijn. Zodra er bouwbare uit de
   scan komen: winnaar tegen winnaar, mét de status ernaast.
3. **Het EQ-budget-omslagpunt** op een tweede driverset (ROADMAP).
4. **De weiger-drempel hertoetsen** bij een derde driverset (ROADMAP).
5. **A4/A5/A7/A8 en de venstertoets** — wachtend op de nieuwe metingen, om de
   reden hieronder.

## INTERNE AUDIT VAN DE ONTWERPKETEN (23 aug 2026)

Aanleiding, in Sanders woorden: *"het doel van elke iteratie is dat het beter
wordt. We zijn nu een tijd bezig geweest voor een achteruitgang."* Dat klopt,
en dit hoofdstuk zegt waarom en wat eraan moet.

Alles hieronder is gemeten op ZIJN project (KOAN 3-weg, 16 aug) met zijn eigen
catalogus, tenzij er "onbekend" staat. Waar een getal staat is er een run
achter.

### De keten zoals hij nu is

```
1  kandidaten     xo-vensters uit gemeten fysica → (xoLow, xoHigh)-paren met kooien
2  ontwerpstap    64 structuren (alignment × polariteit), knie-verfijning, EQ-trede
                  → doelspecs.  ZIET GEEN IMPEDANTIE (geverifieerd)
3  synthese       per tak apart gefit tegen de EIGEN driver-Z; ziet de andere takken niet
4  merge          drie takken op één generator
5  tune           waarde-tune → staged snoei/escalatie → drift-catch → part-audit
                  → krimpladder → amp-vloer-reparatie → catalogus-snap
6  ranking        klassen (dq, zOk, Z-vloer, bron-R, BOM) → gemengde score
```

### Wat er per trap gemeten is

| trap | gemeten | oordeel |
|---|---|---|
| 2 | mikt 472/2432, levert 542/1791 — mid geknepen tot 1,7 oct | drift niet vastgehouden |
| 3 | seed Z-min **0,01–0,07 Ω**, op HEAD, op origin/main én op 20 aug | structureel kapot |
| 3 | eq0 0/3 mislukt · eq1 2/3 · eq2 3/3 | de EQ-trede is de motor |
| 5 | 2,62 → 2,62 · 3,36 → 3,18 | de tuner behoudt, redt niet |
| 5 | reparatie tilt 1,2 → 3,0 Ω; faalt vanaf seed 0,02 | enig Z-mechanisme |
| 5 | 100 µF over het serie-plafond kost **0,0002** strafterm | bewaker kan niet bijten |
| 5 | 3 inerte onderdelen meegeleverd | verdict zonder gevolg |
| 6 | winnaar ±1,53 dB / 34,6° tegen referentie ±0,60 / 8,8° | kroont het beste van een slecht veld |

### De bottlenecks

**B1 — De synthese is impedantie-blind, en zij bepaalt alles.** Elke tak wordt
in isolatie gefit; niets in die trap kent de systeem-ingangsimpedantie.
Resultaat: seeds van 0,01–0,07 Ω. Omdat de tuner behoudt in plaats van redt is
dat meteen het plafond van al het latere werk. **Hoofdoorzaak; de rest is
gevolg.**

**B2 — Z is nergens een ontwerpvariabele, alleen een reparatie achteraf.** De
amp-vloer-reparatie is het enige dat Z optilt. Lukt dat niet, dan ligt de last
vast op wat de synthese toevallig deed — een loterij in plaats van een keuze.

**B3 — Bewakers die niet kunnen bijten.** `seriesCeilFor` is een zachte
strafterm: 100 µF eroverheen kost 0,0002 in een objective van orde 1. Een
bewaker die geen uitkomst kan veranderen is erger dan geen: hij wekt de indruk
dat het geval gedekt is.

**B4 — Bewakers die op het verkeerde getal rekenen.** Datzelfde plafond
gebruikt ÉÉN anker voor drie takken (978 Hz = meetkundig gemiddelde van 535 en
1789). De tweeter kruist op 1789 en krijgt 96,6 µF waar 47,1 hoort.

**B5 — Verdicten zonder gevolg, door volgorde.** De eind-audit staat op
netOptimizer.ts:2517; dáárna komen de krimpladder (2531), de amp-reparatie
(2627) en de catalogus-snap (2880). Drie waarde-passes ná de laatste keuring.
Alles wat door hen inert wordt, wordt nooit gezien. Exact het patroon dat dit
document al vijf keer beschrijft: **een beslissing genomen op een grootheid die
een latere trap nog verandert.**

**B6 — De geleverde kruising ontsnapt aan het ontwerp.** Structuur en
polariteit gekozen voor 2432 Hz, geleverd op 1791. M-T-fase zwaait dan
−59…+36° waar de referentie binnen ±13° blijft.

**B7 — De EQ-trede is een voetzoeker.** Hij maakt de kortsluitingen,
verdubbelt het onderdeelaantal, en zijn fasewinst wordt niet geleverd (ontwerp
claimt −14,5°, levering +14,7° slechter).

**B8 — De ranking kroont altijd**, ook als geen kandidaat bouwbaar is.

**B9 — Kosten zijn alleen een tie-break.** €149 tegen €568 werd gekocht met
±0,93 dB en 26° fase; niets zegt dat de ontwerper die ruil niet wil.

### Wat eruit moet

1. Het zachte serie-plafond — harde klem per tak, of weg. Deze vorm misleidt.
2. EQ-banden standaard aan — default 0; aanzetten als bewuste keuze met prijs.
3. De reparatie als Z-mechanisme — vangnet mag, bepalend niet.
4. De audit vóór drie waarde-passes — die volgorde is onhoudbaar.
5. Ranking zonder bouwbaarheidspoort.

### De sequence die het moet worden

Leidend principe, één stap verder dan de ontwerpers-sequence van augustus:
**geen enkele trap mag de fysica van een eerdere trap hoeven repareren.**

```
1  vensters     ongewijzigd
2  niveau       ongewijzigd
3  structuur    + tak-ingangsimpedantie als KEUZECRITERIUM, niet alleen SPL/fase
4  synthese     + assemblage-check aan de uitgang, harde klem per tak, retry
5  tune         Z blijft uit de objective (anker-les) — maar hoeft niets te redden
6  audit        NA krimpladder, reparatie én snap; op wat verscheept wordt
7  ranking      eerst bouwbaar/niet-bouwbaar, dan kwaliteit
```

### Het stappenplan

**Stap 0 — een meetlat, vóór er iets verandert.** (Vertrekpunt ligt klaar:
`tools/bench/refrun.ts`, zie `tools/bench/README.md` voor draaien en data.) Er IS geen benchmark, en dat
is de reden dat 23 augustus een achteruitgang werd: vier verklaringen op rij
sneuvelden op meten, en een wijziging kon "af" heten zonder dat iemand wist of
hij won. Vaste harness: zijn project + zijn catalogus + drie vaste kandidaten,
met `20260820.2` als lat —

```
±0,60 dB avg · ±2,11 piek · 8,8° fase (P95 19°) · Z 3,4 Ω · 18 parts · €568
```

Eén regel per kandidaat, vijf getallen, onder tien minuten. **Elke stap hierna
wordt hierop gemeten, vóór en ná, en gaat terug als hij niet wint.** Dit is de
enige structurele garantie dat elke iteratie beter wordt.

**Stap 1 — de audit als laatste woord** (laag risico). Verplaats de eind-audit
naar ná krimpladder, reparatie en snap. Verwacht: inerte onderdelen weg,
minder parts, lagere BOM, kwaliteit gelijk. **GEDAAN 24 aug — en de
verwachting was FOUT; zie hieronder.**

**Stap 2 — het plafond laten bijten** (midden risico). Per tak op zijn eigen
kruising, en voor serie-pad-elementen een harde klem. Verlegt het zoekpad — de
anker-les — dus A/B op stap 0 en terug als het verliest.

**Stap 3 — de assemblage-check aan de synthesegrens** (het echte werk, lost B1
op). Na de merge de systeem-Zin meten; onder de grens niet doorschuiven maar
opnieuw fitten met de schuldige tak vast, of weigeren met reden. Dit is wat
Sander bij aanvang voorstelde en waar ik hem van afhield op een meting die op
de fixtures gold en op zijn luidspreker niet.

**Stap 4 — de kruising vasthouden** (gericht op de fase). De geleverde overname
mag niet een halve octaaf van het ontwerp liggen. **Van deze stap weet ik niet
of hij gaat werken.**

**Stap 5 — de ranking eerlijk maken.** Bouwbaarheid als poort vóór kwaliteit;
"geen kandidaat is bouwbaar" als geldige uitkomst.

### Wat nog steeds onbekend is

Waarom `20260820.2` ±0,60 dB en 8,8° haalt met 18 onderdelen terwijl geen
enkele kandidaat van de scan in de buurt komt. De EQ-trede verklaart de
IMPEDANTIE (eq0 geeft ~3 Ω), maar niet de vlakheid en de fase: ook met eq0
levert de scan ±1,53 dB en 34,6°. Er zit dus meer tussen "wat de app op 20
augustus deed" en "wat hij nu doet". Stap 0 is het gereedschap om dat uit te
zoeken zonder opnieuw te gokken.

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

---

## Wat andere ontwerpers doen, en wat daarvan hier geldt

Gelezen op verzoek van Sander (22 aug 2026): *"de methodieken van de betere
engineers... Maar beredeneren niet zo maar aannemen voor waar."* Elke bevinding
staat hier als HYPOTHESE met, waar mogelijk, een meting op zijn eigen data
ernaast. Wat ik niet kon hermeten staat als onbevestigd gemarkeerd.

Het voorbehoud dat overal geldt: vrijwel alle gepubliceerde praktijk gaat uit
van een MENS in de lus die handmatig itereert. Onze keten is volautomatisch.
Dat verschil is geen detail — het bepaalt bij twee van de vier vragen het
antwoord.

### 1. Impedantie: ontwerpvariabele of nabewerking? (B1/B2)

**Bevinding.** VituixCAD heeft de minimale impedantie ALS OPTIMIZER-TERM:
*"Check 'Minimum impedance' ... Squared error is increased with penalty
function if minimum impedance/EPDR drops below the setting."* Dat is precies
de vorm die wij bewust hebben verworpen (de anker-les: harde grenzen op
beslispunten, nooit in `fxOf`).

**Waarom die twee elkaar niet tegenspreken — en dit is de bruikbare les.**
Dezelfde handleiding waarschuwt: *"Optimization could end up to bad result if
initial parameter values are too far from good solution. Adjust parameters
manually closer to acceptable solution and restart solver."* Hun optimizer is
een VERFIJNING vanaf een punt dat een mens al goed heeft gezet. Een strafterm
kan het zoekpad dan niet verleggen, want het pad is kort. Onze anker-les is
gemeten op het omgekeerde geval: een wal die bijt terwijl je er nog vanaf
moet klimmen. Beide kloppen; de variabele is het STARTPUNT.

Gevolg voor ons: de strafterm hoort niet in `fxOf` thuis, maar de EIS hoort
naar voren — de seed moet de last al halen vóór de waarde-zoektocht begint.
Dat is stap 3 van het plan, en dit is er onafhankelijke steun voor.

**De klassieke leerboekvolgorde zegt hetzelfde, sterker.** Impedantie-egalisatie
(Zobel/conjugaat) wordt beschreven als iets dat je EERST doet: een filter dat
tegen een vlakke last is ontworpen verschuift zijn hoekfrequentie niet. De
gangbare vuistregel is dat de spoelinductie een 2e-orde laagdoorlaat zijn knie
tot ~0,4 octaaf kan verschuiven. Onze keten doet Zobel gated en achteraf.

*Onbevestigd:* die 0,4 octaaf is een gepubliceerd getal dat ik niet op zijn
drivers heb nagemeten.

### 2. De volgorde (topologie eerst of iteratief?)

**Bevinding, letterlijk uit de handleiding:** ontwerp de crossover → plaats de
filterblokken → zet de waarden HANDMATIG → *"Play with circuit topologies and
parameter/component values until reference axis response, listening window,
predicted in-room, power response, directivity index, individual off-axis
responses and impedance response meet your targets"* → en PAS DAARNA de
optimizer.

Twee dingen vallen op. (a) De impedantierespons staat in dat rijtje doelen die
de MENS haalt vóór er geoptimaliseerd wordt — nogmaals B1. (b) Topologie en
waarden worden samen gevarieerd, niet in twee gescheiden trappen zoals bij ons
(`designThreeWay` kiest structuur, `synthesize` + `optimizeNetworkValues`
kiezen waarden, en die twee praten alleen via de doelspecs).

Onze gelaagdheid is dus geen kopie van de praktijk maar een noodzaak van
automatisering. Dat is verdedigbaar — maar het verklaart wel waarom wij een
probleem hebben dat zij niet kennen (zie 4).

### 3. Hoe voorkomt men onbouwbare waarden? (B3/B4)

**Bevinding.** Harde grenzen per parameter: *"Min and Max fields limit parameter
value while manual adjustment and optimizing."* Geen zachte penalty, geen
schaalregel — een klem. E-reeks-afronding gebeurt NA de optimalisatie, met de
expliciete waarschuwing dat dat de fout vergroot.

Wij zijn hier de uitzondering: ons serie-pad-plafond is een zachte term die op
Sanders set 0,0002 aan de kostfunctie bijdraagt en dus niets kan tegenhouden.
De praktijk klemt. Dat is directe steun voor stap 2 van het plan, en het maakt
de keuze eenvoudiger dan ik hem had opgeschreven: geen slimmer gewicht, maar
een grens.

Onze catalogus-snap (discrete afdaling mét echte DCR/ESR) is aantoonbaar beter
dan hun na-afloop-afronden. Dat is een plek waar wij niets te leren hebben.

### 4. Hoe blijft de akoestische kruising staan? (B6)

**Bevinding: de vraag bestaat daar niet.** Een ontwerper die met de hand
waarden zet, kijkt uitsluitend naar de akoestische som; hij benoemt nooit een
"ontworpen kruising" die daarna zou kunnen weglopen. Het verschil dat wij meten
(ontworpen 341/1844 → geleverd 363/2776) is een artefact van onze twee trappen,
niet van de fysica.

Dat is geen vrijbrief — het betekent dat het geen bekend opgelost probleem is
en dat we het zelf moeten oplossen. Het bevestigt wel dat B6 de stap is
waarvan ik als enige niet weet of hij werkt: er is geen praktijk om van af te
kijken.

De praktijk-verificatie die er WEL is, is de omgekeerde-polariteit-nulcheck.
Wij tekenen die al (legend-serie "Som, tweeter omgekeerd"), maar geen enkele
poort of ranking kijkt ernaar. Een diepe nul op de kruising is het bewijs dat
de takken daar in fase optellen — precies wat bij Sanders 1775 Hz-inzinking
misging.

### 5. De vondst die ik niet zocht: EPDR — en |Z|min rangschikt anders

VituixCAD biedt naast "Minimum impedance" ook **EPDR** als optimizer-grens.
EPDR (Equivalent Peak Dissipation Resistance, Benjamin JAES 1994, populair
gemaakt door Keith Howard) is de weerstandswaarde die dezelfde PIEK-dissipatie
in de eindtrap veroorzaakt als deze belasting. Het combineert |Z| ÉN de
fasehoek; de literatuur stelt dat de EPDR-minima duidelijk lager liggen dan het
|Z|-minimum en **op andere frequenties** vallen.

**Niet aangenomen — zelf afgeleid en getoetst.** Klasse-B eindtrap, sinus, voeding
precies op de piekuitsturing: p = (V²/|Z|)·(1−sinθ)·sin(θ−φ), en voor een
weerstand is de piek V²/4R, dus

    EPDR = |Z| / (4 · max_θ[(1 − sinθ)·sin(θ − φ)])

Die reduceert per constructie tot EPDR = |Z| bij φ = 0. Toets tegen het
gepubliceerde ankerpunt (4 Ω bij 60° wordt als ~1 Ω genoemd): mijn formule geeft
**1,11 Ω**. Bij 0°: 4,00 Ω. De afleiding staat.

**Gemeten op Sanders eigen opgeslagen ontwerpen** (`tools/bench/epdr.mts`):

| ontwerp | \|Z\|min | EPDR-min | verhouding |
|---|---|---|---|
| 20260822.1 | 0,84 Ω @ 1204 Hz | 0,43 Ω @ 1300 Hz | 0,51 |
| 20260822.1-Zopt | **3,46 Ω @ 218 Hz** | **1,55 Ω @ 1290 Hz** | 0,45 |
| 20260822.4-optA | 3,40 Ω @ 288 Hz | 1,73 Ω @ 1936 Hz | 0,51 |
| 20260822.4-optB | **3,81 Ω @ 900 Hz** | **1,63 Ω @ 1951 Hz** | 0,43 |

Drie dingen, alle drie gemeten en geen van drieën aangenomen:

1. **De frequentie klopt niet.** Bij `-Zopt` beoordelen wij 218 Hz; de eindtrap
   werkt het hardst op 1290 Hz, waar |Z| 4,24 Ω is (ruim boven elke vloer) maar
   de fasehoek 43°. Het punt dat onze hele lastdoctrine bewaakt is niet het punt
   dat de versterker pijn doet.
2. **De verhouding is stelselmatig ~0,45–0,51.** Een 3,1 Ω-typeplaatje op de
   versterker is een |Z|-getal; de last die hij feitelijk ziet is ongeveer de
   helft daarvan zodra er fasehoek bij komt.
3. **De rangschikking KEERT OM.** Op |Z|min: optB (3,81) > Zopt (3,46) >
   optA (3,40). Op EPDR: optA (1,73) > optB (1,63) > Zopt (1,55). Het getal
   waarop wij rangschikken én diskwalificeren kiest een andere winnaar dan het
   getal dat de versterkerbelasting beschrijft.

**Eerlijke voorbehouden.** (a) De afleiding neemt de versterker op het randje van
klippen — dat is de juiste aanname voor een grens, maar het is een worst case.
(b) EPDR zegt hoe zwaar de last op DAT moment is, niet hoeveel muziekvermogen er
op die frequentie staat; een EPDR-minimum op 1,3 kHz is minder erg dan hetzelfde
minimum op 100 Hz. Wie EPDR als grens invoert, moet dat erbij zeggen.
(c) Vier ontwerpen van één luidspreker is geen verdeling.

**Wat dit voor het plan betekent.** Niet: "EPDR erin als extra term" — dat is de
fout die dit document al drie keer heeft opgeschreven. Wel: het getal hoort
ZICHTBAAR te zijn naast |Z|min (strip + scan-tabel), zodat een ontwerp dat op
|Z| slaagt en op EPDR zakt niet stil als gezond geleverd wordt. Rangschikken op
EPDR is pas te verdedigen als het op een tweede driverset is nagemeten.

### Wat we NIET blijken te missen

- De catalogus-snap met echte parasieten (zij ronden af).
- Ontwerpen op de gemeten akoestische som in plaats van op elektrische doelen.
- De gedeelde tijdreferentie en de excess-fase-brug.

### Bronnen

- VituixCAD help 2.0 (Kimmo Saunisto) — optimizer, min-impedantie/EPDR-penalty,
  parametergrenzen, aanbevolen werkvolgorde.
- Benjamin, "Audio Power Amplifiers for Loudspeaker Loads", JAES 42/9 (1994);
  Keith Howard, "Heavy Load: How Loudspeakers Torture Amplifiers" — EPDR.
- Zobel/impedantie-egalisatie: gangbare leerboekpraktijk, meerdere bronnen.

---

## Stap 0 is gebouwd: de meetlat (24 aug 2026)

`tools/bench/bench.mts`. Zijn project, zijn catalogus, drie vaste kandidaten,
en zijn eigen `20260820.2` als lat — door DEZELFDE pijplijn gemeten, zodat een
rij zichzelf niet kan vleien met een andere meetlat.

```bash
ROOT="$PWD" PROJ=<project.json> CAT=<catalog.json> REF=<x.adsfilter.json> \
  OUT=<uit.json> npx tsx tools/bench/bench.mts
```

**Wat er hard in staat, en waarom.** Grid (240 pt, 200–19 000 Hz), band
(455–16 000 Hz = zijn gate-geldigheidsband), de drie kandidaten mét hun kooien,
en alle instellingen. Een meetlat die meebeweegt met de code die hij moet
beoordelen meet niets. Verander hier alleen iets als je bewust een NIEUWE lat
begint, en schrijf dat dan hier op.

De kandidaten zijn (400, 2100), (455, 2432), (500, 1900) — het gebied waar zijn
scan leeft (W-M-venster 200–622, M-T 1849–2432). De instellingen zijn de
DEFAULTS die een gebruiker krijgt, inclusief `eqBands: 2`. Dat is bewust: bij
eq 0 haalt de reparatiepas alle drie de kandidaten naar ~3,0 Ω en is het gat dat
we repareren onzichtbaar; bij eq 2 valt hij open. De meetlat moet de fout kunnen
zien.

Elke kandidaat draait als eigen proces, parallel — één keten is minuten, drie op
een rij is geen meting van tien minuten.

**De lat meet zichzelf** (gecontroleerd 24 aug):

```
20260820.2      avg 0,48 · piek 1,29 · fase 8,63° (paren 7,4/8,6) · Z 3,36 Ω · 18 parts · €567,69
```

Vier van de zes reproduceren de audit exact (fase 8,8 → 8,63; Z 3,4 → 3,36;
18 parts; €568). **Avg en piek niet** (0,60/2,11 in de audit tegen 0,48/1,29
hier), en dat is geen fout: die audit-getallen komen uit de APP, op een andere
gridfijnheid en een ander zichtbaar bereik. Vandaar de regel die hierbij hoort:
**harnas-getallen vergelijk je alleen met harnas-getallen.** De lat is wat dit
harnas van zijn filter meet, niet een getal dat uit een ander venster is
overgeschreven.

### DE NULLIJN (24 aug 2026, commit c59db52)

Vastgelegd in `tools/bench/baseline.json`. Twee runs, **identiek tot op het
cijfer** incl. de geleverde kruisingen — de meetlat is deterministisch.

```
ontwerp                   avg    piek    fase   Zmin  Rbron  parts     BOM
20260820.2 (de lat)      0,48    1,29     8,6°  3,36   0,30     18    €568
W-M 400 · M-T 2100       0,39    1,29     4,7°  0,65   0,40     22    €196  ✗ last
W-M 455 · M-T 2432       0,70    1,91    23,9°  3,47   0,81     18     €85
W-M 500 · M-T 1900       0,35    1,33     6,4°  0,64   0,83     22    €153  ✗ last
```
(8 min 45 wandklok; geleverde kruisingen 428/2006 · 463/2381 · 560/1931)

**Wat deze tabel bewijst, en het is B1/B2 in één beeld.** Twee van de drie
kandidaten verslaan zijn handgebouwde filter op vlakheid ÉN fase, voor een
derde van de prijs — en presenteren 0,65 Ω aan de versterker. De enige
kandidaat met een gezonde last heeft 23,9° fase (volledig het W-M-paar:
23,9/9,6), bijna drie keer die van hem.

De optimizer is dus niet stuk. Hij kan het niveau van zijn handwerk halen, maar
uitsluitend langs een weg die de versterker kortsluit; zodra hij een gezonde
last moet leveren stort de fase in. Impedantie is geen ontwerpvariabele in de
keten, dus de goede ontwerpen zijn precies de onbouwbare.

Twee dingen die de tabel ook uitsluit: de kooien HOUDEN op deze drie (geleverd
ligt dicht bij ontworpen), dus B6 bijt hier niet en de fase-instorting van
kandidaat 2 heeft een andere oorzaak dan wegdrijven; en R_bron blijft overal
onder de waarschuwingsgrens van 1,0 Ω, dus die klasse bindt hier evenmin. Wat
bindt is de LAST.

**Twee weeffouten in het harnas zelf, gevonden en gerepareerd voordat de
nullijn vastlag:** een lege `disqualified`-array is truthy in JavaScript (een
kandidaat kreeg een ✗ die hij niet verdiende), en de bronweerstand werd uit
`audit.rSourceOhm` gelezen terwijl het geleverde netwerk in
`after.rSourceOhm` zit — `partAudit.ts:129` waarschuwt letterlijk dat er twee
velden met die naam bestaan die verschillende netwerken beschrijven.
`refrun.ts` leest nog steeds het verkeerde veld; elk R_bron-getal dat daaruit
komt is dat van een ander netwerk.

### Het protocol voor stap 1 t/m 5

1. Draai de meetlat op de HUIDIGE boom, bewaar `OUT` als `bench-<commit>.json`.
2. Bouw de wijziging.
3. Draai de meetlat opnieuw, zelfde PROJ/CAT/REF.
4. Vergelijk de vijf getallen per kandidaat. **Wint hij niet, dan gaat hij
   terug** — niet "verklaard waarom het toch goed is". Dat verklaren is precies
   wat 23 augustus een achteruitgang maakte.
5. Zet de voor/na-tabel in de commit-boodschap.

Een stap mag verliezen op één getal als hij op een ander duidelijk wint, maar
dan staat die ruil in de commit — expliciet, met beide getallen.


---

## Stap 1 gedaan: de audit als laatste woord (24 aug 2026)

De eind-audit stond op `netOptimizer.ts:2517`, met de krimpladder, de
amp-reparatie en de catalogus-snap eráchter. Nu draait hij als laatste, vlak
voor het materialiseren. **Zonder hertune**: die zou elke waarde weer van zijn
catalogusonderdeel af trekken en de snap ongedaan maken. Dat kost niets, want
`inert` betekent per definitie dA < 0,15 dB en dP < 1,5°, en de audit
hercontroleert elke verwijdering op het volle grid en draait hem terug bij
regressie.

### De meting: precies nul verschil

Drie kandidaten, alle zeven assen, tot op het cijfer gelijk aan de nullijn.
De lat bewoog niet mee (die meet met de audit uit, dus dat hoort ook zo).
Wandklok 525 → 518 s.

**En de audit stond niet stil** — dat is apart nagemeten, want "geen verschil"
en "hij draaide niet" zien er hetzelfde uit. Op kandidaat 1, in BEIDE
volgordes (nieuwe boom en een worktree op 5d9c679):

```
28 posten · 2 inert · 26 verdiend · 0 grijs · 2 verwijderd: C6 en B·R14
```

Identiek. Zelfde aantallen, zelfde onderdelen, zelfde verdicten.

### Wat dat betekent, en waarom de voorspelling fout was

De audit voorspelde "inerte onderdelen weg, minder parts, lagere BOM". Dat was
gebaseerd op de aanname dat de drie latere passes ONDERDELEN INERT MAKEN die
de audit op zijn oude plek nog niet kon zien. Op deze set gebeurt dat niet: de
twee inerte onderdelen zijn óók vóór de krimpladder al inert, en de 22 die
overblijven zijn alle 22 verdiend.

Achteraf is dat ook de logische uitkomst, en dat had ik vooraf kunnen
beredeneren: een onderdeel dat de som met < 0,15 dB verandert, kan de
beslissingen van de krimpladder, de reparatie en de snap over de ándere
onderdelen ook nauwelijks sturen. De volgorde kán daarom weinig uitmaken —
tenzij een latere pass een LEVEND onderdeel dood maakt, en dat is wat hier
niet blijkt te gebeuren.

**B5 was dus een echte volgordefout in de code, maar op deze set zonder
gevolg.** Dat is iets anders dan wat de audit ervan maakte, en het staat hier
zo omdat de gecorrigeerde voorspelling meer waard is dan de oorspronkelijke.

### Waarom hij tóch blijft staan

Het protocol zegt "wint hij niet, dan gaat hij terug". Toegepast op stap 1 is
dat de verkeerde lezing van mijn eigen regel, en de regel is daarom
aangescherpt:

> **Een KWALITEITSwijziging moet winnen op de meetlat. Een CORRECTHEIDSfix mag
> niet verliezen.** De meetlat meet ontwerpkwaliteit; hij kan per constructie
> niet zien of het getal dat je LEEST over het geleverde netwerk gaat.

Stap 1 is het tweede soort. Wat hij koopt is een garantie: geen enkele pass
die later achteraan wordt geplakt kan nog aan de audit ontsnappen — precies de
ziekte die dit bestand vier keer heeft opgeschreven ("passes were appended
after the point where the reporting was written"). Eerlijk erbij: op déze
kandidaten verandert zelfs het RAPPORT niet, dus de winst is structureel en
niet waargenomen.

Vier commentaarblokken die de oude volgorde beschreven zijn bijgewerkt; het
historische lijstje van vier bugs op `netOptimizer.ts:310` blijft staan, want
als geschiedenis klopt het.

---

## Stap 2 GEMETEN EN TERUGGEDRAAID: het plafond laten bijten (24 aug 2026)

Gebouwd zoals de audit hem beschreef: per tak zijn eigen anker (een seriecap
antwoordt aan de kruising onder zijn band, een seriespoel aan die erboven; de
referentie-impedantie is de EIGEN driver van die tak), plus een harde klem
in plaats van de strafterm van 0,0002.

### De meting — verlies, en niet marginaal

Tegen stap 1, zelfde drie kandidaten:

```
                    avg    piek    fase    Zmin  Rbron  parts   BOM
400/2100    0,39 → 0,39   1,29 → 1,22   4,7 → 5,7   0,65 → 0,63   0,40 → 1,48   22 → 31   €196 → €274
455/2432    0,70 → 0,40   1,91 → 1,11  23,9 → 6,5   3,47 → 0,76   0,81 → 2,80   18 → 30    €85 → €220   ok → GEDISKWALIFICEERD
500/1900    0,35 → 0,42   1,33 → 1,47   6,4 → 5,7   0,64 → 0,95   0,83 → 0,87   22 → 21   €153 → €108
```

Het beslissende getal staat op de middelste rij. Kandidaat 455/2432 was de
ENIGE in het veld met een gezonde last (3,47 Ω). Hij wint fors op vlakheid en
fase — en verliest precies datgene wat hem als enige bouwbaar maakte: 0,76 Ω,
bronweerstand 2,80 Ω (boven de diskwalificatiegrens van 2,0), 30 onderdelen in
plaats van 18, €220 in plaats van €85. Hij wordt nu gediskwalificeerd.

Wandklok 518 → 1090 s, ruim het dubbele.

### Wat het mechanisme is, en waarom dit stap 3 versterkt

Een klem neemt de tuner een vrijheidsgraad af, maar niet zijn doel. Hij koopt
dezelfde vlakheid dus langs een andere weg: **meer onderdelen en een lagere
impedantie**. Alle drie de kandidaten laten dat zien (+9, +12, −1 parts; twee
van de drie een hogere bronweerstand). De schade wordt niet voorkómen maar
VERPLAATST.

Dat is precies het argument voor stap 3. Een waardeplafond is een indirecte
poging om de last te beschermen; zolang de last zelf geen ontwerpvariabele is,
duwt elke beperking de schade naar de eerstvolgende vrijheidsgraad. De les uit
de literatuurronde zei hetzelfde van de andere kant: bij VituixCAD staat de
minimum-impedantie ALS DOEL in de optimizer, en de waardegrenzen zijn daar een
aanvulling op — niet een vervanging ervan.

### Twee eerlijkheden

**(1) Er is een lezing waarin de klem gelijk had.** De oude kandidaat 455/2432
haalde zijn gezonde 3,47 Ω met 18 onderdelen en 23,9° fase — dat is het profiel
van een netwerk dat nauwelijks filtert, en een last die je koopt door niet te
filteren is geen verdienste. De klem legde dat bloot. Maar wat er dan uit komt
is nog steeds onbouwbaar, en "de oude winnaar was ook niet best" is geen reden
om een slechtere te leveren.

**(2) De synthetische escalatietest waarschuwde vooraf, en ik heb hem terecht
niet weggerepareerd.** `netOptimizer.test.ts` "escalates with a bypass-C" viel
om: rimpel 5,08 → 5,40 dB en de bypass-C verdween (12 → 9 onderdelen). De klem
bleek daar te bijten op C1, de seriecap van de tweeter, die de tuner op 57,9 µF
wilde zetten tegen een plafond van 33. Dat is exact het geval waarvoor het
plafond bestaat (58 µF in 6 Ω is 1,4 Ω bij 2 kHz — de hoogdoorlaat is dan weg),
dus de bewaker deed wat hij moest. Hij maakte het resultaat alleen slechter.
Eén rode test op een kunstmatig netwerk was hier het VROEGE signaal van wat de
meetlat daarna op echte data bevestigde.

### Bewaard omdat het echt is: een misclassificatie in `positionOf`

Tijdens de bouw gevonden: `busTopology.positionOf` noemt élk element met beide
knopen op de bus 'series' — dus ook een condensator die PARALLEL OVER een
serieweerstand hangt. Elektrisch is dat het tegenovergestelde: de één draagt
het signaalpad, de ander vormt eroverheen. Als strafterm van 0,0002 was die
verwarring onzichtbaar; zodra er een klem op staat verbiedt hij een volkomen
legitiem onderdeel (een bypass-C over een pad).

Meegeteruggedraaid met de rest, want zonder klem heeft het geen consument.
**Wie een volgende bewaker op `positionOf` bouwt moet dit eerst repareren** —
de vorm is `hasParallelCompanion`: deelt dit element zijn knopenpaar met een
ander R/L/C, dan is het geen signaalpad-onderdeel. (Bijvangst van de meting: op
dit testnet was díe misclassificatie NIET de oorzaak van de rode test — de
getallen bleven identiek na de reparatie. Ook dat is gemeten, niet aangenomen.)

---

## Stap 3 GEMETEN EN TERUGGEDRAAID — en de premisse van het plan klopte niet
(24 aug 2026)

### Eerst: het plan zelf was weerlegd voordat er code was

Stap 3 zoals opgeschreven: "na de merge de systeem-Zin meten; onder de grens
niet doorschuiven maar opnieuw fitten of weigeren met reden". De meetlat, met
de seed-Z er nu permanent in:

```
kandidaat              seed-Z   geleverd-Z
W-M 400 · M-T 2100       0,48         0,65   ✗
W-M 455 · M-T 2432       0,72         3,47   ok
W-M 500 · M-T 1900       0,49         0,64   ✗
```

**B1 bevestigd**: de synthese overhandigt in álle drie de gevallen 0,5–0,7 Ω.
Zij is volledig impedantie-blind, en de bestaande weigering (ratio < 0,01 tegen
de kale driver) vuurt hier terecht niet — die vangt catastrofale degeneratie,
geen halve ohm.

**Maar "weigeren onder de grens" had alle drie geweigerd, inclusief de enige
die gezond eindigt.** 0,72 wordt 3,47 Ω: de reparatie tilt een seed soms met
een factor 4,8 op, en soms helemaal niet (0,48 → 0,65). "De tuner behoudt in
plaats van te redden" is dus te absoluut; hij rédt soms. Een seed onder de
vloer is niet gedoemd, en een poort daar had de winnaar weggegooid.

### Wat er wel gebouwd is, en waarom het terugging

Een TIE-BREAK op impedantie tussen gelijkwaardige startpunten van de
multi-start: binnen 1 % van de beste fit de hoogste tak-impedantie kiezen, en
alleen bij ≥ 2× winst. Vorm bewust gelijk aan de goedkoopste-BOM-tiebreak in
de tuner — een beslispunt, geen objective-term (stap 2 liet zien wat die kost).

Op de meetlat: **alle zeven assen identiek, seed-Z identiek, wandklok
519 → 520 s.** Volstrekt inert. Teruggedraaid.

### De fout die eronder zat, en het is een herhaling

Ik bouwde hem op bewijs uit `tools/bench/seedz.ts`, dat een ANDER grid (600 vs
240 punten), een andere band (tot 20 kHz vs 16 kHz) en andere kooien gebruikt
dan de meetlat. In díe configuratie stort de mid in tot 0,02 Ω en ligt er een
alternatief op 1,58 Ω — 69× beter voor 0,63 % fitfout, en de tie-break haalde
de seed daar van 0,02 naar 1,58.

In de configuratie die telt bestaat die keuze niet. Zelfde luidspreker, andere
instellingen. Dit is dezelfde fout als eerder in deze reeks (toen: fixtures in
plaats van zijn luidspreker, zichtbaar geworden aan piek 6,49 vs 1,4) in een
nieuwe vermomming. **Regel die daaruit volgt: een diagnose telt alleen als hij
in de configuratie van de meetlat is gedaan.** `seedz.ts` en `bench.mts` hebben
elk hun eigen config, en dat is een val die opnieuw zal toeslaan.

### De echte bevinding — en die wijst één laag hoger

De startpunten in de MEETLAT-configuratie, mid-tak van kandidaat 400/2100:

```
  #2        fx 0,3781   Zmin 0,018 Ω   <- winnaar
  #0/1/3/5  fx 0,4454   Zmin 0,047 Ω
  #4        fx 0,8770   Zmin 1,650 Ω
```

Er is een startpunt met 92× betere impedantie, maar het kost **132 % meer
fitfout** — geen gelijkstand, en geen enkele tie-break mag dat kopen. Fit en
last zijn hier een ECHTE RUIL binnen de gekozen topologie, geen ongelukje in
de selectie.

Daarmee ligt de hefboom niet bij de waardefit maar bij de STRUCTUUR:
`designThreeWay` kiest uit 64 structuren (alignment × alignment × twee
polariteiten) en is net zo impedantie-blind als de synthese. Op kandidaat
400/2100 kan geen enkele fit binnen de gekozen structuur een gezonde last
leveren; kandidaat 455/2432 haalt met een ándere structuur wél 3,47 Ω.

Dat sluit aan op wat de literatuurronde zei, van de andere kant: de gangbare
volgorde is topologie ÉN waarden variëren tot óók de impedantierespons het
doel haalt — niet waarden fitten en dan hopen.

**Voorstel voor de volgende poging** (niet gebouwd, niet gemeten): laat de
structuurzoeker zijn 64 kandidaten niet alleen op de akoestische som
beoordelen maar de winnaar kiezen uit de structuren die binnen een marge van
de beste liggen, op geassembleerde impedantie. Zelfde tie-break-vorm, één laag
hoger, en dáár is aantoonbaar iets te kiezen. Meten vóór bouwen, in de
configuratie van de meetlat.

### Wat er blijft staan

De meetlat draagt nu `seedZ` en `seedPeak` per kandidaat — wat de synthese de
tuner aanreikt, en daarmee het plafond van al het latere werk. Zonder dat
getal was geen van bovenstaande conclusies te trekken geweest.

---

## Waar de 0,48 Ω vandaan komt — en een conclusie die ik moest intrekken
(24 aug 2026, vervolg op stap 3)

### De dissectie

`tools/bench/structz.mts` (nieuw) dwingt elk van de 16 alignment-paren af,
synthetiseert, mergt en meet — op de invoer die `bench.mts` zelf wegschrijft.
Voor de winnende structuur op kandidaat 400/2100:

```
DISSECTIE LR4/LR4 — geassembleerde dip 0,48 Ω @ 2619 Hz
  woofer    41,21 Ω     eigen minimum 3,57 @  310 Hz
  mid        0,51 Ω     eigen minimum 0,51 @ 2619 Hz
  tweeter    4,85 Ω     eigen minimum 2,10 @ 10327 Hz
  parallelsom van die drie: 0,48 Ω   (controle op 0,48)
```

De parallelsom reproduceert de geassembleerde waarde exact, dus dit is geen
schatting: **de mid-tak ÍS de last.** Woofer en tweeter zijn onschuldig.

### De conclusie die ik moest intrekken

Ik rapporteerde eerst dat de CATALOGUS-SNAP de impedantie sloopte, op grond van
1,54 Ω zonder snap tegen 0,48 Ω met snap. **Dat was een ongeldige
vergelijking.** Met `catalogSnap` aan rekent de continue fit al mét
gemodelleerde parasieten (staat zo in CLAUDE.md), dus die twee runs
verschilden in méér dan de snap alleen. Twee dingen tegelijk veranderd en het
verschil aan één ervan toegeschreven.

In één proces gemeten, zelfde structuur, zelfde grid:

```
  continue fit (mét snap-parasieten)   0,018 Ω
  na de catalogus-snap                 0,510 Ω  @ 2619 Hz
```

De snap VERBETERT de last hier met een factor 28. De schuld ligt bij de
continue fit, niet bij de snap. De bewaker die ik erop bouwde (relatief, "de
snap mag niet teruggeven wat de fit won" — de vorm die de tuner al heeft) is
daarmee zinloos op dit pad en is teruggedraaid.

### Wat er wél vaststaat

1. **De continue tak-fit landt op 0,018 Ω.** Impedantie-blind, en met
   parasieten erbij kiest hij een bijna-kortsluitend bekken. Dit is B1, exact
   zoals oorspronkelijk gesteld — alleen nu met de tak en de frequentie erbij.
2. **`mergeSynthesizedSchematics` is onschuldig.** Beide bouwpaden
   (`topo.build` en `netlistFromSynthesis`) leveren byte-gelijke netlijsten,
   incl. knopen en parasieten. Die verdenking is weerlegd en hoeft niet
   opnieuw onderzocht te worden.
3. **De bestaande degeneratie-weigering kan dit niet vangen.** Zij oordeelt op
   de EINDwaarde (0,51 Ω ≈ 9 % van de kale driver) en haar drempel is 1 %. Het
   getal dat een versterker pijn doet is absoluut, niet relatief — maar een
   absolute drempel bestaat hier bewust niet zonder versterkerwaarde van de
   gebruiker.
4. **De invariant-test dekt alleen de TRANSFER.** `synthesis.test.ts` "the
   rebuilt schematic is electrically IDENTICAL" vergelijkt dB-verloop, niet
   ingangsimpedantie. Dat is hier goed afgelopen (punt 2), maar de test belooft
   minder dan zijn naam suggereert.

### Voor de volgende poging

De hefboom zit in de continue fit van de mid-tak, niet in de snap, niet in de
merge en niet in de structuurkeuze (LR4/LR4 is óók qua last een van de betere:
1,54 Ω zonder parasieten, tegen 0,02 voor BW3/LR4).

Wat NIET meer geprobeerd hoeft te worden, want gemeten en teruggedraaid:
een tie-break tussen de multi-start-startpunten (inert op de meetlat), een
harde klem op serie-waardes (verplaatst de schade), een relatieve snap-bewaker
(beschermt tegen iets wat de snap niet doet).

Wat nog niet gemeten is: waarom de fit MET parasieten in een 0,018 Ω-bekken
landt en zonder parasieten op 1,54 Ω. Dat verschil is de scherpste aanwijzing
die er nu ligt, en het is één meting: dezelfde tak, dezelfde structuur, alleen
de parasieten aan/uit, met de gekozen waardes ernaast.

### De 0,48 Ω ontleed tot op de bodem (24 aug 2026)

Vier verdachten, alle vier uitgesloten MET een meting:

| verdachte | test | uitkomst |
|---|---|---|
| notch-demping | R van 0,22 → 1 → 2 → 4 → 8 Ω | Zmin 0,510 → 0,582; dip blijft op 2619 Hz — **niet de oorzaak** |
| catalogus-snap | continue fit vs gesnapt, één proces | 0,018 → 0,510 Ω: de snap VERBETERT 28× — **niet de oorzaak** |
| merge naar schema | `topo.build` vs `netlistFromSynthesis` | byte-gelijke netlijsten incl. knopen en parasieten — **niet de oorzaak** |
| structuurkeuze | 16 alignment-paren doorgemeten | LR4/LR4 is de beste fit ÉN met 1,54 Ω een van de gezondste — **niet de oorzaak** |

**Wat het wel is.** De dip verschuift mee met ZOWEL de HP-seriecaps als de
LP-shuntcap:

```
C6 (LP-shunt)     ×0,5 → 0,624 @ 3292    ×1 → 0,510 @ 2619    ×2 → 0,465 @ 2206    ×4 → 0,431 @ 1968
C1+C3 (HP-serie)  ×0,5 → 0,462 @ 3109    ×1 → 0,510 @ 2619    ×2 → 0,585 @ 2381
```

Dat is de bandpass-ladder zelf: boven de LP-knie vormen seriespoel en shuntcap
een serie-resonant pad naar massa (hun reactanties heffen elkaar deels op), en
dat pad staat direct over de versterkerklemmen. Over een bereik van 16× in de
waardes blijft de last tussen 0,43 en 0,80 Ω — **er is geen naburige
instelling die hem gezond maakt.**

**Gevolg voor de aanpak.** De tak-synthese kan dit niet met beter fitten
oplossen; het is geen slecht gekozen waarde maar een eigenschap van de
topologie op deze bandbreedte (400 → 1993 Hz, 2,3 octaven). Wat de last wél
optilt is de GEZAMENLIJKE tune, die alle takken tegelijk ziet — gemeten:
0,72 → 3,47 Ω op kandidaat 455/2432. Dat is ook de enige plek waar de
parallelschakeling bestaat, en de last is een eigenschap van de
parallelschakeling.

**Openstaand, en dit is nu de scherpste vraag:** waarom lukt die redding bij
455/2432 wel en bij 400/2100 en 500/1900 niet? Niet de seed-hoogte (0,72 vs
0,48/0,49 is klein), niet de structuur (alle drie LR4/LR4-achtig). Het meest
waarschijnlijke verschil is de BANDBREEDTE van de middentak: 455→2432 is 2,4
octaven tegen 400→2100 (2,4) en 500→1900 (1,9). Dat is geen groot verschil,
dus dit moet gemeten worden en niet beredeneerd.
