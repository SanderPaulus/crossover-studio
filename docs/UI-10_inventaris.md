# UI-10 — inventaris van wat een gebruiker te zien krijgt (22-11-2026)

**Aanleiding.** Sander, na de test van een vriend: "misschien moeten we weer eens goed gaan kijken naar
de UI en vooral hoe de gegevens worden weergegeven zoals input fields en teksten. Het is
onoverzichtelijk. … dit moet echt gebruikersvriendelijk zijn en duidelijk, anders maken mensen er geen
gebruik van."

**Wat dit document is.** Een TELLING, geen oordeel: per scherm wat er in de DOM zichtbaar staat —
invoervelden, keuzelijsten, knoppen, woorden, waarvan hulptekst, lange alinea's, uitklappers, en de
hoogte van de pagina. Gemeten op de dev-server (22-11-2026, driewegdemo geladen, voorbeeldsessie in de
merge-tool), met één script dat alleen ZICHTBARE elementen telt (een dichte `<details>` telt niet mee).
De regels in §4 zijn een VOORSTEL; er is niets gewijzigd.

Definities: *invoer* = tekst-/getalvelden; *hulp* = tekst in `.derived`, `.nl-warning` en de
"proposed"/"stated"-markeringen; *lang* = alinea's boven 40 woorden (de UI-grens die dit project elders
al hanteert voor "dit is een handleiding, geen label"); *h* = paginahoogte in px bij 838 px breed.

## 1. Design — guided (één kolom; de analysekolom is verborgen tot "Your build")

| stap | invoer | keuze | knoppen | woorden | hulp | lang (max) | uitklap | h |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: |
| G1 Your project | 0 | 0 | 8 | 283 | 52 (18 %) | 0 (31) | 0 + 2 dicht | 1169 |
| G2 Your cabinet | 4 | 0 | 2 | 482 | 25 (5 %) | **4 (90)** | 0 + 4 dicht | 1303 |
| G3 Your drivers | **22** | 0 | 1 | 339 | 136 (**40 %**) | 0 (9) | 3 open + 4 dicht | 1990 |
| G4 What it must meet, Q1 | 0 | 0 | 13 | 110 | 0 | 1 (57) | — | 430 |
| G5 Design it | 0 | 0 | 6 | 149 | 0 | 0 (29) | — | 577 |
| G6 Your build | 0 | 0 | 1 | 112 | 0 | 0 (40) | — | 373 |

De negen eisenvragen van G4 apart:

| vraag | knoppen | woorden | h |
| --- | ---: | ---: | ---: |
| What are you building? | 13 | 110 | 430 |
| Which amplifier will drive it? | 15 | 262 | 669 |
| How hard will it be played? | 15 | 276 | 647 |
| What do you want to build? | 15 | 269 | 641 |
| May the woofer be padded down with resistance? | 14 | 230 | 503 |
| **How steep should the filters be?** | **21** | **532** | **1279** |
| What is the lowest crossover the tweeter's datasheet allows? | 11 (+1 veld, 1 keuze) | 164 | 478 |
| How should it sound? | 15 | 176 | 569 |
| Which components? | 15 | 144 | 478 |

Lezing: guided is gemiddeld het rustigste deel van de app (100–280 woorden per scherm), met twee
uitschieters — de orde-vraag (532 woorden, 21 knoppen: twee rijen × vier knoppen plus de
topologiekaarten, elke rij met twee regels uitleg) en "Your drivers" (22 velden, en 40 % van de tekst is
hulptekst die per kaart herhaald wordt: drie kaarten, drie keer dezelfde zinnen). Elke profielvraag
draagt dezelfde alinea van 57 woorden ("What the design must meet — …") bovenaan, op alle negen
schermen.

## 2. Design — expert (twee kolommen: het ontwerppaneel links, de analysekolom rechts)

| tab | invoer | keuze | vink | knoppen | woorden | hulp | lang (max) | uitklap | h |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: |
| Project | 0 | 0 | 0 | 12 | 268 | 42 (16 %) | 0 (31) | 0 + 1 | 1107 |
| Setup | 13 | 2 | 1 | 8 | 585 | 29 (5 %) | **4 (90)** | 0 + 1 | 1816 |
| Drivers | **28** | 3 | 0 | 5 | 382 | 126 (33 %) | 0 (9) | 3 + 3 | 2144 |
| Filters, ⚙ dicht | 27 | 19 | 13 | 20 | 449 | 125 (28 %) | 1 (76) | 0 | 1782 |
| **Filters, ⚙ open** | **53** | **28** | **19** | 22 | **2241** | **977 (44 %)** | 1 (76) | 0 + 8 | **6329** |
| Network | 0 | 3 | 2 | 18 | 186 | 0 | 0 (40) | 0 | 718 |

**De analysekolom (rechts), op élke expert-tab hetzelfde:** 2667 woorden, 5154 px hoog, 7 alinea's
boven 40 woorden (langste 83), 4 dichte uitklappers. Daarvan is **2351 woorden het Engine-v2-paneel**,
dat standaard OPEN staat en uit deze secties bestaat:

