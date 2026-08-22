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
