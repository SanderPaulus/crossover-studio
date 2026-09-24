# Vuistregels uit de literatuur, en wat onze engine ermee doet

**Opgesteld 20-09-2026 (H-4), naar aanleiding van de polariteitsarmen.
Bijgewerkt 20-09-2026 (H-4b): elke regel draagt sindsdien een
TOEPASSINGSSTATUS, de polariteitsregels zijn van status verschoven en twee
beweringen over `stated-min` zijn rechtgezet. Bijgewerkt 21-09-2026 (M-5): de
ondergrens-regels en de praktijkregel hebben er een MEETING bij — 48 ketenruns
over twee uitlijningen, drie posities en alle vier de polariteitsconfiguraties.
Bijgewerkt 24-09-2026 (H-5): de textbookregel is DETERMINISTISCH geworden en de
spiegelarm staat achter een gestelde run-keuze; er is een vijfde status
(OVERBODIG-DOOR-METING) en een zesde (VOORSTEL) bijgekomen, en vier vuistregels
die tot nu toe niet in dit document stonden — de beschermingscondensator, de
Zobel, de baffle-step-compensatie en de L-pad-formules — hebben hun antwoord
gekregen.**

## Wat dit document is — en vooral: wat het niet is

Dit is **referentiemateriaal**, geen autoriteit. De nota
(`docs/CrossoverStudio_OptimizerV2_strategie_v2.md`, Deel A) blijft de specificatie en bij twijfel
wint zij; het casusboek (`CLAUDE.md`) blijft de plaats waar metingen en besluiten staan. Wat hier
staat is: *dit zegt de literatuur, dit doet onze code vandaag, en hier lopen ze uit elkaar.*

Een verschil is hier **nooit vanzelf een defect**. Meer dan eens is een "afwijking van de vuistregel"
bij nameten juist de vuistregel gebleken die te grof was voor wat wij meten — V20 trok de
lobing-score in omdat geen enkele λ een weg met twee bronnen samenvat, en V44 verving het
±1-octaaffaservenster omdat het 911 punten meetelde die onder de meetgeldigheid van de bestanden
zelf lagen. Waar wij afwijken staat de reden erbij, en waar de reden ontbreekt staat dát erbij.

### De bronkwaliteit, vooraf en eerlijk

Het meeste dat online over kruisfilters te vinden is, zijn fora en rekenmachine-sites die elkaar
citeren. De stevigste bronnen hieronder zijn Rane Note 160 (Dennis Bohn) en Note 119, Kimmo
Saunisto's VituixCAD-handleiding, Troels Gravesen's eigen ontwerppagina's en Rod Elliott
(sound-au.com). **Dickasons regel kwam via forumcitaten en niet uit de Loudspeaker Design Cookbook
zelf** — dat boek is niet gelezen, en dat staat er liever dan dat het gesuggereerd wordt. Waar een
regel alleen uit forumconsensus komt, staat dat erbij.

De links staan onderaan.

---

## De toepassingsstatus — wat de vier woorden betekenen

Sinds H-4b draagt elke regel er een. Het verschil tussen de vier is niet hoe
belangrijk een regel is maar **wie hem toepast en wanneer**, en dat is precies
wat een lezer van dit document wil weten voordat hij ergens op vertrouwt.

| status | betekenis | wat je eraan hebt |
| --- | --- | --- |
| **TOEGEPAST** | De engine past hem automatisch toe, op elke run, zonder dat iemand iets stelt. Het huis in de code staat erbij. | Je hoeft niets te doen; wil je hem niet, dan moet je hem overschrijven. |
| **KANDIDAAT** | De regel bepaalt niets; hij maakt een ONTWERP dat naast de andere in de tabel komt, volledig uitontworpen en door dezelfde poorten geoordeeld. | De tabel beslist, niet de regel. |
| **GERAPPORTEERD** | Gemeten en afgedrukt, oordeelt niets, weigert niets, stuurt geen zoektocht. De V20-klasse. | Een kolom om naar te kijken; wie er een grens op wil, stelt er een. |
| **GESTELD** | Een projectbesluit met datum en motivering in `gestelde_eisen`, geen industrienorm. | Het getal is van Sander en een gesprek erover gaat over dat besluit. |
| **OVERBODIG-DOOR-METING** | De regel is een REKENVOORSCHRIFT dat een grootheid schat die wij MÉTEN. Hij wordt niet toegepast omdat de meting het antwoord al bevat — niet omdat hij fout is. | Niets te doen, en de reden staat erbij zodat "gemist" beantwoord is in plaats van open. |
| **VOORSTEL** | De grootheid wordt al gemeten en gerapporteerd; wat ontbreekt is een GETAL. Opgeschreven met de casusboekcijfers erbij, wachtend op Sander. | Eén gesteld getal maakt er een gewapende eis van; tot dan oordeelt hij niets (P4). |

Een regel kan er twee dragen: de textbook-polariteit is TOEGEPAST waar de
engine kiest én sinds H-4b op de handpaden, en tegelijk KANDIDAAT omdat de
andere arm ernaast gebouwd KAN worden — sinds H-5 alleen als de ontwerper daar
om vraagt.

**OVERBODIG-DOOR-METING is niet hetzelfde als "wij doen dat niet".** Het verschil
is de moeite waard: een Zobel-formule berekent uit T/S-parameters wat de
impedantie van een driver bóven zijn resonantie doet, en wij hebben die
impedantie gemeten, per driver, over de hele band. De formule is een SCHATTER van
onze invoer. Hem toepassen zou een gemeten kromme door een tweeparameter-model
vervangen, en dat is precies de richting waarin dit project nooit werkt (A3h).
Wat de regel BEDOELT — dat een stijgende Le de kruising verschuift — gebeurt
onverminderd; het gebeurt alleen in de oplossing van het echte netwerk in de
echte impedantie, en niet in een vooraf berekende correctie.

---

## 1. Polariteit

### Wat de literatuur zegt

**De textbookregel.** Bij Linkwitz-Riley vragen LR2 en LR6 één omkering en LR4 en LR8 niet
(Rane Note 160). De reden is elementair: bij LR2 staan de twee helften op het kruispunt 180° uit
fase, bij LR4 360° — dus in fase. Oneven ordes staan 90° (1e) of 270° (3e) en krijgen conventioneel
geen omkering, omdat een omkering daar niets oplost.

**De praktijkregel, en die is belangrijker.** De gedeelde raad van de ontwerpers is: **simuleer en
meet BEIDE polariteiten en vergelijk**. De motivering die telkens terugkeert is dat de akoestische
centra van de drivers niet samenvallen, zodat de meetkundige vertraging bij de elektrische fase
optelt en het textbookantwoord niet meer hoeft te kloppen. Troels Gravesen levert ontwerpen waarin
de mid *moet* worden omgekeerd — bij hem is dat een instructie aan de bouwer, geen variant.

**De omkeer-nultest.** Een even-orde filter met goede fasetracking geeft een **diepe null** als je
één driver omkeert. Dat is de standaardcontrole: hoe dieper de null, hoe beter de twee takken in
fase liepen. Zonder de nodige omkering ziet men een dip van de orde van 30 dB op het kruispunt;
mét, blijft de afwijking binnen enkele dB.