| sectie van het Engine-v2-paneel | woorden |
| --- | ---: |
| Pre-design — feasible crossover windows | **768** |
| Pre-design — the two measurement floors, side by side | 292 |
| Derived parameters per driver | 194 |
| Capability matrix | 191 |
| Hard gates | 188 |
| Pre-design — anchored sensitivity gaps | 172 |
| Pre-design — level work on the lowest way | 172 |
| Metrics | 105 |
| Search-space bounds | 52 |
| System — window interaction | 50 |

Lezing: de expert-weergave zet een ontwerppaneel van 400–600 woorden naast een analysekolom van 2667
woorden, en die analysekolom staat er óók als er nog geen ontwerp is (Project-tab, demo net geladen).
Het ⚙ Settings-paneel is het zwaarste scherm van de app: 53 velden, 28 keuzelijsten, 19 vinkjes,
2241 woorden waarvan 977 hulptekst, 6329 px hoog. Daarin: 48 badges ("zoekt / oordeelt / toont ·
datasheet / meting / jouw keuze"), 25 leeg-betekenissen, 9 labels boven 25 woorden, en 1 "stated
by you"-markering (op de demo is bijna niets gesteld, dus bijna elk veld toont zijn leeg-betekenis
plus zijn app-default-regel).

De vier lange alinea's op Setup zijn alle vier METINGEN die als proza staan (de referentiepunt-uitleg
68 woorden, de Δ-splitsing 90, de montagediepte 46, het VituixCAD-equivalent 74): getallen in zinnen
in plaats van in een tabel.

## 3. NF/FF merge (één kolom) en Compare

| scherm | invoer | keuze | vink | knoppen | woorden | hulp | lang (max) | h |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| M0 lege pagina | 0 | 0 | 0 | 4 | 433 | 189 (44 %) | 1 (44) | 1199 |
| M1 Files | 8 | 15 | 0 | 11 | 406 | 187 (46 %) | 1 (44) | 1519 |
| **M2 Set-up** | 14 | 3 | 3 | 13 | **690** | **393 (57 %)** | **4 (63)** | **2719** |
| M3 Window | 0 | 0 | 1 | 20 | 468 | 201 (43 %) | 1 (44) | 2003 |
| **M4 Merge per driver** | 2 | 1 | 1 | **47** | **1233** | 211 (17 %) | 1 (44) | **4716** |
| M5 Export | 0 | 2 | 0 | 30 | 633 | 129 (20 %) | 1 (44) | 2852 |
| Compare (links) | 0 | 0 | 0 | 0 | 106 | 0 | 0 (39) | 548 |
| Compare (rechts) | 0 | 0 | 0 | 17 | 2605 | 0 | 6 (83) | 4904 |

Lezing: in de merge-tool is tussen 43 % en 57 % van alle tekst hulptekst, en op élk scherm staat de
sessielijst met zijn twee dropzones en de kalibratielijst erboven (±190 woorden die op M1–M5 niets
doen). Stap 2 is het zwaarste formulier van de tool (690 woorden, 14 velden, 57 % hulp); stap 4 is het
zwaarste scherm (1233 woorden, 47 knoppen, 4716 px) — de overzichtskaarten per driver, het
"Before / after"-blok, vier grafieken met legenda's, de echolijst en de goedkeuringsbalk, alles open.
Compare rechts is opnieuw de analysekolom met het Engine-v2-paneel.

## 4. Wat de telling zegt (de bevindingen, in volgorde van gewicht)

1. **Het Engine-v2-paneel staat altijd open en is de helft van alle woorden op elk expert-scherm.**
   2351 woorden, op élke tab, ook zonder ontwerp. Guided verbergt het (G-1) en is daardoor rustig;
   expert niet. Het is bovendien geschreven in de taal van de nota (A4, A5d.3, P4, M-C) en niet in die
   van een luidsprekerbouwer.
2. **Uitleg staat als alinea náást het veld, en herhaalt zich.** Drivers: drie kaarten met dezelfde
   zinnen (40 % van de tekst); ⚙ Settings: 977 woorden hulp bij 53 velden; merge stap 2: 57 %. Een
   gebruiker die het de tweede keer ziet leest het niet meer, maar moet er wel overheen scrollen.
3. **Getallen staan in zinnen.** De vier lange alinea's op Setup, de lobing-/vensterregels in het
   v2-paneel (768 woorden voor één onderwerp), de "Checks"-lijst van de merge: metingen die als tabel
   met drie kolommen (grootheid, waarde, eenheid) in een kwart van de ruimte zouden passen.
4. **Markeringen hebben vier vormen door elkaar:** "proposed" (grijze pil), "stated by you on …"
   (groen), "app default — not stated by you (…)" (oranje cursief), en de I-1/U-9-badges
   ("zoekt / oordeelt / toont · meting / datasheet / jouw keuze"), op ⚙ Settings 48 stuks. Elke vorm
   heeft een reden, maar samen op één scherm lezen ze als ruis.
