---
name: casus-toevoegen
description: Procedure voor het toevoegen van een validatiecasus aan het casusboek van Crossover Studio engine2 — een echt project met metingen of een synthetische grondwaarheid-casus. Gebruik bij elke taak die nieuwe meetsets als testfixture opneemt, golden references uitbreidt, of een synthetische casus genereert.
---

# Casus toevoegen aan het casusboek

## Twee soorten
- **Echte casus**: meetbestanden van een bestaand project. Valideert de regels tegen de werkelijkheid.
- **Synthetische casus**: meetset gegenereerd uit bekende modellen (T/S + kast + kolben-directiviteit + gekozen venstertijd). De extractoren moeten de bekende invoerparameters exact terugvinden — dit is de enige casussoort met absolute grondwaarheid.

## Stappen
1. **Fixtures**: meetbestanden onder `test-fixtures/casus<N>/`. Onaangepast — geen hersampling, geen headers "opschonen"; de opnamepas moet ze nemen zoals gebruikers ze aanleveren.
2. **Manifest + geometrie** in het golden-refs-bestand van de casus: tags per bestand, venstertijden, D per driver, z-offsets, c-t-c, symmetrievlaggen, en de netlist(s). Zonder dit blok is de casus onreproduceerbaar en wordt hij geweigerd.
3. **Golden references**: draai de volledige opnamepas + metriekbibliotheek, leg elke uitkomst vast mét tolerantie. Bij een synthetische casus: leg óók de grondwaarheid vast en assert extractor-uitkomst == grondwaarheid binnen tolerantie.
4. **Afwijkingen zijn bevindingen, geen ruis.** Wijkt een schatter af van verwachting of grondwaarheid: documenteer als V-nummer in het casusboek (nota Deel B) vóór je iets "fixt". Regelfout ≠ afleidingsfout — dat onderscheid eerst.
5. **Suite**: nieuwe casus draait mee in de golden-reference-, nieuwe-meting- en dekkingstests. Bestaande casussen moeten groen blijven — een casus die eerdere referenties breekt wijst op een schatterwijziging zonder versiebump.
6. **Nooit**: casusgetallen laten terugvloeien naar Deel A, defaults, of code (P6). Een casus valideert de specificatie; hij verandert haar alleen via een expliciete nota-wijziging.

## Klasse en afhankelijkheid (toegevoegd bij F4a, 27-08-2026)

De zes stappen hierboven zijn van 25-08 en staan onveranderd. Wat hieronder volgt is erbij
gekomen toen de referenties van casus 1 voor het eerst geclassificeerd werden (casusboek
**V19**), en het is een aanscherping van stap 3 — niet een vervanging ervan.

**Waarom het nodig was.** Engine v2 begrenst vandaag waarden; welke kandidaten er zijn beslist
de v1-zoektocht nog. Zodra v2 eigen kandidaten genereert levert dat legitiem andere netwerken
op, en elke referentie die een eigenschap van de ZOEKTOCHT vastlegt in plaats van natuurkunde
gaat dan rood — precies op het moment dat de acceptatie-autoriteit nodig is. V15 schreef die
les op voor een eigenschap van één meetsessie; dit is dezelfde fout een laag lager.

### R1 — elke referentie draagt een klasse en een afhankelijkheid

Verplicht, twee velden per referentieblok. De vraag is telkens: *waar is dit getal een functie
van?*

| klasse | afhankelijkheid | betekenis |
|---|---|---|
| `A` | `meting` | `(metingen) → waarde`. Volledig uit de meetbestanden afgeleid. Engine-onafhankelijk. |
| `B` | `meting+netlist` | `(metingen, gegeven netlist) → metriek`. Berekend op een VASTE netlist die als **bestand** in de fixtures staat. |
| `C` | `meting+zoektocht` | `(metingen, zoektocht) → uitkomst`. Wat een zoektocht vond: een kruispunt, componentwaarden, een runscore, een shortlist-samenstelling. |

Klasse en afhankelijkheid moeten bij elkaar passen; `goldenClassification.test.ts` faalt op een
`"klasse": "A"` met `"afhankelijkheid": "meting+zoektocht"`.