### Wat onze engine doet

| Onderdeel | Waar | Status | Gedrag |
| --- | --- | --- | --- |
| De textbookregel | `activeSide.ts` → `textbookComplementInverted` | **TOEGEPAST** | Alleen LR, `(orde/2) % 2 === 1`. Dus LR2 ja, LR4 nee, LR1/LR3 nee, BW/BS nooit. **Eén huis, ZES lezers sinds H-5**: het complement van de magere hybride-vorm (`complementSettings`, H-2b), het DSP-doelblok (`dspTarget.ts`, H-1), de polariteitsarmen (H-4), op de HANDPADEN het bandformulier en de oordeelstrip (`handoverPolarity.ts`, H-4b), en sinds H-5 het DSP-doelblok van de GEMETEN hybride vorm, dat de textbooklezing naast de gefitte afdrukt. |
| De textbookregel op de HANDPADEN | `handoverPolarity.ts` (H-4b) | **TOEGEPAST** (volgend, overschrijfbaar) | Een nieuwe even-orde-LR-keuze in het bandformulier zet de relatieve polariteit van díé overname op textbook; de andere overname blijft staan waar zij stond. Een stand die ervan afwijkt wordt náást het vinkje benoemd en nooit gecorrigeerd — Gravesen levert ontwerpen die ervan afwijken. Vóór H-4b was de regel op dit pad **afwezig**: het vinkje bleef staan waar het vorige project het liet. |
| De textbookregel op het VELD | `predesign/polarityArms.ts` (H-5) | **TOEGEPAST** | Sinds H-5 stelt het veld de polariteit van **élke kandidaat** uit datzelfde huis en is de ontwerpstap eraan gebonden. Daarvóór koos de ontwerpstap zelf, in een enumeratie op ideale filters. Zie de H-5-sectie hieronder. |
| De praktijkregel | `predesign/polarityArms.ts` (H-4) | **KANDIDAAT** (op verzoek sinds H-5) | Sinds H-4 kan de niet-gekozen polariteit van élke passieve overname **een eigen kandidaat** zijn: zelfde positie, eigen topologieklasse, volledig uitontworpen, gesynthetiseerd en getuned tegen zijn eigen gekantelde fasedoelen, en door dezelfde poorten geoordeeld. Sinds H-5 gebeurt dat alleen onder de gestelde run-keuze **"Polarity arms: both"**; de standaard bouwt hem niet. |
| De praktijkregel in de VERKENNING | `predesign/fieldMode.ts` (H-4b) | **KANDIDAAT** (gegarandeerd, onder `both`) | Onder `both` draait een verkenning per positie ONVOORWAARDELIJK twee van de vier configuraties: de textbook-arm en de **enkelvoudige driveromkering** (de mid van een drieweg, de tweeter van een tweeweg). De 15°-marge is nog de poort op de overige twee en wordt overal waar hij poort is als lezing afgedrukt. Onder de standaard geldt geen van beide: er wordt niets gespiegeld, en de marge wordt nog wél GELEZEN en afgedrukt zodat de ontwerper ziet wanneer `both` de moeite waard is. |
| De nultest, ACTIEVE ZIJDE | `activeSide.ts` (H-1) | **TOEGEPAST** | De polariteit van de **actieve zijde** in Hybrid mode wordt gekozen op de omgekeerde-polariteit-nulmarge, en het DSP-doelblok drukt beide af zodat de kastmeting hem kan bevestigen. |
| De nultest, GETEKEND NETWERK | `handoverPolarity.ts` → `reversedNullSignature` (H-4b) | **GERAPPORTEERD** | De twee null-check-krommen die de grafiek al tekende, als GETAL: het bandgemiddelde van (som − omgepoolde som) over de overnameband, tegen een marge afgeleid uit de fase-eenheid. Onder de marge zwijgt hij. **Een melding, nooit een stille omkering van een netwerk dat iemand getekend heeft** (UI-2). |

**Wat H-4 verving.** Tot H-4 koos de ontwerpstap de polariteit zelf, in een enumeratie op **ideale
filters** — geen ladder, geen driverimpedantie, geen synthese, geen componenttune — en wat verloor
werd nooit gebouwd, nooit door een poort geoordeeld en stond in geen enkele shortlist. Gemeten vóór
de reparatie: op 5 van de 26 kandidaten van dit casusboek week die keuze al van textbook af, dus de
heuristiek was geen dode tak; en op de tweewegstap viel de keuze op de KALE afdaling, vóór EQ, snoei
en polish, terwijl de cluster erboven op een ándere maat rangschikt.

**Wat het bouwen opleverde** (acht ketenruns, `test-fixtures/casus1_h4_polariteit.json`):

- casus 1b op 1947,9 Hz — **alleen de gespiegelde arm levert**; de textbook-arm valt op M-C.
- casus 1b op 2186,5 Hz — **alleen de textbook-arm levert**; de gespiegelde valt op M-C op zijn
  eigen kruispunten. Twee kandidaten van één casus, 240 Hz uit elkaar, tegengesteld.
- casus 1h — beide leveren en delen de winst: rms 3,148 tegen 3,567 dB, M-K 4,2° tegen 3,6°.
- casus 1 — geen gespiegelde arm levert; alle zes vallen op M-D (1,81–10,04 dB opslingering tegen
  een budget van 1,4) of op de versterkervloer.

**WAT M-5 ERAAN TOEVOEGDE (21-09-2026), en het is de textbookregel van de andere kant bevestigd.**
48 ketenruns op casus 1: drie gestelde posities × twee uitlijningen × alle vier de
polariteitsconfiguraties × twee meetsets. **Geen enkele LR2-TEXTBOOKarm leverde** — zes van zes
geweigerd, vier op het LF-opslingeringsbudget en twee op de versterkervloer. Élke LR2-levering is
dus een SPIEGELarm: een ontwerp zonder de omkering die Rane Note 160 voor LR2 voorschrijft. En het
betaalt precies waar die omkering voor bedoeld is — **fasetracking van 30 tot 95° op het
woofer→mid-paar, tegen 10,3–13,1° voor de LR4/textbook-tegenhangers**. Bijna-tegenfase op het
kruispunt, gemeten op een echt paar in plaats van op ideale filters. Wat die armen er wél voor
terugkrijgen staat in de rekening: 23–25 onderdelen tegen 36–39, 15–33 % dissipatie tegen 51–53 %,
en een BOM van € 112–150 tegen € 264–513.

Dat laatste is het opmerken waard: op de drieweg sneuvelt de omgepoolde mid **niet op fase** maar op
een LF-budget. De fase-afweging wordt wél gehoord — de arm wordt volledig uitontworpen en op fase
beoordeeld — maar wat hem doodt is de reactantie die de tune in het wooferpad nodig heeft.

### De omkeer-nultest nagemeten, en zij bevestigt de literatuur op onze eigen data

H-4b leest de twee null-check-krommen die de grafiek al tekende als één getal: het bandgemiddelde van
(som − omgepoolde som) over de overnameband, tegen **2,30 dB** — wat één eenheid faseafwijking (15°)
voorbij de 90°-gelijkstand op een nulmarge waard is, afgeleid uit `PHASE_ERROR_UNIT_DEG` door de
nulmarge-meetkunde die `activeSide.ts` al bezat. Twee metingen op casus 1's eigen responsen
(`handoverPolarity.test.ts`):