5. **Verplicht en optioneel is zelden zichtbaar vóór je invult.** UI-9 maakte het voor de merge-tool
   (checklist, "Optional"-kop); in Setup, Drivers en ⚙ Settings staat het nergens — pas een lege
   waarde zegt in een zin wat het kost.
6. **Het veld zelf is klein, de tekst eromheen groot.** De invoervelden zijn 5 em breed met een
   `—`-placeholder; de uitleg ernaast is 20–90 woorden. Het oog landt op de tekst, niet op het veld.
7. **Herhaalde kop- en zijblokken.** De merge-tool toont op elke stap de sessie- en kalibratielijst
   met twee dropzones (±190 woorden); Compare toont rechts dezelfde analysekolom als Design.
8. **Eén goed voorbeeld bestaat al:** de guided-profielvragen — één vraag, drie kaarten met één regel
   "dit stelt: …", "waarom deze getallen" achter een uitklap, en wat leeg betekent op de knop. Dat is
   de vorm die de rest kan krijgen.

## 5. Voorstel: de weergaveregels (nog niet toegepast)

1. **Eén veld, één regel:** label · waarde · eenheid · status, op één rij; de status is één van
   "verplicht / optioneel / voorstel / gesteld op …", als één klein woord met één kleur, en niet als
   zin.
2. **Een voorstel staat IN het veld**, grijs, en wordt zwart zodra het gesteld is. Geen "proposed:
   131 Hz" ernaast.
3. **Uitleg zit achter één ⓘ per veld**, met de leeg-betekenis als eerste zin; standaard dicht. Eén
   alinea per GROEP mag open staan, hoogstens twee regels.
4. **Getallen in tabellen, nooit in zinnen:** elke lijst van metingen (Setup-Δ, Checks, venster-
   uitlezing) wordt een drie-kolomstabel; een zin erboven zegt wat de tabel laat zien.
5. **Het Engine-v2-paneel staat in expert DICHT**, met de samenvatting van G-1 (gestelde poorten,
   kerngetallen, waar niet geoordeeld wordt) als wat je ziet, en "All details" als de uitklap —
   dezelfde vorm als guided. Secties daarbinnen met hun eigen kop, standaard dicht.
6. **Verplicht eerst, optioneel onder een kop**, op elk formulier (de UI-9-vorm van merge stap 2,
   toegepast op Setup, Drivers en ⚙ Settings).
7. **Herhaling weg:** de driverkaarten delen hun uitleg (één keer boven de drie kaarten); de
   sessie- en kalibratielijst van de merge-tool klapt in zodra een sessie open is; de analysekolom
   van Compare toont alleen wat Compare nodig heeft.
8. **Eén woordenschat voor de gebruiker, één voor de nota:** de schermteksten noemen geen A4/A5d/P4
   meer; de referentie staat in de tooltip van de kop. De technische taal blijft volledig in het
   rapport en in CLAUDE.md.
9. **Vaste maten:** velden 6 em, getallen rechts uitgelijnd, eenheden in een vaste kolom; knoppenrijen
   hoogstens vier knoppen breed.

## 6. Voorgestelde volgorde van werk (elke stap een eigen sessie, met eigen meting vóór/ná)

1. **⚙ Settings + de analysekolom** (het zwaarst: 6329 px en 2667 woorden): het v2-paneel dicht met de
   G-1-samenvatting; de instellingen per groep met regel 1–3 en 6.
2. **Setup en Drivers:** de metingen van Setup als tabel; de drie driverkaarten met gedeelde uitleg en
   regel 1–3.
3. **Merge stap 2 en stap 4:** regel 1–4 en 7 (zijblokken in; stap 4 begint met de drie kaarten en
   de goedkeuring, de grafieken erachter).
4. **Guided orde-vraag en "Your drivers":** de twee uitschieters van guided.
5. **Pas daarna Network, Export, Compare.**

Elke stap wordt met dit telscript vóór en ná gemeten, zodat "overzichtelijker" een getal is: minder
woorden op het scherm bij dezelfde velden, minder dan 20 % hulptekst zichtbaar, geen alinea boven
40 woorden buiten een uitklap, en geen scherm boven 2500 px zonder uitklap.

## 7. Methode (reproduceerbaar)

Het telscript staat in `docs/UI-10_census.js` (plakken in de console van de pagina; geeft één rij JSON) en telt in `aside.design-pane`, `main` en
`section.nf-merge-tool`: zichtbare `input`/`select`/`checkbox|radio`/`button`, woorden van
`innerText`, woorden in `.derived`/`.nl-warning`/`.nfm-proposed`/`.v2-stated`, alinea's en hun
lengte, `<details>` open/dicht, `scrollHeight`. Navigatie door de app via de zichtbare knoppen
("Your project" … "Your build", de expert-tabs, "next →" in de merge-tool, "Compare"). Een dichte
uitklap telt niet mee: wat de gebruiker niet ziet, weegt niet.