**Bepaal de klasse door de BRON te lezen, nooit door de naam.** Twee controles die het antwoord
afdwingen in plaats van beargumenteren: reproduceer de referentie op álle kandidaatnetlists van
de casus (identiek ⇒ A, verschillend ⇒ B), en `grep` de consumerende test op
`optimizeNetworkValues`, `crossover3Variants`, `handleV2Request`, `buildShortlist` (draait er een
zoektocht waarvan de uitkomst geassert wordt ⇒ C).

### R2 — klasse C staat alleen onder een baseline-blok

Onder `"v1_baseline"` (of een toekomstig `"v2_baseline"`), nooit ergens anders, met de
**commit-hash** van de enginetoestand waarop de waarden berusten. **Geen enkele test mag een
baseline-waarde als acceptatiecriterium lezen** — er staat een bronscan op.

Niet weggooien: de waarde blijft de gedocumenteerde uitkomst van die engine op die casus, en de
volgende engine moet zijn eigen uitkomst ernaast kunnen leggen.

**Beter dan een baseline-blok: leg kandidaten vast als netlist-BESTAND.** Casus 1 heeft geen
enkele klasse-C-referentie, en dat komt door precies dat besluit — de drie kandidaten staan als
`.adsfilter.json` in de fixtures. Daardoor is elke kandidaatmetriek klasse B in plaats van C.
Doe dat opnieuw waar het kan.

### R3 — band, middeling, raster (de V15-procesregel)

Een referentie die een **band**, een **middeling/gladding** of een **raster** gebruikt, legt die
parameters expliciet vast in het referentiebestand. Zonder die parameters is de waarde niet
reproduceerbaar, en een niet-reproduceerbare waarde is geen referentie maar een herinnering.

Bij het opschrijven: over welke band, waar komt die vandaan? Welke middeling — energie of
rekenkundig, mediaan of gemiddelde, over welke vensterbreedte? Welk raster — hoeveel punten, log
of lineair, en waar komen de uiteinden vandaan? En: staat er een parameter die alleen in **code**
bestaat (een constante in een fixture, een default in `constants.ts`)? Dan hoort hij in het
bestand.

**Wat NIET onder deze regel valt:** detectiedrempels en schattergedrag. Die worden gedekt door de
schatter-versionering — stap 3 van `engine2-metriek` en de versiebump daar. Zonder die scheiding
ontaardt "elke referentie krijgt parameters" in het overschrijven van de engine in JSON.

### R4 — tolerantieklassen horen bij de referentie

Elke tolerantie staat in het referentiebestand, met haar motivering. Een test die zijn eigen
tolerantie meedraagt kan er ongemerkt eentje oprekken. Nieuwe klasse nodig? Leid hem af uit de
bestaande, motiveer dat, en noteer de werkelijk gehaalde marge erbij.

Tolerantieklassen dragen zélf geen klasse en geen afhankelijkheid: een tolerantie is nergens een
functie van, zij is een besluit met een motivering.

### R5 — een afwijking is een entry, geen correctie

Dit is stap 4 hierboven, en het staat hier alleen om de vorm te noemen die V15 heeft opgeleverd.
Blijkt de referentie fout, dan wordt de ingetrokken waarde bewaard **mét de parameters waarmee
zij berekend is**, en de reproductie daarvan wordt een staande test — dat is het bewijs dat het
parameterverschil de volledige verklaring is en er geen tweede oorzaak onder zit. Zie
`_Re_sessie_25_08`, `_V_tweeter_op_fs_dB_sessie_25_08` en `_maxL_sessie_25_08` voor de vorm.

### Bij oplevering

- [ ] Elke referentie draagt `klasse` en `afhankelijkheid`, en de twee passen bij elkaar.
- [ ] De klasse is bepaald door de bron te lezen, en gecontroleerd met de reproductie op alle
      kandidaatnetlists.
- [ ] Klasse C staat uitsluitend onder een baseline-blok, met commit-hash.
- [ ] Geen test leest een baseline-waarde als acceptatiewaarde.
- [ ] Elke referentie die een band, middeling of raster gebruikt, draagt die parameters.
- [ ] `npx tsc -b` schoon; `npx vitest run` groen, inclusief `goldenClassification`,
      `toggleRegression`, `noWeights` en `p6Lint`.