| paar | LR2 zoals getekend | LR2 met de omkering | LR4 zoals getekend |
| --- | ---: | ---: | ---: |
| **CO-GELOKALISEERD** (één gemeten weg draagt beide flanken) | **−17,8 dB** | +17,8 | **+12,1 dB** |
| **HET ECHTE PAAR** (casus 1b's mid en tweeter, ideale filters) | −1,86 | +1,86 | +1,50 |

De eerste rij is de vorm waarvoor de textbookregel geformuleerd is — twee bronnen op één punt, dus de
enige fase tussen hen is die van de filters — en daar is een ontbrekende LR2-omkering **geen dicht
geval**: zij leest bijna acht keer de marge, en LR4 zoals getekend zwijgt. De tweede rij is de
LUIDSPREKER, en zij is de literatuur in onze eigen cijfers: de akoestische centra van mid en tweeter
vallen niet samen, dus op 2251 Hz staan zij noch in fase noch in tegenfase, en **de hele textbook-vraag
is daar minder dan twee decibel waard**. Alle vier de lezingen blijven onder de marge en de strip zegt
niets — wat het juiste antwoord is, en precies waarom H-4 de gespiegelde arm BOUWT in plaats van hem op
dit getal weg te gooien.

De marge is niet verlaagd om die tweede rij te laten spreken. Een drempel die wordt gebogen tot de data
hem raakt, meet het buigen.

### Waar wij afweken, en wat H-4b ervan heeft gemaakt

**H-4: de verkenning kon de omgepoolde arm overslaan.** Op gestelde posities (U-5) en in het VOLLE
veld draaiden beide armen onvoorwaardelijk; in de **verkenning op afgeleide posities** zaaide de
engine de spiegel alleen waar de pre-design fasemarge binnen één eenheid faseafwijking (15°) lag.
Gemeten op de driewegdemo: verkenning = 6 runs, **0 gespiegeld** — de omgepoolde mid werd daar dus
nooit gesimuleerd. De literatuur kent zo'n poort niet; zij zegt onvoorwaardelijk "probeer beide".

**H-4b (Sander, 20-09-2026) heeft dat besluit genomen, en niet door de poort weg te halen.** De
enkelvoudige DRIVEROMKERING — één driver omgedraaid, de mid van een drieweg, de tweeter van een
tweeweg — draait sindsdien onvoorwaardelijk naast de textbook-arm. Dat is de beweging die de
literatuur telkens bij name noemt, en zij is als ÉÉN OMGEDRAAIDE DRIVER geformuleerd en niet als
een masker over overnames, want dat is wat zij fysiek is: de draden van één driver omwisselen keert
de relatieve polariteit van BEIDE overnames waaraan hij deelneemt. De 15°-marge blijft de poort op
de twee overige configuraties (`· high ⌀` en `· high ⌀ + mid ⌀`) en wordt overal waar hij poort is
als **gerapporteerde lezing** afgedrukt, per kruising en niet per as.

**DE PRIJS, GEMETEN** (`scripts/measure-h4b-arms.ts`, `test-fixtures/demo_h4b_armen.json`; geen
ketenrun en geen tune — het telt kandidaten):

| modus | armbeleid | kandidaten | gespiegeld |
| --- | --- | ---: | ---: |
| verkenning | geen fasereading (de pre-H-4-stand) | 6 | 0 |
| verkenning | H-4: alleen de marge | 6 | 0 |
| verkenning | **H-4b: garantie + marge** | **12** | **6** |
| vol veld | H-4 | 36 | 27 |
| vol veld | H-4b (de garantie beslist er niets) | 36 | 27 |

Een verkenning VERDUBBELT dus en verviervoudigt niet — de ×4 die H-4 als prijs van "de poort
weghalen" noteerde is niet betaald. Elke gespiegelde arm van die twaalf draagt het label
`· mid ⌀ · mirror`: precies de omgepoolde mid waar Sanders regel over gaat. Wandkloktijd is die
telling maal de prijs per run, en die is bij U-1 en U-3b in de browser gemeten op ~150 s voor de
kale driewegdemo — 900 → 1800 s. **Het volle veld beweegt niet**, want `'both'` draaide al alles.

Op de twee kruisingen van de demo leest de marge 20–36°, dus zij gaten alle vier de resterende
configuraties weg; zonder de garantie zou er inderdaad niets gespiegeld zijn.

### H-5 — de regel is deterministisch geworden, en wat dat kost

**Sander stelde op 24-09-2026:** de polariteit volgt de textbookregel — bij LR2 op woofer→mid wordt
de mid omgekeerd gesimuleerd én ontworpen, afhankelijke wegen kantelen mee zodat hogere paren
textbook blijven, er komen geen keuzeknoppen per weg, en het wordt overal duidelijk gemaakt. De
spiegelarm blijft bestaan achter één gestelde run-keuze.

**Wat dat verving.** De ontwerpstap koos de polariteit tot H-5 nog steeds zelf wanneer de kandidaat
er geen stelde, en H-4 had die keuze beschreven zonder haar weg te nemen. Sinds H-5 draagt élke
kandidaat van een v2-veld zijn polariteit EXPLICIET, en `designThreeWay` en `optimizeVirtualFilters`
zijn eraan gebonden. De interne tie-break bestaat nog, maar op de v2-route wordt hij niet meer
bereikt.

**De prijs, gemeten** (`scripts/measure-h4b-arms.ts`, `test-fixtures/demo_h4b_armen.json`; geen
ketenrun en geen tune — het telt kandidaten):

| modus | armbeleid | kandidaten | gespiegeld |
| --- | --- | ---: | ---: |
| verkenning | H-4b: garantie + marge (de stand vóór H-5) | 12 | 6 |
| verkenning | **H-5: textbook, de standaard** | **6** | **0** |
| vol veld | H-4/H-4b | 36 | 27 |
| vol veld | **H-5: textbook, de standaard** | **9** | **0** |

Een verkenning HALVEERT dus — precies terug naar de zes runs van vóór H-4b — en het volle veld gaat
van 36 naar 9. In wandkloktijd op de kale driewegdemo, bij de ~150 s per run die U-1 en U-3b in de
browser maten: 1800 → 900 s voor een verkenning, 5400 → 1350 s voor een vol veld.

**Waarom de spiegel niet is weggegooid, en dit is de reden dat het een KEUZE werd en geen schrapping.**
M-5 mat op casus 1b bij 1947,9 Hz dat **alléén de gespiegelde arm levert** — de textbook-arm valt op
M-C — en 240 Hz verderop, op 2186,5 Hz, precies andersom. Een standaard die de spiegel nooit bouwt
zou de eerste van die twee hebben gemist; een regel die hem altijd bouwt verdubbelt élke verkenning.
De keuze houdt die meting herhaalbaar zonder haar aan iedere run in rekening te brengen.

**Wat de deterministische regel NIET raakt, en dat is het hele casusboek.** Absent is de identiteit:
een veld dat geen armbeleid stelt draagt geen polariteit, en de ontwerpstap enumereert zoals altijd.
De casus-fixtures stellen er met opzet geen — hun corpora zijn dóór die enumeratie gemaakt, en op
casus 1b en casus 1h koos zij de GESPIEGELDE arm op élke kandidaat (H-4 mat het: drie van drie en
één van één). Zouden zij de H-5-standaard overnemen, dan zouden hun live byte-reproducties stoppen
met reproduceren. Dezelfde pin-vorm die M-3 voor de meetset koos, met dezelfde tegenproef: een guard
eist dat de pin aantoonbaar VERSCHILT van de standaard, zodat hij niet stil leeg kan lopen.

**Waar de regel zich nu uitspreekt** (Sanders "wel duidelijk maken"):

| plaats | wat er staat |
| --- | --- |
| het shortlist-label | `· textbook` op een all-LR4-veld, `· mid ⌀ + tweeter ⌀ · textbook for LR2` waar een uitlijning erom vraagt, `· mid ⌀ · mirror` voor de spiegel |
| de run-regel boven de tabel | welke armen deze run bouwde, naast welke veldmodus |
| de veldnotities | dat de polariteit textbook is, plus per kruising wat de spiegel waard zou zijn geweest |
| het DSP-doelblok | de MAGERE vorm zei het al; de GEMETEN vorm drukt sinds H-5 de textbooklezing naast de gefitte af, met "DEPARTS from textbook" waar zij uiteenlopen |
| naast de polariteitsknop | de standing van die overname, **beide kanten op** — tot H-5 werd alleen een AFWIJKING afgedrukt, dus na een geslaagde follow zweeg de regel precies op het moment dat zij zojuist een polariteit had verzet |
| bij de uitlijning-select | de regel zelf, permanent, en niet alleen zijn gevolg |
| de guided-zin | dat de polariteit niet gevraagd wordt omdat de textbook haar beantwoordt, en waar je dat verandert |

### Eén valkuil in het label — gesloten bij H-4b

Het label noemde **welke wegen omgepoold zijn** — wat een bouwer soldeert — en niet welke arm
textbook is. Op een **LR2**-veld is `· mid ⌀` juist de textbook-arm, en de rij zonder markering is
een spiegel: precies andersom dan op een LR4-veld.

| markering | LR2-veld | LR4-veld |
| --- | --- | --- |
| *(geen)* | spiegel (beide overnames omgedraaid) | **textbook** |
| `· mid ⌀` | **textbook** | spiegel (beide overnames omgedraaid) |
| `· high ⌀` | spiegel (M-T omgedraaid) | spiegel (M-T omgedraaid) |
| `· high ⌀ + mid ⌀` | spiegel (W-M omgedraaid) | spiegel (W-M omgedraaid) |

**Sinds H-4b draagt het label BEIDE HELFTEN** en staat er geen van de twee voor de andere in:
`… · mid ⌀ · mirror` en `… · textbook`. De markering blijft zeggen wat een bouwer soldeert, het
woord zegt welke arm het is, en de provenance-zin blijft de volledige bron. Het is een label en
geen vrije tekst boven de tabel — de U-6-indeling van het resultaatgebied is niet aangeraakt.

---

## 2. Waar een kruispunt mag liggen

### Wat de literatuur zegt

**De ondergrens tegen de resonantie.** De courante regel is **minstens 2× de f_s van de bovenste
driver, en 3–4× beter** (toegeschreven aan Dickason, via forumcitaten). De motivering die er
consequent bij staat is **excursie** en niet vermogen: een tweeter met f_s 1000 Hz en X_max 0,25 mm
overschrijdt zijn lineaire slag bij 1000 Hz vóór iets anders het begeeft, welke helling je ook
kiest.

**De conservatieve variant** is dezelfde regel in decibel: *"18 dB down at resonance"* — de
spanningskromme van het filter hoort op de resonantie 18 dB onder de doorlaatband te liggen.

**De bovengrens** is de conusbreakup (klassiek f_break/3 voor een scherpe piek, f_break/2 voor een
milde) en de bundeling van de onderste weg.

**Driverafstand.** Lobing begint boven ¼ λ; de praktijkregel is dat de hart-op-hart-afstand van twee
wegen die samen spelen **kleiner dan ongeveer ½ λ** blijft bij de hoogste frequentie waarop zij
allebei op niveau zijn. Losser geformuleerd komt men ook "minder dan één golflengte" tegen.

### Wat onze engine doet

| Regel | Waar | Status | Waarde |
| --- | --- | --- | --- |
| k·f_s-vloer | `constants.ts` → `XO_FS_FACTOR_BY_ORDER` | **TOEGEPAST** (terugval) | orde 1: 3,0 · orde 2: 2,0 · orde 3: 1,6 · **orde 4: 1,4** — bindt alleen waar niets strengers gesteld of afgeleid is |
| Aandrijfvloer (A5d.3(ii) omgekeerd) | `predesign/xoWindow.ts`, regel `'drive'` | **TOEGEPAST** | `f = f_s · 2^(|plafond| / (6 · orde))`, met het plafond uit M-C v2.0 — de **gemeten** excursiegrens van de driver |
| Gestelde vloer | regel `'drive-stated'` (A5e.3b) | **GESTELD** | Hetzelfde, op het door de ontwerper gestelde dB-getal. Casus 1 stelt −20 dB op de tweeter. **M-5 mat wat die ene eis met de UITLIJNING doet: bij orde 2 legt hij de vloer op 2934,5 Hz tegen een breakup-plafond van 2304 — het venster is LEEG, dus LR2 is op mid→tweeter niet uitdrukbaar.** Een orde-keuze die niemand als orde-keuze heeft gesteld |
| Aanbevolen minimum van het blad | regel `'stated-min'` (U-3g) | **GESTELD** | Verbatim als vloer, bij élke orde. **Casus 1 stelt er wél een: 2200 Hz op de tweeter, gevoed sinds M-2b** |
| Aanbevolen maximum van het blad | regel `'stated-max'` (U-4) | **GESTELD** | Verbatim als plafond. Casus 1 voert 30 kHz in en die bindt nergens — de tweeter is van geen enkel paar de onderste weg |
| Breakup-plafond | `BREAKUP_DIV_SEVERE` 3,0 / `BREAKUP_DIV_MILD` 2,0, geïnterpoleerd op severiteit | **TOEGEPAST**, ongekalibreerd | **ONGEKALIBREERD** en elke lezer moet dat markeren |
| Lobing | `metrics/lobing.ts` (`lobing-lambda/2.0`) | **GERAPPORTEERD** | **Vier** λ-fracties — dichtstbij / amplitudegewogen zwaartepunt / verst, alle drie tússen de wegen, plus de grootste scheiding bínnen een weg |

**De strengste vloer bindt**, en `floorBy` zegt welke.

**EEN GESTELDE ONDERGRENS KIEST DE ORDE MEE, EN M-5 HEEFT GEMETEN HOEVEEL (21-09-2026).** Een
dB-vloer is A5d.3(ii) omgekeerd, dus hij hangt aan `6 · orde`: hoe ondieper de flank, hoe hoger hij
komt te liggen. Op casus 1's mid→tweeter zet de gestelde −20 dB de vloer voor een LR2 op
`924,3 · 2^(20/12) = 2934,5 Hz`, terwijl het breakup-plafond van de mid op 2304 Hz ligt — **het
venster is leeg en LR2 is daar niet uitdrukbaar**. In decibel, op de gunstigste toegestane plek:
een LR2 levert er 15,81 dB tegen de 20 die de eis vraagt, **4,19 dB tekort overal in de band**;
een LR4 levert 31,62 dB. Dat is geen eigenschap van de meetset (nagemeten: m3 en koan677 geven
hetzelfde venster tot op de tiende hertz) en geen uitkomst van een zoektocht.

Wat er praktisch uit volgt en wat een lezer hier het meest aan heeft: **wie een dB-ondergrens stelt,
stelt daarmee een ONDERGRENS AAN DE ORDE** zodra het plafond van de onderste weg dichtbij ligt. De
twee grenzen staan in verschillende eenheden en in verschillende tabellen, en de engine zegt het pas
als het venster leeg is. Casusboek M-5 draagt de volle tabel.

### Waar wij afwijken — en dit is de scherpste van dit document

**Onze k·f_s-conventie is materieel losser dan de 18-dB-regel.** Uitgedrukt in de eenheid waarin de
aandrijfvloeren rekenen is `XO_FS_FACTOR_BY_ORDER` een vrijwel constante verzwakking van
**9,51 / 12,00 / 12,21 / 11,65 dB** bij orde 1 t/m 4 — `6 · orde · log₂(k)`, hier nagerekend en bij
U-3e al zo gemeten. De industrieregel zegt 18 dB. Het getal dat casus 1 zélf stelt is **−20 dB**,
oftewel 18 + 2 dB marge voor f_s-drift.

Met andere woorden: waar een project niets stelt, kiest de engine stilzwijgend de **lossere** van
twee gepubliceerde conventies. U-3e heeft dat gemeten en bewust laten staan, met twee redenen:
`XO_FS_FACTOR_BY_ORDER` is een Deel-A-regelfactor die voor élke overname geldt — ook conus-naar-conus,
waar de afgeleide excursiegrens de juiste autoriteit is — en k·f_s bindt alleen wanneer de afgeleide
vloer lager ligt, dus verhogen zou juist bijten waar de meting zegt dat de driver veilig is. De
uitweg die U-3e voorstelde en U-3g bouwde is `stated-min`: de aanbevolen minimale kruisfrequentie van
het datablad als vensterinvoer.

> **ERRATUM (H-4b, 20-09-2026).** Hier stond *"Casus 1 stelt er geen."* Dat beschrijft **U-4**, dat
> het BlieSMa-getal las en het bewust NIET voedde omdat voeden een regeneratie vraagt. **M-2b is die
> regeneratie**: Sander stelde de vloer op 12-09-2026, `casus1MinCrossovers()` leest hem uit
> `driverkaart.tweeter.aanbevolen_kruisband.ondergrens_hz` en voert hem in als
> `settings.driverMinCrossoverByDriver`, en het mid→tweeter-venster leest sindsdien **2200–2304 Hz met
> `vloer_bindend: aanbevolen_ondergrens`**. Wat het kostte staat in het casusboek: het venster ging van
> 0,484 naar 0,067 octaaf en van drie posities naar ÉÉN (2251,4 Hz). De claim is bij H-4b tegen de
> code en tegen het referentiebestand gepind (`statedMinCrossover.test.ts`), zodat zij niet opnieuw
> stil kan verouderen.

**EN DE TWEEDE HELFT VAN DIE VRAAG, want zij was de eigenlijke.** Gevraagd was of de U-3g-registerrij
naast die manifestingang een **tweede, ongevoede doorgang voor hetzelfde getal** is. Dat is zij niet:
de registerrij (`minCrossover`, Setup → driverkaart) is de deur van de APP naar exact dezelfde
engine-invoer `ReportSettings.driverMinCrossoverByDriver` die de fixture uit het manifest vult. Eén
mechanisme, twee ingangen — de vorm waarin élk casusboekgetal de engine bereikt.

**Wat er wél lag was een tweede KOPIE, en die is weggehaald.** `driverkaart.tweeter` droeg naast
`aanbevolen_kruisband.ondergrens_hz` ook een platte `aanbevolen_ondergrens_hz: 2200`, en **geen enkel
bronbestand in deze repository las hem** (nagegaan, niet aangenomen). Een projectgetal met twee huizen
is de vorm waartegen P6 bestaat, en het huis dat de engine voedt is het huis dat blijft. Een claim
pint sindsdien dat de platte sleutel weg is en de gepaarde er staat.

**Lobing wordt gerapporteerd en nooit geoordeeld.** V20 stelde vast dat voor een weg met meer dan
één bron geen enkele λ die weg samenvat, en trok de niet-monotone zonescore in. Er is dus geen
poort, geen budget en geen shortlist-criterium op een λ-fractie. De literatuurgetallen (¼ λ aanvang,
½ λ praktijk) staan hier genoteerd voor de dag dat iemand er wél een grens op wil.

---

## 3. Fase

### Wat de literatuur zegt

De courante richtlijn is een faseverschil **kleiner dan 90°** over het gebied waar beide takken
binnen **20 dB** van elkaar liggen, en strenger: **binnen 30°** rond het midden van het
overnamegebied. De fasetracking hoort zich minstens een octaaf boven en onder het kruispunt uit te
strekken.

### Wat onze engine doet

| Onderdeel | Waar | Status | Waarde |
| --- | --- | --- | --- |
| Het overlapvenster | `integration.ts` → `DEFAULT_OVERLAP_WINDOW_DB` | **TOEGEPAST** | **20 dB** — precies het getal uit de richtlijn |
| De fasemaat M-K | `phaseAdmission.ts` + `metrics/phaseIntegration.ts` (`phase-integration/2.0`) | **GERAPPORTEERD** | Gemiddelde \|Δφ\| over de **toegelaten** punten; geen poort, geen budget |
| De schaal van de objectieven | `bandMetrics.ts` → `PHASE_ERROR_UNIT_DEG` | **TOEGEPAST** | **15°** — waar zes lezers hun fasefout door delen: vijf zoekobjectieven, plus sinds H-4 de armmarge en sinds H-4b de null-handtekening |
| Het stopdoel van de trapmethode | casus 1: `targets` | **GESTELD** | rimpel 2,5 dB, **fase 15°** |
| De null-marge van één fase-eenheid | `activeSide.ts` → `nullMarginAtPhaseErrorDeg` (H-4b) | **TOEGEPAST** (leesdrempel) | **2,30 dB** — wat één eenheid faseafwijking voorbij de 90°-gelijkstand op een nulmarge waard is |

**De toelating is waar wij van de richtlijn afwijken, en bewust.** V44 verving het ±1-octaafvenster
door drie gronden tegelijk: (a) binnen de meetgeldigheid van **beide** takken, (b) beide takken
boven de stille-geestvloer, (c) niveauverschil binnen het overlapvenster. De aanleiding was een
meting: over het hele casusboek telde de tuner 1047 punten mee die het rapport niet zag, waarvan
**911 onder de meetgeldigheidsvloer** die de meetbestanden zélf opgeven en 14 waar beide takken dood
waren en het faseverschil dus uitsluitend van de filters kwam. Het octaafvenster is daarmee geen
toelatingsgrond meer maar een controlekolom.

### Waar wij staan tegenover de richtlijn

**Wij halen haar ruim, en de tie-break keek naar een veel slechter getal dan wat geleverd wordt.**
Twee grootheden worden hier makkelijk verward en ze schelen een factor drie:

| grootheid | wat het is | casus 1, woofer→mid |
| --- | --- | --- |
| De **paarfase van de ontwerpstap** | op IDEALE filters, op de ongerefinede knie — het getal waarop de polariteits-tie-break viel | 45–80° |
| **M-K op het geleverde netwerk** | de echte ladder in de echte driverimpedantie, na de tune, op de toegelaten punten | **10,6 / 13,1 / 32,0°** (het levende corpus), HUIDIG 20,6° |

Over het hele casusboek: 173 geleverde woofer→mid-overnames, mediaan **15,2°**, spreiding 1,9–81,4°,
en **149 van de 173 binnen de 30°-richtlijn**. De referentiefilters van de ontwerper lezen 2,8 / 4,6 /
20,6°.

Dat verschil is zelf een bevinding over de oude polariteitskeuze: zij werd genomen op een getal dat
op ideale filters drie keer zo slecht is als wat de tune uiteindelijk levert — precies het bezwaar
dat `threeWayDesign.ts` bovenaan zijn eigen bestand maakt, *"een keuze mag niet gemaakt worden op een
grootheid die een latere stap nog verandert"*. Dat is waarom H-4 de arm bouwt in plaats van hem op
dat getal weg te gooien.

---

## 4. Het laag, de impedantie en de versterker

### Wat de literatuur zegt

Het **mechanisme** is canoniek: de DCR van de seriespoel en elke discrete serieweerstand tellen op
bij de Q_es van de driver, verlagen de demping die de versterker uitoefent en tillen het laag op.
Rod Elliott behandelt dat samen met de impedantiecompensatie die het tempert.

### Wat onze engine doet

| Maat | Waar | Status | Casus 1 stelt |
| --- | --- | --- | --- |
| M-D — de LF-bult, ontleed in **lift** (resistief) en **opslingering** (resonant) | `metrics/acoustic.ts` (`lf-bump/1.1`), V43 | **GESTELD** | budget **1,4 dB** op de opslingering |
| M-E — Q_es-vermenigvuldiging | `1 + R_s/R_e` op de opgeloste R_e | **GESTELD** | maximaal **2,4** |
| M-B/\|Z\| — de versterkervloer | `impedanceFloor.ts` → `meetsAmpFloor`, de ene vergelijking | **GESTELD** | **2,6 Ω** |
| Niveauwerk op de laagste weg | `levelWork.ts` (`level-work/1.2`) | **GESTELD** | **geen pad toegestaan** (V51) |

### Waar wij afwijken

**Er bestaat geen vuistregel met een getal voor het LF-opslingeringsbudget.** Het mechanisme is
overal beschreven, de grens nergens gestandaardiseerd. De 1,4 dB is dus een echt projectbesluit van
Sander (V43) en niet iets dat tegen een industrienorm te leggen valt. Dat is relevant zodra een arm
erop sneuvelt met 1,81 dB: dat gesprek gaat over dat budget, niet over de polariteit.

Hetzelfde geldt voor de Q_es-grens van 2,4 en voor de versterkervloer van 2,6 Ω — allebei gesteld,
allebei met hun datum en hun reden in `gestelde_eisen`, geen van beide een norm.

---

## 5. Wat onze engine doet waar de literatuur zwijgt

Vijf dingen waarvoor geen vuistregel bestaat, met de reden dat zij er zijn:

1. **De versterkervloer als zoekdoel** (V30) — TOEGEPAST. Een barrière in het objectief die de
   zoektocht uit het gebied houdt dat de poort zou weigeren, met gewicht
   `AMP_FLOOR_BARRIER_WEIGHT` = 1200. De literatuur kent de vloer als eis, niet als term.
2. **De zoekmaat zonder gladding** (`SEARCH_SMOOTHING_OCTAVES` = 0, V38-fix) — TOEGEPAST. Gladden
   vóór de sommatie ontkoppelt magnitude en fase, en trok op onze set de stille geest van buiten de
   band over de bandrand: de amplitudeterm blies van 1,85 naar 10,22 dB.
3. **Bouwbaarheid als poort** (V50/V51) — GESTELD. M-A/part en M-L: het vermogen in elke discrete
   weerstand bij een gesteld **thermisch ontwerpvermogen** van 10 W, en de piekstroom door elke
   spoel.
4. **Het rimpel-stopdoel op een eigen band** (E-5b) — TOEGEPAST. De trapmethode stopt escaleren op
   een band die een halve octaaf onder de laagste overname begint, niet op de hele geoordeelde band.
5. **De polariteitsarmen zelf** (H-4/H-4b/H-5) — KANDIDAAT op verzoek. De literatuur zegt "probeer
   beide"; wat zij niet zegt is dat beide dan ook volledig uitontworpen, getuned en door dezelfde
   poorten geoordeeld horen te worden, naast elkaar in één tabel — en evenmin welke twee van de vier
   configuraties een verkenning dan minstens moet draaien. **Sinds H-5 is de standaard de
   textbookregel alleen** en staat de spiegelarm achter de gestelde run-keuze "Polarity arms: both".
7. **De beschermingscondensator als harde regel** (H-5) — TOEGEPAST. De literatuur stelt hem
   onvoorwaardelijk maar als BOUWinstructie; hier is hij een veto op twee verwijderpaden, gesteld op
   de netlist en zonder één wegnaam te noemen (§6a).
6. **De null-handtekening als getal** (H-4b) — GERAPPORTEERD. De omkeer-nultest is in de literatuur
   een MEETHANDELING aan een gebouwde luidspreker; hier is zij ook een lezing op het getekende
   netwerk, tegen een marge die uit de fase-eenheid van de engine volgt en niet uit een vuistregel.
   Zij verandert nooit iets: een getekend netwerk is van de ontwerper (UI-2).

---

## 6. De veegronde van H-5 — vier vuistregels die hier nog niet stonden

Bij H-5 is de lijst kandidaat-vuistregels langsgelopen die dit document tot dan toe niet noemde.
Elk van de vier heeft nu een status en een reden, zodat "gemist" beantwoord is in plaats van open.

### (a) De tweeter hangt altijd achter een condensator — **TOEGEPAST** (nieuw bij H-5)

**Wat de literatuur zegt.** Het is de enige beschermingsregel die overal onvoorwaardelijk staat:
zonder seriecondensator ziet de spreekspoel van de bovenste driver het volle laag van de versterker,
ook wanneer de akoestische som er goed uitziet.

**De hypothese was dat dit de ene echte misser was. De meting weerlegt dat voor de ENUMERATIE en
bevestigt het voor de VERWIJDERING.**

| vraag | antwoord | waarop |
| --- | --- | --- |
| Kan de SYNTHESE een bovenste weg zonder serie-C leveren? | **Nee** | De hoogdoorlaatladder begint bij élke orde met een serie-C (`synthesis.ts`, rung `i = 0`), en beide ontwerpstappen zetten de hoogdoorlaat van de bovenste weg onvoorwaardelijk aan (`specsFor`, `baseSpecs`) |
| Draagt élke bovenste weg van het casusboek er een? | **Ja — 378 van 378**, over 192 bevroren netlists | `scripts/measure-h5-series-c.ts` |
| Kan een weg er een KWIJTRAKEN? | **Ja, in principe** — de trapsgewijze snoei laat een geopende serie-C voortleven als DRAAD, en de onderdelenaudit heeft op casus 1 aantoonbaar al een C uit een val gehaald (de wees die A5e.3b (c3) noemt) | de code, gelezen |

Wat hen tot H-5 tegenhield was **geen regel over bescherming** maar de eis dat een verwijdering de
som, de paarfase en |Z| niet verplaatst — en dat is precies de zin die F2 al over de poorten schreef:
*"inert" wordt gemeten op de som, de paarfase en Z, en geen van drieën is de vraag of deze driver
gelijkspanning overleeft.* Een tak die om een andere reden dood ligt is akoestisch inert mét en
zónder zijn condensator.

**Sinds H-5 is het een harde regel** (`src/lib/seriesProtection.ts`, twee lezers): een weg BOVEN de
laagste die een seriecondensator draagt, houdt er een. Gevraagd als VETO ná de kwaliteitsregels en
ná de poort — dus een verwijdering die toch al werd afgewezen wordt onveranderd afgewezen en het
aantal netwerkoplossingen beweegt niet (beide byte-referenties reproduceren).

**De uitsluiting van de laagste weg is gemeten en niet beredeneerd, en zij kostte de eerste versie
van de regel een byte-referentie.** Gesteld op ÉLKE weg viel `f4cRegression` meteen om: op de
F4b2-fixture krijgt de laagste tak tijdens de trapmethode een serie-C en raakt hij hem in dezelfde
run weer kwijt. Dat is een CORRECTIE-element en geen bescherming — de laagste weg heeft per
constructie geen hoogdoorlaat — en zijn verwijdering is juist. Op het casusboek draagt de laagste
weg er op 14 van de 192 netlists wél een, dus de meting onderscheidt en keurt niet alles goed.

### (b) Zobel, baffle-step-compensatie en de L-pad-formules — **OVERBODIG-DOOR-METING**

Alle drie zijn **rekenvoorschriften die een grootheid schatten die wij MÉTEN**. Het ELEMENT bestaat
in alle drie de gevallen; wat overbodig is, is de formule die zijn waarden zou moeten bepalen.

| vuistregel | de formule | waarom zij hier niets toevoegt |
| --- | --- | --- |
| **Zobel bij stijgende Le** | `R = R_e`, `C = L_e / R_e²`, uit de T/S-parameters | De synthese BOUWT een Zobel — maar op de GEMETEN impedantie: zij legt er een zodra `\|Z\|` op 4·f_c meer dan 1,3× `\|Z\|` op f_c is, met `R = \|Z(f_c)\|` als zaad, en de tune beweegt de waarden daarna tegen de echte kromme (`synthesis.ts`). De formule schat uit twee parameters wat wij per driver over de hele band hebben liggen |
| **Baffle-step-compensatie** | een serie-L overbrugd door een R, met de stap geschat uit de kastbreedte | De stap zit AL in de meting: het verre veld is in de baffle gemeten. En de DIEPTE ervan is sinds A5e.2/V45 een gestelde voicing (`bass-plateau`), met de overgang afgeleid uit de gemeten kastbreedte bij het lezen en nergens opgeslagen. Wat het netwerk ervoor doet kiest de synthese en de tune — op casus 1 is dat de kanteling van de laagdoorlaatspoel zelf |
| **L-pad-impedantieformules** | twee weerstanden die de last op een nominale ohm houden | De synthese kent de pad als element (`rung: 'pad'`) en `levelWork.ts` inventariseert wat een weg draagt; de formule gaat uit van een RESISTIEVE last op een nominale waarde, wat een echte driver nu juist niet is, en de tuner lost het netwerk in de gemeten impedantie op. Bovendien stelt V51 op de laagste weg een REGEL over pads, en die is strenger dan welke formule ook |

Dat is geen "wij doen dat niet": het mechanisme dat elk van de drie beschrijft gebeurt onverminderd.
Het gebeurt alleen in de oplossing van het echte netwerk in de echte impedantie, in plaats van in
een vooraf berekende correctie op een geschatte kromme.

### (c) Fasesporing binnen ±30° door de overname — **VOORSTEL** (en de eis bestaat al)

**Correctie op de aanname waarmee de veegronde begon:** de eis is niet afwezig. `maxPhaseTrackingDeg`
is sinds F3 een v2-eis met een instelveld, een registerrij, een guided-scherm en een lezer in de
shortlist. Wat ontbreekt is **een getal**: casus 1 stelt er geen, dus zij is overal ongewapend (P4)
en M-K wordt gerapporteerd zonder te oordelen.

Wat een gesteld getal zou doen, met de cijfers die er al liggen (casus 1, woofer→mid, hele casusboek):

| grootheid | waarde |
| --- | --- |
| mediaan M-K over 173 geleverde woofer→mid-overnames | **15,2°** |
| spreiding | 1,9 – 81,4° |
| binnen de 30°-richtlijn | **149 van de 173** |
| de referentiefilters van de ontwerper | 2,8 / 4,6 / 20,6° |
| het levende corpus | 10,6 / 13,1 / 32,0° |

Een budget van 30° zou dus op dit boek ongeveer één op de zeven geleverde overnames afwijzen, en op
het levende corpus één van de drie. **Niet gebouwd bij H-5**, en het bouwen is ook niet het punt: de
eis staat er, en wie hem wil wapenen typt één getal. Dat het getal van Sander is en niet van de
literatuur is dezelfde regel als bij het LF-budget en de Q_es-grens.

### (d) Excess group delay — **GERAPPORTEERD**, en het budget is het VOORSTEL

**Ook hier was de aanname te somber.** M-J bestaat: `excessGroupDelay` (`timeDomain.ts`) leest de
groepsvertraging uit de ongewikkelde fase en trekt haar in-band minimum eraf, en
`groupDelay` (`metrics/electrical.ts`) legt hem naast een drempelkromme. De drempel is de
LITERATUURkromme, als knopen van (Hz, ms):

| Hz | 100 | 500 | 1000 | 2000 | 4000 | 8000 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| ms | 10 | 3,2 | 2 | 1 | 1,5 | 2 |

Zij staat in `constants.ts` als de ENE plek waar engine2 frequenties houdt die niet zijn afgeleid, en
haar eigen commentaar zegt waarom dat mag: M-J is rapportage-only (A4, "geen poort, geen
smaakoordeel"), de kromme is een CITAAT en geen projectgetal, en de metriek neemt haar als parameter.
De herkomst is de Blauert & Laws / Liski-lijn zoals de nota haar samenvat — **de primaire bronnen
zijn niet gelezen**, net zomin als Dickason, en dat staat er liever dan dat het gesuggereerd wordt.

Het VOORSTEL is dus niet de metriek en niet de drempel maar het BUDGET: een gestelde marge boven die
kromme waarop geweigerd wordt. **Niet gebouwd bij H-5**, om dezelfde reden als (c) — en hier met een
extra voorbehoud dat eerst gemeten moet worden: wat M-J op dit casusboek leest is nergens verzameld,
dus vóór iemand er een grens op zet hoort er een kolom te komen zoals V47 die voor M-C maakte.

---

## Wat hiervan een besluit wacht

1. ~~**De verkenningspoort op de polariteitsarmen.**~~ **GENOMEN bij H-4b** (Sander, 20-09-2026) en
   **HERZIEN bij H-5** (Sander, 24-09-2026): de polariteit volgt sindsdien deterministisch de
   textbookregel en er wordt standaard niets gespiegeld; de H-4b-garantie en de 15°-marge gelden nog
   onder de gestelde keuze "Polarity arms: both". Gemeten prijs op de demo: verkenning 12 → 6 runs,
   vol veld 36 → 9. Zie §1.
7. **Een getal voor `maxPhaseTrackingDeg`** (§6c). De eis bestaat sinds F3 en niemand heeft haar
   gewapend. Op dit casusboek zou 30° ongeveer één op de zeven geleverde woofer→mid-overnames
   afwijzen en één van de drie levende netlists; de mediaan is 15,2°. Eén getal maakt er een
   gewapende eis van.
8. **Een budget op M-J** (§6d). De metriek en de literatuurdrempel staan er; wat ontbreekt is een
   gestelde marge erboven — en daarvóór een kolom die zegt wat M-J op dit casusboek werkelijk leest,
   zoals V47 die voor M-C maakte.
2. ~~**`stated-min` voor casus 1.**~~ **AL GENOMEN bij M-2b** (Sander, 12-09-2026) en hier
   onterecht als openstaand genoteerd; zie het erratum in §2. Het venster leest 2200–2304 Hz met
   `vloer_bindend: aanbevolen_ondergrens`.
3. **Het LF-budget van 1,4 dB** — of een omgepoolde mid die er 0,41 dB overheen gaat weggegooid hoort
   te worden, is een vraag over dat getal. **Sinds H-4b verdient hij aandacht**: op casus 1 sneuvelen
   álle zes de gespiegelde armen op M-D, en de verkenning draait er sindsdien meer van. **M-5
   (21-09-2026) maakt hem dringender en corrigeert tegelijk de lezing ervan:** van de 41 weigeringen
   daar vallen er 27 op dit budget — **12 op LR2 en 15 op LR4**, dus het is géén eigenschap van een
   uitlijning maar van de seriespoel op de laagste weg, en op 253 Hz weigert het 13 van de 16 armen.
4. **De breakup-deler is nog steeds ongekalibreerd** (V6/V9). De twee gepubliceerde eindpunten zijn
   HARMONISCHE ORDES (U-4) en een tweetoonsmeting beslist welke voor déze conus geldt; op casus 1 is
   zij niet gedaan en het plafond van het mid→tweeter-venster hangt er volledig aan. **M-5 legt er
   gewicht bij én neemt er tegelijk zorg van weg:** datzelfde ongekalibreerde plafond is de helft van
   de reden dat LR2 op mid→tweeter niet uitdrukbaar is (de andere helft is de gestelde −20 dB) — maar
   de weigering OVERLEEFT de hele kalibratie-onzekerheid. Op de MILDSTE gepubliceerde deler (2,0)
   komt het plafond op 5688/2,0 = 2844 Hz, nog altijd onder de LR2-vloer van 2934,5 Hz; pas onder
   een deler van ~1,94 — buiten het gepubliceerde bereik — zou het venster opengaan.
5. **De ONGEKNIPTE gestelde kooi op een positie BINNEN haar venster** (M-5, nieuw). U-5 knipt een
   gestelde kooi met opzet niet tegen het venster; C-2 houdt gegenereerde kooien er juist binnen.
   Op een positie die erbinnen ligt reikt de gestelde kooi er daardoor overheen, en M-5 mat de tune
   erin lopen: **vijf van zeven geleverde rijen kruisen boven het breakup-plafond**, één tot 8560 Hz.
   Repareren raakt U-5 en vraagt een eigen sessie.
6. **Geen enkele grens op een λ-fractie.** De literatuurgetallen (¼ λ aanvang, ½ λ praktijk) staan in
   §2 genoteerd; V20 stelde vast dat geen enkele λ een weg met twee bronnen samenvat, dus wie er een
   grens op wil, stelt eerst welke van de vier.

---

## Bronnen

- [Linkwitz-Riley Crossovers: A Primer — Rane Note 160](https://www.ranecommercial.com/legacy/note160.html)
- [Linkwitz-Riley Active Crossovers — Rane Note 119 (PDF)](https://schematicsforfree.com/files/Audio/Circuits/Equalizers,%20Filters,%20Loudness%20&%20Tone%20Controls/Filters/Filters%20-%20Analog/Other/Linkwitz-Riley%20Active%20Crossovers.pdf)
- [VituixCAD help 2.0 — Kimmo Saunisto](https://kimmosaunisto.net/Software/VituixCAD/VituixCAD_help_20.html)
- [Measurements with REW for crossover simulation — Kimmo Saunisto (PDF)](https://kimmosaunisto.net/Software/VituixCAD/VituixCAD_Measurement_REW.pdf)
- [Troels Gravesen — Inverted Polarity](http://www.troelsgravesen.dk/Inverted-Polarity.htm) — *certificaat verlopen op 20-09-2026; de pagina zelf kon niet opgehaald worden, de inhoud komt uit citaten elders*
- [Reverse mid polarity in 3 way — diyAudio](https://www.diyaudio.com/community/threads/reverse-mid-polarity-in-3-way.372732/)
- [3rd Order Crossover Reverse Null — diyAudio](https://www.diyaudio.com/community/threads/3rd-order-crossover-reverse-null.366805/)
- [The importance of phase tracking — diyAudio](https://www.diyaudio.com/community/threads/the-importance-of-phase-tracking.211883/)
- [Rule of Thumb Tweeter Crossover — Parts Express Tech Talk](https://techtalk.parts-express.com/forum/tech-talk-forum/10982-rule-of-thumb-tweeter-crossover)
- [Driver bandwidth and determining crossover frequency — HTGuide](https://htguide.com/forum/archive/index.php/t-25250.html)
- [Impedance Compensation For Passive Crossovers — Rod Elliott, sound-au.com](https://sound-au.com/articles/z-compensation.htm)
- [Speaker lobing calculator — Audio Judgement](https://audiojudgement.com/speaker-lobing-polar-response/)
- [MTM Driver Spacing — Parts Express Tech Talk](https://techtalk.parts-express.com/forum/tech-talk-forum/47982-mtm-driver-spacing)
- [Time Alignment Part Three — Audiofrog](https://www.audiofrog.com/time-alignment-part-three-delays-and-crossovers-for-tweeters-and-mids/)
