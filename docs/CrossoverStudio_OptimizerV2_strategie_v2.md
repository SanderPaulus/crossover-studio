# Strategie — Optimizer Engine v2 voor SD Acoustics Crossover Studio

*Herzien 25-08-2026. Opbouw: **Deel A** is de algemene specificatie en bevat uitsluitend formules, afleidingsregels en parameters — geen enkel getal dat uit een specifiek project afkomstig is. **Deel B** is het casusboek: projectdata die de specificatie valideert en de regressieset vormt. Alles in Deel A moet werken voor elke driverconfiguratie, elk aantal wegen en elke meetset.*

---

# DEEL A — Algemene specificatie

## A1. Aanleiding

De huidige optimizer stuurt op SPL, fase en min|Z|. In praktijkgebruik (casus 1, Deel B) bleken drie klassen van ontwerpfouten daar volledig buiten te vallen: vermogensverlies in filterweerstanden, fasedoelen die gehaald worden via ondergedempte resonanties die elders schade aanrichten, en kruispunten op akoestisch onhoudbare plekken. De gemene deler: de kostenfunctie kende de fysica buiten het elektrische domein niet. Vakvuistregels coderen die fysica, maar verliesgevend. De v2-engine neemt de onderliggende grootheden op en gebruikt vuistregels uitsluitend als validatie.

## A2. Kernprincipes

**P1 — Metriek boven proxy.** Een vuistregel wordt nooit direct een grens. Eerst wordt de fysische grootheid geïdentificeerd, die wordt als berekenbare metriek geïmplementeerd, en de vuistregel wordt de regressietest van de metriek binnen zijn geldigheidsgebied.

**P2 — Hard en zacht gescheiden in de architectuur.** Harde eisen zijn haalbaarheidspoorten vóór de zachte kostenfunctie, geen straftermen ernaast. Een kwadratische straf naast fasetermen kan stilletjes overschreden worden zodra een andere winst groter is.

**P3 — Onhaalbare doelen krijgen geen drempel.** Zachte doelen worden drempelloos geminimaliseerd met gewicht; de gebruiker ziet de bereikte waarde en de afruil. Drempels op onhaalbare doelen creëren straf-plateaus waarin de optimizer niet meer kan onderscheiden.

**P4 — Alles projectinstelling, standaard uit, zichtbaar.** Metrieken die invoer vereisen staan uit zolang die ontbreekt, en de UI toont welke randvoorwaarden actief zijn. Geen enkele grens of gewicht krijgt een ingebakken standaard die stilletjes meedoet.

> **Amendement (F2, 26-08-2026).** P4 geldt niet voor reproduceerbaarheids-instellingen — daar is een gerapporteerde standaard veiliger dan afwezigheid. Concreet: de run-seed (A5e.4). Een grens of gewicht dat stilletjes meedoet vervalst een *oordeel*; een ontbrekende seed vervalst niets maar maakt het resultaat onherhaalbaar, en dat is de ergere fout. De uitzondering geldt uitsluitend voor instellingen die aan geen enkel oordeel deelnemen, en de gebruikte waarde wordt altijd gerapporteerd. Een budget is géén zo'n instelling: dat begrenst inspanning en volgt gewoon P4.

**P5 — Parasieten zijn afhankelijke variabelen.** DCR/ESR gekoppeld aan componentwaarde via catalogusmodellen tijdens continue optimalisatie; exacte samenstellingswaarden bij snapping. DCR kan bovendien bewuste ontwerpvariabele zijn (bijv. baffle-step-bijdrage) en mag dus niet blind geminimaliseerd worden.

**P6 — Geen projectgetal in de specificatie.** Elke band, grens of referentiefrequentie in een metriek wordt **afgeleid uit projectdata** (impedantiepieken, kruispunten, gate-tijden, drivergeometrie) of is een **expliciete projectinstelling**. Hardgecodeerde frequenties of waardes die uit één ontwerp stammen zijn een specificatiefout.

## A3. Architectuur

```
 projectdata ──► METRIEKBIBLIOTHEEK (pure functies met gedeclareerde
 (netlist, Z/SPL,  databehoefte, afgeleide banden, actief/uit-status)
 geometrie,             │
 catalogus)   ┌─────────┴─────────┐
              ▼                   ▼
       POORTEN (hard)      ZACHTE DOELEN (drempelloos, gewogen)
              │ faalt → verwerp   │
              ▼                   ▼
       OPTIMALISATIEKERN: globaal (DE) → polish (grenzen afgedwongen),
       parasieten gekoppeld, kruispunt-vensters als instelling
              ▼
       ROBUUSTHEID & SNAPPING: worst-case over parasiet-onzekerheidsband,
       discrete catalogus-descent met exacte parasieten, Monte-Carlo eindpoort
```

### A3j. Keuze, polish en het grijze gebied ertussen

*Toegevoegd 27-08-2026 (F4c). Algemeen geformuleerd: de indeling geldt voor elke instelling die
de tuner aanneemt, niet voor een vastgelegde lijst sleutels. De concrete indeling van de
huidige tuner is een BIJLAGE bij het casusboek, geen onderdeel van deze specificatie — een
lijst namen in Deel A zou een implementatiedetail tot norm verheffen.*

Een optimalisatie krijgt twee soorten instellingen mee, en het onderscheid is niet cosmetisch:
het bepaalt wie ze mag zetten zodra er twee engines zijn.

**Keuze** — de instelling bepaalt **WAT** er gezocht wordt. Waar wordt overgenomen, welke flank
krijgt welke orde, welke helling wordt nagestreefd, bindt de catalogus, welke curve wordt
beoordeeld en over welke band, en wat is ronduit verboden. Een keuze beschrijft de kandidaat.
Zij hoort bij de laag die de kandidaat oplevert (A5d, pre-design) en nergens anders vandaan te
komen.

**Polish** — de instelling bepaalt **HOE** er gezocht wordt binnen een gegeven keuze:
iteratiebudget, gladding van de foutmaat, numerieke veiligheid, instrumentatie. Polish mag
overerven: wie de kandidaat ook koos, deze instellingen veranderen niets aan wat er gezocht wordt.

**Het grijze gebied** — gewichten die de scalaire kostfunctie vormgeven. Naar de vorm zijn het
polish: geen ervan noemt een frequentie, een orde of een topologie. Naar het effect zijn het
keuze, want de balans tussen deelscores bepaalt welk deel van het veld de zoektocht ooit
bezoekt. Een kandidaat beoordeeld op een andere weging is een andere vraag, ook als het
zoekgebied identiek is.

**De regel die hieruit volgt.** Zodra twee engines dezelfde tuner delen, mag een keuze-instelling
niet meer stilzwijgend van de ene naar de andere overerven: een kandidaat die door engine A is
gekozen en met de instellingen van engine B wordt gezocht, wordt ongemerkt teruggetrokken naar
B's ontwerp. Grijze instellingen erven wél, maar alleen **expliciet**: de engine die de zoektocht
voert stelt ze vast, en waar zij een waarde van de ander overneemt zegt zij dat. Zeggen dat iets
overgeërfd is verslaat het verzwijgen — en het maakt de aanname toetsbaar zodra iemand haar wil
betwisten.

**Toetsbaarheid.** De indeling is pas een regel als zij afdwingbaar is: elke instelling die de
tuner aanneemt heeft een klasse, de verzameling klassen dekt de instellingen volledig, en een
nieuwe instelling zonder klasse hoort de build te breken in plaats van stil in de erf-categorie
te vallen.


Structureel afgevangen ontwerpfouten: (1) polish-fase die grenzen negeert — grenshandhaving zit in de kern; (2) optima op een naald — worst-case over de parasietband is een vaste laatste fase, met de onzekerheidsband als instelling.

## A4. Metriekregister

Formaat per metriek: *grootheid → formule → afgeleide parameters → databehoefte → rol (poort/zacht/rapportage) → status*. Een metriek komt pas in de engine als alle velden compleet zijn en er een validatiecasus in Deel B staat.

### Poorten (harde eisen, geen extra databehoefte)

**M-A · Dissipatie per weerstand.** `P_R = ∫ S(f)·|I_R(f)/E_g|²·R df`, met S(f) een programmaruis-weging (IEC 60268-1: roze met 1e-orde HP/LP op de normranden), genormeerd zodat het totaal in de luidspreker opgenomen vermogen gelijk is aan de opgave. Rapportage als **fractie van het versterkervermogen** (schaalvrij) én in watt bij door de gebruiker gekozen vermogen. Databehoefte: geen — elementstromen volgen uit de MNA-oplossing. Valkuil (gedocumenteerd in casus 1): normeren op E_g².

**M-B · EPDR.** `EPDR(f) = |Z_in|/(2·cos²φ)`; poort op het minimum over de band. Vervangt de kale |Z|-ondergrens; die blijft beschikbaar als eenvoudige modus. Databehoefte: geen.

**M-C · Spanning op driverresonantie.** `20·log10(|V_drv(f_s)| / V̄_passband)`, met f_s automatisch uit de piek(en) van het geladen impedantiebestand en V̄_passband het gemiddelde over de doorlaatband van die weg, **afgeleid uit de gevonden kruispunten** (P6). Vangt de vuistregels "kruis ≥ 2×Fs" en "−18 dB op Fs" in één berekenbare grootheid. Databehoefte: geen. Grens instelbaar per project.

### Zachte doelen

> **Herijkt bij F3 (26-08-2026), A5e.1.** "Zacht" betekende in de oorspronkelijke opzet: meedoen in een gewogen kostenfunctie, met een gewicht dat de gebruiker instelt. Dat is vervallen. Onder het satisficing-besluit zijn de metrieken hieronder **rapportage- en sorteerkolommen** op de shortlist: zij beschrijven een kandidaat, zij rangschikken hem op verzoek van de lezer, en zij kennen géén gewicht. Wat een kandidaat wél kan afwijzen is een EIS (venster, fase) of een POORT (M-A/M-B/M-C) — beide acceptatiegrenzen, beide zonder gewicht. De formules, afleidingen en databehoeften hieronder veranderen daar niet door; alleen hun rol verandert, en het woord "gewicht" komt in geen van hun implementaties meer voor.


**M-D · LF-opslingering op de driverresonantie.** Extra respons-bult die filter + bronimpedantie toevoegen bovenop het kale driver-in-kast-gedrag: `max over B van [NF×H_el] − max over B van [NF]`, beide genormeerd op f_ref. **Afleiding (P6):** B en f_ref volgen uit de bovenste impedantiepiek f_p van het geladen .zma — B ≈ [0,7·f_p , 2,2·f_p], f_ref ≈ 3·f_p mits binnen het geldige NF-bereik en onder het kruispunt. Databehoefte: nabije-veldmeting van de betreffende weg. Vervangt de spoel-vuistregel (die R, DCR, piek-Q en kastafstemming mist).

**M-E · Thévenin-bronweerstand / Q-vermenigvuldiging.** `Z_s(f) = (V₂−V₁)/(V₁/Z₁ − V₂/Z₂)` via twee solves (Z en 2Z), geëvalueerd rond f_s; rapportage als `(R_e+R_s)/R_e`. Databehoefte: R_e per driver. Goedkope benadering van M-D wanneer geen NF-meting beschikbaar is; rapportage kan de consequentie in kastvolume tonen (V_box ∝ Q_ts²-vuistregel als duiding, niet als grens).

**M-F · Verticale lobing.** Twee niveaus, en sinds V20 (27-08-2026) is de rangorde tussen die twee vastgelegd in plaats van impliciet: **F-eind is de autoriteit**, F-interim is leesvoer.

*F-eind (berekend) — de autoriteit.* Synthetiseer het verticale gedrag uit per-driver-metingen, filterspanningen en z-offsets: `P(θ,f) = Σ_i P_i(f)·H_i(f)·e^{+jk·z_i·sinθ}`; rapporteer afwijking t.o.v. as over een instelbaar hoekvenster en de diepste dip in het kruisgebied. **Dit is de enige lobing-grootheid waar een gebruikers-eis of een kandidaat-oordeel aan mag hangen** (V20a): zij gebruikt élke bron, élk akoestisch centrum en de doelhellingen van de kandidaat zelf, in plaats van één afstand die voor alle bronnen tegelijk moet instaan. Databehoefte: z-offsets (akoestische centra) + per-driver-metingen op één as. Beperking documenteren: puntbron-benadering per driver; eigen verticale bundeling van drivers/waveguides zit er niet in.

*F-interim (alleen geometrie) — rapportage.* **Registerrij, herzien bij V20:**

| veld | inhoud |
| --- | --- |
| grootheid | Bronscheiding in golflengtes bij het kruispunt, als **vier** fracties per aangrenzend wegenpaar: (1) tot de **dichtstbijzijnde** bron, (2) tot het **amplitudegewogen zwaartepunt**, (3) tot de **verste** bron — alle drie *tussen* de twee wegen — plus (4) de grootste onderlinge scheiding **binnen** één van beide wegen. |
| formule | `λ = d·f_x/c` voor elk van de vier `d`. `d₁ = min_{i∈L, j∈U} |z_i−z_j|`, `d₃ = max_{i∈L, j∈U} |z_i−z_j|`, `d₂ = |z̄_L − z̄_U|` met `z̄ = Σ a_i z_i / Σ a_i`, `d₄ = max_w max_{i,j∈w} |z_i−z_j|`. |
| afgeleide parameters | `f_x` = het kruispunt dat de kandidaat zelf oplevert (geen kruispunt = geen fractie, wél de afstanden, en dat wordt gemeld). `a_i` = relatieve amplitude uit de **aansturing**; niet ingevuld = gelijk aangestuurd (parallel), en de metriek zégt dat in plaats van stil een 1 te schrijven. |
| databehoefte | De verticale positie van **elke** bron per weg (`waySources`). Terugval: één bron per weg op het akoestisch centrum; verdere terugval: de ingevoerde c-t-c-afstand, die dan voor alle drie de tussen-de-wegen-fracties tegelijk staat — met de melding dat zij niet te scheiden waren. Een árray-afstand alléén is géén invoer: een afstand zegt niet hoevéél bronnen zij scheidt, en er twee van maken is precies de N=2-aanname die V20 verbiedt. |
| rol | **rapportage.** Geen poort, geen budget, geen shortlist-criterium, geen score — blijvend (V20a/b). |
| validatiecasus | casus 1, alle drie de netlists (`kandidaten.*.lobing_{wm,mt}_*_lambda`, parameters in `kandidaten._M_F_interim_parameters`). |
| versie | `lobing-lambda/2.0`. MAJOR t.o.v. de ongeversioneerde F1-vorm: andere resultaatvorm én een andere grootheid onder dezelfde naam. |

*Wat V20 verving.* F1 rapporteerde **één** λ per paar, genomen als de grootste van de paarafstand en een array-afstand binnen een van beide wegen, en scoorde die tegen een **niet-monotone** zonecurve (gunstig klein, ongunstigst rond een halve golflengte, opnieuw gunstig rond één — de verzoening van de twee strijdige vakregels, Deel B V5). Voor een weg met N bronnen bestaat die ene λ niet, dus de score scoorde een keuze en niet een meting; hij is vervallen en heeft geen vervanger. De zonecurve zelf staat bewaard in Deel B, V20.

**M-G · Directiviteits-match.** Uit een 0°/θ-meetpaar per driver: de frequenties waar het verschil −3 en −6 dB passeert; de −6 dB-frequentie van de onderste driver is de bovengrens voor het kruispunt (vakregel), de metriek rapporteert de marge. **Aanscherping bij off-axis data van béíde drivers:** de eigenlijke regel is DI-continuïteit — een sprong in bundeling op het kruispunt geeft een power-response-anomalie die geen EQ kan repareren. De snijzone van de twee D(f)-curven wordt dan een tweezijdige doelband in de kruisvenster-synthese in plaats van een eenzijdig plafond. Databehoefte: minstens één off-axis meting per betrokken driver; de doelband-variant vereist beide.

**M-H · Breakup-afstand met ernst-weging.** Breakup-detectie per driver (zie A5.2); de vakregel "kruis onder f_break/3 (H3) resp. /2 (H2)" geldt in volle sterkte alleen voor forse pieken. Weging: vereiste marge schaalt met piekamplitude en Q (voorstel: volle regel vanaf circa +6 dB piek; daaronder lineair afbouwend; exacte weging vaststellen zodra HD-metingen in het casusboek zitten). Belangrijk inzicht: een notch op de breakup verhelpt dit niet — de vervorming ontstaat ín de driver, ná het filter. **Richtings-persistentie als ernst-component:** een piek die bij off-axis metingen blijft staan of groeit is een echte conusresonantie (telt mee in de power response → ernst omhoog); een piek die verdwijnt of van teken wisselt is interferentie/diffractie (ernst omlaag). Lineair deelrapport (altijd beschikbaar): elektrische onderdrukking op f_break.

### Rapportage zonder optimalisatierol

**M-J · Groepvertraging vs. hoorbaarheidsdrempel.** Groepvertraging van het totale systeem, getoond tegen de drempelcurve uit de psychoakoestische literatuur (~1–3 ms in het middengebied, ruimer daarbuiten). Geen poort, geen smaakoordeel: typische HF-kruisingen blijven er ruim onder, lage kruispunten verdienen de blik. Dit is de berekenbare afstammeling van alle "steil klinkt slechter"-lore; de klankregel zelf ("2e orde muzikaler") is ❌ — geen grootheid, en de gecontroleerde luisterliteratuur wijst gladde on-/off-axis respons aan als dominante voorkeursfactor.

**Ontwerpprincipe voicing.** "Muzikaal" is een responskeuze, geen filterorde-eigenschap: voicing hoort een expliciete, gedocumenteerde **doelcurve** te zijn (project-object: vlak, tilt, luistervenster, behoud-huidig, of handmatig) waar de SPL-doelfunctie tegen rekent — nooit een bijeffect van helling-ideologie.

**M-I · Gevoeligheid/robuustheid.** Monte-Carlo over componenttoleranties (instelbaar per componenttype) als eindrapport; worst-case over de parasietband als poortcontrole in de laatste fase. Promotie naar in-de-lus-straf pas na profilering.

### Categorische catalogusregels (geen metriek)

- Kernverzadiging: spoelfamilies dragen een vlag met stroomgrens; serie-elementen in hoogstroompaden vereisen lucht of gedocumenteerde verzadigingsstroom. (Getalsmatige onderbouwing: bij vol vermogen liggen RMS-stromen in het bereik waar ferrietkernen op bastransiënten niet-lineair worden.)
- Fysiek formaat/prijs: maximale capaciteit/inductie per bouwvorm als cataloguseigenschap; relevant zodra een layout-doelvak (projectinstelling) is opgegeven.
- Snapping-snoeiregel: kandidaten die uitsluitend verschillen in DCR onder de meetbaarheidsgrens in serie-LP-posities, of in DCR van shunt-spoelen in HP-secties, niet apart evalueren.

## A5. Meetopname en afleiding (de motor achter P6)

Nieuwe metingen moeten door **dezelfde regels** verwerkt worden als bestaande — zonder codewijziging. Daarvoor bestaat de opnamepas, die bij elke wijziging van de meetset draait:

1. **Manifest.** Elke meting krijgt tags: driver, type (Z / nabij-veld / ver-veld / groundplane), hoek, en waar bekend gate, spanning, afstand, driverdiameter. Auto-detectie uit bestandsheaders waar mogelijk; de rest tagt de gebruiker eenmalig bij upload.
2. **Afleidingspas.** Per driver worden de afgeleide parameters berekend die alle metrieken voeden: R_e, impedantiepieken (f, Z, Q), breakup-pieken (f, amplitude, Q), geldigheidsgrenzen (Keele-grens, gate-grens, FF/NF-divergentie), en de daaruit volgende evaluatiebanden. Deze parameters worden gecachet onder de meetsessie-ID.
3. **Capability-matrix.** Metriek × databehoefte → actief/uit per driver, met reden ("M-G uit: geen off-axis meting voor tweeter"). Dit is wat de UI toont onder P4.
4. **Her-evaluatie.** Vervangt of vult een gebruiker metingen aan, dan herberekent de pas de afgeleide parameters en worden bestaande ontwerpen automatisch opnieuw gescoord tegen ongewijzigde regels. Regels veranderen nooit mee met een meting; alleen de afgeleide grenzen doen dat.
5. **Geldigheidspropagatie.** Elke meting draagt zijn eigen geldigheidsinterval [f_lo, f_hi] als metadata. Elke metriek snijdt zijn natuurlijke evaluatieband met de geldigheidsintervallen van de data die hij gebruikt en rapporteert de **dekking**: "geëvalueerd over X–Y, dat is N% van de beoogde band", met een vlag bij lage dekking. De optimizer evalueert kostentermen uitsluitend binnen geldige gebieden — een vaste evaluatie-ondergrens in de kostenfunctie is een P6-overtreding; de ondergrens vólgt uit de meetset. Metrieken waarvan de beoogde band grotendeels buiten de geldige data valt worden niet stilletjes geëvalueerd en niet stilletjes overgeslagen, maar zichtbaar gemarkeerd als ongedekt.

Prototype-demonstratie op casus 1 (alle parameters louter uit bestanden + manifest) staat als `ingest.py` in de referentiebundel. De demonstratie legde meteen drie te verfijnen schatters bloot — vastgelegd als V8 in het casusboek.

## A5b. SPL-extractoren (voedt het F1-rapportpaneel)

Alle extractoren leiden hun banden en grenzen af uit de data zelf (P6):

1. **Geldigheidsgrenzen — drie detectoren, in rangorde.** (i) *Header-vloer (hard, automatisch):* effectieve venstertijd T = rechter venster − referentietijd uit de bestandsheader; f ≥ 1/T is een absoluut minimum, fijnstructuur pas vertrouwd vanaf ~2/T. (ii) *FF/NF-modeltest (adviserend):* het FF−NF-verschil moet passen op een fysisch baffle-step-model (shelf, diepte ≤ ~7 dB, begrensde exponent), gefit uitsluitend binnen de Keele-geldige NF-band; blijvend residu markeert de kapotte zone. Let op: het model kan gate-afval deels absorberen — nooit boven de header-vloer laten versoepelen. (iii) *Detail-instorting (zwak adviserend):* vereist een SNR-wacht en kan fysiek gladde responsies niet van gate-gladde onderscheiden. Eindoordeel per meting: **max(header-vloer, modeldetector)**. Nabij-veld: Keele-grens 4311/D_inch en mic-afstandseis 0,11×straal. Alle overige metrieken clippen hun banden op deze grenzen; elke nieuwe of vervangende meting brengt zijn eigen grenzen mee via zijn eigen headers — de banden bewegen automatisch mee, in beide richtingen.
2. **Breakup-scan.** Afwijking t.o.v. fractionele-octaaf-trend (breedte instelbaar); piekdetectie met Q-schatting via de −3 dB-punten van de rimpel. Voedt M-H.
3. **Diffractie-rimpel.** RMS-rimpel t.o.v. trend over de doorlaatband + FFT-periodiciteit → dominante omweglengtes in mm, te toetsen aan kastgeometrie.
4. **Directiviteit uit 0°/θ-paren.** Voedt M-G; toont waar het gedrag van kolbentheorie afwijkt (waveguides, pods). Levert bovendien de **effectieve stralerdiameter** per frequentie (kolbenmodel-fit op D(f)): voedt de Keele-grens datagedreven i.p.v. via handinvoer, en markeert conus-ontkoppeling (waar het kolbenmodel — en daarmee elke symmetrie-aanname — ophoudt te gelden).
5. **Baffle step.** FF−NF in het gezamenlijk geldige gebied, vergeleken met c/(2W) uit de opgegeven baffle-breedte.
6. **Verticale-lobing-synthese.** Voedt M-F-eind.

### A5c. Z-extractoren (impedantiedata)

Impedantie is exact en gate-vrij meetbaar; per geladen .zma/.lim leidt de opnamepas af:
1. **R_e** via Re(Z), geëxtrapoleerd onder de onderste resonantie (kale low-f-aflezing faalt zodra de meting dicht op f_L begint — zie V8d).
2. **Resonanties met Q** per piek; voor gesloten systemen direct de uitlijning: r₀=Z_max/R_e, Q_mc/Q_ec/Q_tc via de klassieke Small-methode.
3. **Reflex-diagnostiek**: f_L/f_b/f_H, consistentiecheck √(f_L·f_H)≈f_b, en de verliesindicator Z(f_b)/R_e (duiding via de QL≈7-praktijkregel; nauwkeurigheid staat of valt met R_e).
4. **Rimpelscan** t.o.v. fractionele-octaaf-trend: interne staande golven, poortpijp-resonanties, pod-modes — elk met frequentie en amplitude, te toetsen aan kastgeometrie.
5. **Spreekspoelmodel**: semi-inductantie-fit |Z−R_e| = K·ω^n boven het motionele gebied; n≈1 zuivere spoel, n→0,5 sterke wervelstroomonderdrukking. Voedt Zobel-advies en de LP-modellering. Voor tweeters vaak niet in-band bepaalbaar (motioneel domineert tot ver boven de audioband) — extractor moet dat detecteren en melden i.p.v. onzin fitten.
6. **Sessievergelijking**: f_s/f_b/compliantie-drift tussen meetsessies → inspeel-detectie en her-validatiewaarschuwing (sluit aan op F5).
7. **Systeem-vingerafdruk (QC)**: gemeten ingangsimpedantie van het gebouwde filter vs. gesimuleerde — afwijking lokaliseert bouwfouten (verkeerde waarde, bedrading, kernverzadiging) zonder akoestische meting.
8. Met extra metingen: vol T/S-stel (vrije lucht + delta-massa/volume), thermische R_e-shift en poortcompressie (twee niveaus).

### A5d. Afgeleide ontwerpanalyses (pre-design laag)

Combinaties van reeds afgeleide parameters die ontwerpruimte afbakenen vóórdat er een component gekozen is:
1. **Onderlinge looptijden (dZ) automatisch.** Wanneer de headers één gedeelde referentietijd tonen, zijn relatieve aankomsttijden per driverpaar extraheerbaar uit de overtollige fase → voedt lobing-synthese en tijd-uitlijning zonder handmatige akoestisch-centrum-sessies. Vereist eerst minimumfase-verwijdering (Hilbert): kale fasehelling overschat de vertraging van bandbegrensde drivers (V8h).
2. **Fase-hellinganalyse per overlapgebied.** Hellingen (°/okt) van de káле driverresponsies rond elk snijpunt → de structurele mismatch die het filter moet overbruggen, als orde-asymmetrie-advies vóór optimalisatie (~90°/okt ≈ één orde).
3. **Haalbare kruisvensters** *(geïmplementeerd in prototype, zie V9)*. Per driverpaar de doorsnede van alle afgeleide grenzen, elk met bronvermelding en de melding welke grens bindend is:
   - *vloeren:* meetgeldigheid (beide metingen); k·f_s van de bovenste driver met orde-afhankelijke k (≈3/2/1,6/1,4 voor orde 1–4 — steilere flank mag dichter op de resonantie);
   - *plafonds:* eerste significante breakup van de onderste driver gedeeld door een ernst-gewogen factor (→3 bij forse pieken, →2 bij milde; de wegingscurve is het enige ongekalibreerde element en vergt HD-data); −6 dB@30°-punt van de onderste driver;
   - *voorkeurszones binnen het venster:* lobing-zones (niet-monotoon per R5) en fase-hellingmatch (A5d.2).
   Leeg venster = driver-/layoutprobleem, geen filterprobleem — en dat vóór er één ontwerp gemaakt is. Conflicterende zones (bijv. lobing-goed boven het breakup-plafond) worden expliciet getoond: dat zijn de werkelijke ontwerpspanningen van een drivercombinatie.
   **Vensterinteractie (meerweg).** De klassieke minimumafstand-regel (midband ≥ ~2 okt steil / ~3 okt flauw; maximum ~10–12:1) is geschreven voor amplitude, maar fasekoppeling reikt ~2× verder. Geen afstands-poort; drie rapportage-indicatoren: (a) *drie-bronnen-zone* — frequenties waar >2 wegen binnen X dB van de som liggen (triggert M-F-eind met drie bronnen); (b) *fase-doorkoppeling* — faserotatie die de secties van het ene kruispunt bijdragen in de trackingband van het andere (voedt A5d.2); (c) *mid-insertieverlies* — dB onder het asymptotische niveau; boven een drempel is het ontwerp een bewuste filler-topologie: toegestaan, maar gemeld, met rendementskost en verhoogd Monte-Carlo-gewicht.
   **Orde-afleiding per flank.** De filterorde is geen gebruikersgok maar een afgeleide: (i) *akoestische doelhelling telt, niet elektrische orde* — vereiste elektrische orde = (doelhelling − gemeten natuurlijke helling)/6, per flank uit de kale meting; (ii) beschermingsflank: benodigde verzwakking op f_s (M-C-doel) gedeeld door de octaafafstand tot het kruispunt; (iii) onderdrukkingsflank: benodigde verzwakking op de (ernst-gewogen) breakup gedeeld door de afstand; (iv) orde-asymmetrie ≈ fase-hellingmismatch (A5d.2) / 90°/okt; (v) kostenkant per kandidaat-orde via M-A (serie-elementen onderin zijn duur in koper en dissipatie, bovenin goedkoop). Voorkeursvorm: symmetrische akoestische LR-flanken voor fasetracking, tenzij (iv) asymmetrie voorschrijft.
4. **Gevoeligheids-gap-analyse — verankerd, niet paarsgewijs.** Het referentieniveau van het systeem is het **anker**: de weg met de hoogste kosten-per-dB verzwakking (vrijwel altijd de onderste weg — daar kost dempen bronweerstand, LF-bult en dissipatie). Het dempingsbudget van elke andere weg is zijn gemeten gap t.o.v. het *anker*, en die budgetten **ketenen**: budget(bovenste) = gap(bovenste→midden) + gap(midden→anker). Ligt een tussenweg bóven het anker, dan schuift zijn overschot dus één-op-één door naar alle wegen erboven. Twee nuances: (a) het ankerniveau hangt af van de doelcurve — het is het niveau van de onderste weg ná baffle-step in de beoogde opstelling, niet zijn kale doorlaatbandgevoeligheid; (b) ligt een tussenweg *onder* het anker, dan wisselt het anker en moet de onderste weg gedempt worden — dat is een haalbaarheidswaarschuwing (driverkeuze-probleem: systeemgevoeligheid begrensd door de tussenweg, met dempingsconsequenties op de onderste weg), geen stille optimalisatie-uitkomst.
5. **Manifest-kruischecks (QC).** Gefitte baffle-step-f₀ vs opgegeven baffle-breedte; referentietijd-consistentie tussen headers (schakelt analyse 1 aan/uit); niveaucontroles NF/FF — vangt tagfouten in het manifest.
6. **Meetafgeleide zoekruimtegrenzen.** Elke budgetmetriek die monotoon van een componentwaarde afhangt is inverteerbaar naar een grens op die component, met uitsluitend gemeten Z/NF/SPL plus de projectbudgetten als invoer. Twee klassen:
   - *Exacte inversies* (metriek hangt van weinig componenten af): max totale serie-R in het laagste pad uit het Qes-budget (Rs ≤ R_e·(q−1)); max serie-L uit het bult-budget bij gegeven Rs (1D-oplossing op de gemeten Z-piek + NF); max pad-verzwakking uit de gemeten gevoeligheids-gap.
   - *Topologie-bewuste voorbounds* (metriek verdeeld over meerdere secties): bijv. max serie-C uit het f_s-spanningsbudget geldt exact voor een enkelvoudige sectie en verruimt per extra filterorde — toepassen als zoekdoos-vormgeving met speling; de poort (M-C e.d.) blijft de autoriteit.
   Consequentie voor A5e.3: **optimalisatiegrenzen = catalogus-spanwijdte ∩ meetafgeleide budgetgrenzen.** Pathologisch gedrag (weerstand-drift naar extreme waarden voor "gratis" faserotatie) wordt daarmee per constructie onmogelijk i.p.v. per straf ontmoedigd, en de zoekruimte krimpt aanzienlijk.
7. **Reflectiedetectie binnen het venster.** Periodieke rimpel (cepstrum/FFT) in ver-veldmetingen verraadt resterende reflecties → meetkwaliteits-QC.

Niet extraheerbaar uit SPL alleen (documenteren in de UI): vervorming (HD-sweep vereist), echte verticale polars per driver, absolute max-SPL/excursiegrenzen (vereist gedocumenteerde meetspanning en -afstand plus Sd/Xmax).

### A5d.8. Kandidaatgeneratie — de pre-design-laag levert het VELD

*Toegevoegd 27-08-2026 (F4d). Algemeen geformuleerd: de regels gelden voor elk aantal wegen, elke meetset en elke topologie-bibliotheek. De uitkomst op één project is een casusboek-entry, geen onderdeel van deze specificatie.*

A5d.1 t/m A5d.7 bakenen de ontwerpruimte af. Zolang die afbakening alleen gerapporteerd wordt, is de engine een **vetorecht met een rapportagelaag**: zij kan een netwerk afkeuren en componentwaarden begrenzen, maar niet voorstellen wáár de overname hoort — terwijl zij dat als enige uit de metingen afleidt. Kandidaatgeneratie sluit die naad. Zij hoort in A5d en nergens anders: A5d is pre-design, A5e is de run, en een kandidaat is per definitie het ding dat vóór de run bestaat.

**De uitvoer.** Per aangrenzend wegenpaar een reeks kandidaat-overnames; als geheel het cartesisch product daarover, plus per kandidaat een volledige verklaring over élke instelling die de zoektocht aanneemt (A3j). Een kandidaat is dus geen frequentie maar een **beschrijving van een zoekvraag**.

**De vijf regels waaraan de reeks moet voldoen.**

1. **Spreiding in OCTAAF-afstand, niet clustering.** De posities dekken de aanbevolen band gelijkmatig in log-frequentie. Een veld dat het midden van een venster fijn bemonstert en de randen niet, heeft al besloten dat het midden beter is — precies het oordeel dat A5e.1 deze laag verbiedt. Waar de aanbevolen band uit meerdere segmenten bestaat (de slechtste lobing-zone is eruit gesneden) loopt de spreiding over de **aaneengeschakelde** octaafafstand van de segmenten, zodat een breed segment naar rato meer posities krijgt en de weggesneden zone er geen consumeert.
2. **Het AANTAL is afgeleid, niet gekozen.** Twee overnames die dichter bij elkaar liggen dan de gladding waarop de acceptatie oordeelt, leveren ontwerpen op die dat oordeel niet uit elkaar kan houden; die breedte is dus de fijnste zinvolle stap. Het aantal is wat erin past. Een smal venster krijgt daardoor mínder kandidaten — omdat het minder onderscheidbare antwoorden HEEFT, wat informatie is en geen tekortkoming.
3. **De orde per flank komt uit de orde-afleiding (A5d.3), en meerdere toegestane orden zijn aparte KANDIDATEN.** Nooit een gewogen compromis: er bestaat geen orde drieënhalf. Waar geen enkele regel gewapend is en de ontwerper niets gesteld heeft, ONTHOUDT de afleiding zich — en onthouding betekent niet "orde 1" en niet "orde 4" maar: elke bouwbare orde is een eigen kandidaat. Een engine zonder mening biedt het veld aan; zij kiest niet stilletjes.
   *Gevolg dat vaak wordt overgeslagen:* het venster is een FUNCTIE van de orde (de vloer is k·f_s met k dalend naarmate de flank steiler wordt), dus het venster wordt **per orde opnieuw afgeleid**. Eén venster met vier orden erin zou drie ervan onder een vloer plaatsen die voor een ander is berekend.
4. **Niets buiten de meetgeldigheid. Ooit.** De posities worden uit de aanbevolen band gesneden, en die is per constructie een deelverzameling van het haalbare venster. Een kandidaat buiten het venster is daarmee niet iets dat de generator weigert op te leveren, maar iets dat zij niet kan uitdrukken. De relaxatie-ladder (A5e.1) mag later een SMAAK-eis verruimen; zij mag nooit de meetgeldigheid verruimen, en deze laag evenmin.
5. **Elke kandidaat draagt zijn herkomst.** Uit welk venster, welk segment van de aanbevolen band, de hoeveelste positie daarin, hoeveel octaven boven de vloer, welke limiet die vloer en dat plafond zette, en welke regel de orde bepaalde. Een shortlist-rij die een ontwerper niet kan toeschrijven is een rij waar hij niet naar kan handelen — en het hele argument om kandidaatgeneratie hierheen te halen is dat déze kandidaten kunnen zeggen waar zij vandaan komen.

**Kosten en dunnen.** Het afgeleide veld kan groter zijn dan wat een ontwerper wil betalen. Dan worden **posities** gedund en **orden nooit**: een positie is een steekproef uit een continuüm, een orde is een keuze, en een keuze laten vallen om een budget te halen beantwoordt een vraag die openstond. Wat gedund is wordt gemeld, met beide aantallen erbij — een stilzwijgende afkapping leest als volledige dekking.

**Verhouding tot de tuner.** De generator vervangt geen optimizer. Zij levert het WAT; de bestaande waarde-optimalisatie doet het HOE binnen die keuze (A3j). Dat is ook de reden dat de kandidaat zijn keuzes expliciet meestuurt: zodra twee engines dezelfde tuner delen, trekt een overgeërfde keuze-instelling de kandidaat stil terug naar het ontwerp van de ándere engine.

**Verhouding tot A5e.4.** Een veld van kandidaten is diversiteit die BESLOTEN is. Gejitterde startpunten zijn diversiteit die getrókken is. Onder satisficing is alleen de eerste bruikbaar, want een shortlist spreidt over topologie-klassen en een gejitterde start heeft geen topologie gekozen. Waar beide bestaan is de kandidaat de bron van spreiding en is de seed een reproduceerbaarheids-instelling die aan geen enkel oordeel deelneemt — wat hij volgens A5e.4 sowieso al was.

**Twee vloeren, twee vragen — en geen automatische verzoening.** Een app met een oudere ontwerplaag kan een tweede ondergrens voor dezelfde overname kennen (bijvoorbeeld een splice- of montageregel in plaats van een meetgeldigheidsregel). Die twee beantwoorden verschillende vragen: *waar mag een respons geloofd worden* tegenover *waar mag een overname zitten*. De regel is dat de kandidaatgeneratie op één van beide staat, dat gezegd wordt op wélke, en dat de andere als **tegenoordeel** naast de eerste getoond wordt met zijn herkomst — inclusief de melding welk deel van het veld die andere laag geweigerd zou hebben. Automatisch verzoenen is verboden: de vroegste laag in de pijplijn wint dan, en "eerst" is geen argument.

## A5e. Openstaande specificatiebesluiten (vóór F1/F2 te nemen)

1. **Aggregatie van zachte doelen — BESLOTEN bij F3 (26-08-2026): SATISFICING, GEEN GEWICHTEN.**

   Het besluit is niet "welke gewichten" maar "geen gewichten". De aanbeveling uit de parkeerlijst — genormaliseerde scores plus een diverse top-N — is voor de helft overgenomen (de diverse top-N) en voor de helft verworpen (de genormaliseerde scores). De reden is dat een genormaliseerde score alsnog een gewogen som ís zodra je hem gebruikt om te rangschikken, en dan is de gewichtsvector alleen onzichtbaar geworden in plaats van weg.

   - **De gebruiker stelt EISEN, geen gewichten.** Acceptatiegrenzen op de UITKOMST: SPL-venster in ±dB t.o.v. de doelcurve, maximale fase-trackingfout, en de bestaande impedantie-/EPDR-vloer. Leeg veld = geen eis (P4).
   - **De engine zoekt het TOELAATBARE GEBIED.** Alles wat aan alle actieve eisen én alle actieve poorten voldoet is een winnaar. Er bestaat **geen gewogen somscore en geen gewichtsvector** — nergens, ook niet intern als "hulpmiddel". Eisen zijn acceptatie-eisen op de uitkomst, geen straftermen in de zoektocht: P3 (onhaalbare doelen krijgen geen drempel) blijft onverkort gelden voor de zoektocht zelf.
   - **De uitkomst is een GEDIVERSIFIEERDE SHORTLIST** (standaard 10, instelbaar): eerst gespreid over topologie-klassen (orde per flank, polariteit meegerekend), daarbinnen op afstand in genormaliseerde componentruimte. Tien wezenlijk verschillende ontwerpen, geen tien klonen.
   - **Sortering is presentatie, geen oordeel.** Standaard gesorteerd op RMS-vlakheid t.o.v. de doelcurve; elke metriekkolom is hersorteerbaar; sorteren verandert niets aan de inhoud van de lijst. De selectie is aan de mens.
   - **Venster poort, gemiddelde rangschikt.** De ±dB-eis is peak-to-peak op de 1/6-octaaf-gegladde systeemrespons t.o.v. de doelcurve; de sorteersleutel is de RMS-afwijking van diezelfde doelcurve. Twee verschillende vragen — "is dit acceptabel" en "welke is het vlakst" — verdienen twee verschillende grootheden, en één getal voor beide is precies hoe een piek van 3 dB en een systematische kanteling van 3 dB gelijk gaan scoren. De fase-eis is de bestaande trackingmetriek: gemiddelde |Δφ| per kruisgebied, geclipt op meetgeldigheid, met gerapporteerde dekking (A5.5).
   - **Outliers asymmetrisch — en dat is een SMAAKPRINCIPE, expliciet als zodanig.** Smalle kenmerken vallen door de 1/6-octaaf-gladding buiten het venster-oordeel; ze gaan naar de rimpelscan. Smalle **pieken** worden per kandidaat gerapporteerd als kolom (grootste piek: +dB @ f, met Q). Smalle **dips** worden vergeven. *Motivering:* het gehoor is asymmetrisch gevoelig voor resonanties en anti-resonanties. Een smalle piek is een resonantie: hij klinkt na, hij wordt door meerdere richtingen tegelijk gevoed en hij is in de powerrespons terug te vinden. Een smalle dip is een interferentie-uitdoving: hij is positie- en hoekafhankelijk, hij verplaatst zich met de luisteraar, en hij vult zich in een kamer grotendeels vanzelf. De literatuur over hoorbaarheidsdrempels van smalle filters zet de drempel voor dips consequent hoger dan voor pieken. Een ontwerp afkeuren op een dip die de luisteraar nooit op die plek hoort is dus strenger dan het gehoor zelf. **Er komt geen extra drempelveld voor:** het onderscheid zit in wat gerapporteerd wordt, niet in een getal dat de gebruiker moet raden.
   - **RELAXATIE-LADDER.** Levert de zoektocht geen (of minder dan N) winnaars, dan verruimt de engine in ZICHTBARE stappen uitsluitend de FALENDE SMAAK-eisen (SPL-venster, fase) tot N kandidaten passen. De uitkomst draagt een etiket: "voldoet aan ±2,25 dB — gestelde eis was ±1,5". **Beschermingsgrenzen (Z/EPDR, dissipatie, V@fs) worden NOOIT gerelaxeerd** — een ladder die er een aanraakt is een bug, geen feature, en de suite bewaakt dat. De ladder is een HER-FILTER op de al geëvalueerde kandidaten, geen nieuwe zoektocht: een ladder die opnieuw gaat scannen trekt de eisen alsnog de zoektocht in. Het etiket vermeldt daarom ook zijn eigen begrenzing ("binnen de gescande kandidaten; een fijner grid kan meer opleveren"). Is een eis principieel onhaalbaar — bijvoorbeeld een Z-eis boven de vloer die het drivercomplement zelf al zet — dan meldt de pre-design-diagnose dat VÓÓR de zoektocht, met het haalbare getal erbij.
   - **TWEETRAPS-STEMPELING.** De eisen raken de zoektocht niet, dus zij horen niet in de run-vingerafdruk (A5e.4). De shortlist-UITKOMST hangt er wél aan, dus die krijgt een eigen stempel — doelcurve, eisenwaarden, ladderstappen inclusief etiket, N, selectieversie — bovenop de vingerafdruk van de onderliggende run. Zelfde eisen op dezelfde run geven een byte-identieke shortlist; andere eisen op dezelfde run geven dezelfde run-vingerafdruk en een ander shortlist-stempel. Dat maakt "de selectie is aan de mens" reproduceerbaar én navertelbaar.
2. **Doelcurve-object — BESLOTEN bij F3 (26-08-2026): MINIMAAL.**

   - Referentie voor dag één is **vlak**. Het object kent een type-veld; `tilt` en `behoud-huidig` zijn GEDECLAREERD maar niet geïmplementeerd (TODO, geen gedrag). Een half werkende kanteling is erger dan een afwezige: hij zou stilletjes meedoen in elk venster- en RMS-oordeel.
   - De doelcurve hangt aan het **ONTWERP**, niet aan het project. Twee voicings van dezelfde luidspreker moeten naast elkaar kunnen bestaan en vergeleken worden; een projectbrede doelcurve maakt van "welke voicing wil ik" een instelling die je heen en weer moet zetten in plaats van een keuze die je naast elkaar legt.
   - Additief in het model: afwezig = vlak, en oude projecten laden ongewijzigd. Zodra het veld bestaat gaat het mee in het shortlist-stempel.
3. **Catalogus-schema.** Families met parasietmodellen (DCR/ESR-fits), verzadigings-/kernvlaggen, bouwvorm/formaat, prijs; en de regel dat **optimalisatiegrenzen uit de catalogus-spanwijdte volgen** — hardgecodeerde componentgrenzen zijn dezelfde P6-fout als hardgecodeerde frequenties.
4. **Determinisme — BESLOTEN bij F2 (26-08-2026).** Zelfde invoer + zelfde seed = byte-identiek resultaat. Het vastgelegde beleid:

   - **Elke run heeft een seed, altijd.** Het project mag er een opgeven; doet het dat niet, dan geldt een gepubliceerde standaardseed die in het resultaat wordt *gerapporteerd*. "Afwezig = uit" is de juiste regel voor een *grens* (P4) en de verkeerde voor een seed: uit zou hier "niet reproduceerbaar" betekenen, precies wat dit besluit moet uitsluiten. Een seed neemt aan geen enkel oordeel deel — hij kiest welk van meerdere gelijkwaardige startpunten bezocht wordt.
   - **Het budget is een projectinstelling en afwezig betekent écht afwezig:** het eigen iteratiebeleid van de tuner geldt, ongewijzigd. Een budget begrenst inspanning, nooit aanvaardbaarheid.
   - **Elk resultaat draagt een vingerafdruk, en die is een LIJST van benoemde componenten**, geen ondoorzichtige hash: enginetversie, schattertabel, seed, budget, aantal startpunten, ontwerp, meetset, actieve poorten, actieve budgetten met hun inversies, en de zoeksturende tuneropties. Twee runs die verschillen moeten kunnen zeggen *welke* invoer verschilde; één hash kan alleen "niet gelijk" zeggen.
   - **Geen klok, geen entropie, geen iteratievolgorde over een hashmap.** De enige randomness in het v2-pad is de spreiding van startpunten, en die komt uit een teller-gebaseerde generator met (seed, stroomnaam) als volledige invoer. Elke verzameling die het pad oplevert is gesorteerd op een *benoemde* sleutel; gelijkspel wordt gebroken op het startpuntnummer, nooit op invoegvolgorde.
   - **Kandidaatvolgorde is een ORDE, geen score.** De rangschikking gebruikt één vastgelegde geleverde grootheid. Zodra A5e.1 (normalisatie en aggregatie) genomen is, wordt de volgorde de zaak van dát besluit; tot dan is één reproduceerbare sleutel beter dan een gewichtsvector waar niemand mee heeft ingestemd.

   Implementatie: `src/lib/engine2/optimizer/determinism.ts`; acceptatie in `determinism.test.ts` (twee runs byte-identiek, andere seed bereikt aantoonbaar de zoektocht, en de vingerafdruk beweegt mee met *elke* component waaruit hij bestaat — component voor component doorlopen, niet steekproefsgewijs).
5. **Schatter-versionering.** Afgeleide parameters worden gecachet; elke extractor draagt een versienummer en een versiebump invalideert de cache en her-triggert de dekking- en golden-reference-tests. Zonder dit worden V8-verbeteringen stille gedragswijzigingen.

### A5e-horizon: open punten uit de kandidaatgeneratie (F4d en de nazorg)

Geen specificatiebesluiten in de zin hierboven — het zijn afgebakende, benoemde openstaande
punten met een casusboek-entry erachter. Ze staan hier zodat ze niet alleen in Deel B leven.

- **`diAnchor` als tweezijdige doelband in `xoWindow.ts`** — de énige v1-mechaniek die F4d
  bewust niet overnam en waarvan F4d zelf zegt dat hij spijt doet. DI-continuïteit is een echte
  A5d.3-voorkeurszone en hoort in het VENSTER thuis (A4 M-G: *"de snijzone van de twee
  D(f)-curven wordt dan een tweezijdige doelband"*), niet als losse extra kandidaat naast het
  venster. `xoWindow.ts` kent die zone nog niet; tot dan sturen de vensters de generator en
  wordt de DI-match alleen gerapporteerd. Zie V27, dekkingstabel 1.
- **~~Rij 38 — het ketenraster begint op 200 Hz~~ — GESLOTEN bij V32 (27-08-2026).**
  Het raster is NIET verplaatst, en dat blijft de juiste keuze: het is `sim`, élke grafiek op dat
  scherm tekent erop uit, en zijn bodem is waar de VERRE-VELDMETINGEN van deze set beginnen — een
  respons die niet gemeten is, wordt niet beoordeeld. Wat wél moest veranderen is wie er nog op
  oordeelde. Sinds V32 geldt: **het raster wordt niet verplaatst; geen poort of inversie oordeelt
  er nog op.** De inventarisatie die dat hard maakt staat in V32 met bestand:regel — vier poorten
  (M-A, M-B/EPDR, M-B/|Z|, M-C), de hoogdoorlaatbeschermings-afleiding en de
  doorlaatband-impedantiemediaan die twee A5d.6-inversies voedt, alle zes verhuisd naar de gemeten
  impedantiesweep, uit één gedeelde functie die het paneel óók gebruikt. Wat op het ketenraster
  blijft is precies wat erop hoort: de kruispunten en elk responsoordeel.
- **V28 — mag een uitsnijding het kandidaatveld vormen, en zo ja op grond waarvan?** De
  F3c-uitsnijding stuurde het veld met een λ-fractie op één c-t-c-afstand, wat V20a verbiedt;
  zij is opgeschort en het veld dekt nu het hele venster. De drie uitkomsten die openstaan
  (verwerpen / herbouwen op de verticale synthese / behouden als doorsnede van de vier
  V20-fracties) staan in de entry. **Open.**
- **~~Casus 1 heeft geen versterkervloer~~ — GESTELD op 27-08-2026 (2,6 Ω, V30);
  ~~de vloer is een veto en geen zoekdoel~~ — GEREPAREERD dezelfde dag, in een eigen sessie.**
  De vondst stond: `zFloorBarrier` werd alleen door de reparatiepas gezet, dus de zoektocht die
  de topologie en de waarden koos wist niet dat er een vloer was. Sinds de V30-vervolgsessie is
  `zFloorBarrier` een OPTIE van `NetOptimizeOptions` (default `false`, dus de v1-route en de
  toggle-invariant zijn byte-onaangeraakt) en op de v2-route een KEUZE-sleutel die de kandidaat
  wapent zodra er een vloer gesteld is. Gemeten op hetzelfde veld met dezelfde seed: van nul naar
  **elf van vijftien** die de vloer halen, shortlist van 0 naar 10, en de vlakheid ging mee omhoog
  in plaats van omlaag (RMS 2,96–3,58 → 1,71–1,96 dB). De prijs zit in de fasetracking. Wat
  hieruit openbleef staat als **V31** (vier kandidaten worden door de veiligheidspoort in hun
  geheel verworpen en leveren hun zaad) en **V32** (de v2-poortreferentie is blind onder 200 Hz).
  **Beide zijn dezelfde dag gerepareerd, in één sessie**: een verworpen kandidaat levert sinds V31
  een VERWERPING met de regel die hem weigerde in plaats van zijn zaad, en elke elektrische poort
  oordeelt sinds V32 op de gemeten impedantiesweep in plaats van op het ketenraster. Wat V31 NIET
  heeft opgelost is de arbitrage zelf — de afruil tussen de versterkervloer en de
  tweeterbescherming is nog steeds een alles-of-niets-veto, en de meting die daarover zou
  beslissen is nog steeds niet gedaan.
- **~~V33 — de doelfunctie kan niet mikken op wat de poort sinds V32 handhaaft~~ — GESLOTEN op
  27-08-2026, in een eigen sessie.** De vondst stond: de barrièreterm las `zShortOhm` van het
  EVALUATIERASTER terwijl de poort sinds V32 op de volle gemeten sweep handhaaft, en op de
  396,7 Hz-as weigerde de poort daarom een tune die de zoektocht niet had kunnen vermijden.
  Sinds V33 is de BRON van die grootheid een KEUZE-sleutel met drie waarden
  (`zFloorBarrierSource`: `'grid'` = default en dus v1 byte-onaangeraakt, `'safety'` = de
  v2-route, `'sweep'` = het poortraster zelf). Alle drie lezen door dezelfde functie
  (`minImpedanceAt`, die `epdr` — en dus de poort — sinds V33 ook gebruikt): het raster is een
  parameter, geen tweede implementatie. Op `'sweep'` is doel = poort een IDENTITEIT en assert de
  suite dat met `toBe`; de v2-route stelt `'safety'`, dat dezelfde uitgestrektheid heeft en
  alleen grover is, en dáár is de rechtvaardiging een meting: het verschil tussen beide lezingen
  is op het levende corpus 0,0075 Ω tegen een vloerspeling van 0,0520 Ω, en op géén enkele
  bevroren netlist vellen de twee rasters een ander oordeel over de vloer. Reden om niet de
  identiteit te nemen: die maakt van een casus-1-ketenrun elf minuten in plaats van één.
  Tweede helft: een poort die de hele waardetune weigert levert sinds V33 een VERWERPING met de
  regel die weigerde, in de V31-vorm en in één geharmoniseerd veld, in plaats van een ongetuned
  zaad dat als ontwerp leest. Wat de inventarisatie daarnaast opleverde staat als **V34**
  (de bronweerstandsprobe leest de rand van zijn eigen zoekvenster, met een doel én een
  diskwalificatie eraan). Zie V33 in Deel B.
- **~~V34 — een DOEL en een DISKWALIFICATIE lezen nog steeds het ketenraster, op een frequentie
  die de rasterrand aanwijst~~ — GESLOTEN op 28-08-2026, in een eigen sessie.** De vondst stond,
  en zij is nagemeten: op casus 1 landt de probe op `grid[24] = 640,2 Hz` — de BOVENrand van zijn
  eigen zoekvenster — terwijl dit wooferpaar bassreflex is en zijn twee impedantiepieken op 17 en
  51 Hz liggen, allebei onder een raster dat op 200 Hz begint. Twee reparaties, één entry, en dat
  is geen bundeling maar een noodzaak: elk van de twee is in zijn eentje slechter dan geen van
  beide. (1) De bewaking is een echte bewaking geworden — `ProbeEdgeRule`, `'first'` = de
  historische regel en dus v1 byte-onaangeraakt, `'both'` = elke rand — en de probe leest op de
  v2-route het VEILIGHEIDSRASTER (`rSourceProbeSource`, keuze-sleutel met `'grid'` als default).
  (2) De 2,0 Ω-diskwalificatie en de 1,0 Ω-audittier zijn op de v2-route INGETROKKEN: casus 1
  stelt geen bronweerstandseis, dus de kandidaat draagt er geen (P4). Waarom samen: op 640 Hz
  lezen de drie v1-baselines 0,50/0,47/0,68 Ω, op de echte piek 3,98/4,59/2,55 Ω — alleen de
  probe repareren zou de eigen referentiefilter van de ontwerper hebben gediskwalificeerd op een
  grens die niemand heeft gesteld. Beide getallen hebben nu één huis met een motivering
  (`partAudit.ts`), langs dezelfde weg als `ampMinLoadOhm` bij F0. Zie V34 in Deel B.
- **V35 — de terugval van de probe neemt de PIEK, en op een bassreflexkast is de afstemming het
  DAL.** Sinds V34 leest de bronweerstandsprobe op de v2-route het veiligheidsraster en landt hij
  op een echte resonantie (51,5 Hz op casus 1) in plaats van op een venstergrens. Maar wat
  `rSourceDisqualifyOhm` en de dissipatieterm willen weten is de demping BIJ de boxafstemming, en
  dit wooferpaar heeft twee pieken (17 en 51 Hz) met het dal — de werkelijke poortafstemming,
  ~31 Hz — ertussen. Twee mogelijke uitkomsten, geen van beide genomen: (i) **de ontwerper stelt
  f_b** — het veld bestaat (`audit.fbHz`), casus 1 vult het niet, en dan is dit een P4-vraag en
  geen enginevraag; (ii) **de terugval leidt de kastsoort af uit de kromme** (twee pieken met een
  dal ertussen ⇒ bassreflex ⇒ neem het dal). Die tweede verandert de uitkomst van élke bestaande
  run met een bassreflexwoofer en verdient dus dezelfde behandeling als V30, V32, V33 en V34: een
  eigen sessie met een vóór/ná-meting. Tot dan heet de aflezing wat zij is — "de bronweerstand bij
  de bovenste impedantiepiek van de laagste weg" — en zegt `rSourceProbeNote` dat hardop. Zie V34
  in Deel B. **Open.**
- **~~V36 — waar leest de dissipatieterm zijn probe, en wat bewaakt dissipatie nog?~~ — GESLOTEN op
  28-08-2026, in een eigen sessie.** Twee gedaanten waren mogelijk en het was geen van beide: de
  term is niet ingetrokken (dat zou A3j schenden — `dissipationWeight` is grijs en wordt expliciet
  overgenomen) en hij is niet dood door een randweigering (dat zou V33 in een vierde gedaante
  zijn). Hij leest sinds V34 hetzelfde raster als élke andere lezer van diezelfde probe. De
  bevinding is een andere: hij is **te klein om iets te beslissen** — hoogstens 0,34 % van de
  objectiefwaarde op het levende casus-1-corpus, tegen een uitdagingsdrempel van 1 %, en dat gold
  vóór V34 net zo goed. Wat er wél is gebouwd: de shortlist toont naast de dissipatieFRACTIE nu de
  WATT in de grootste enkele weerstand bij het gestelde vermogen — een kolom, geen criterium, met
  een assert dat een veld waarin één kandidaat 95 % verstookt een byte-identieke lijst oplevert.
  Geen regeneratie: er is geen regel in de zoektocht veranderd. Zie V36 in Deel B.
- **~~V37 — de dissipatieterm deelt door de PIEKHOOGTE en niet door R_e~~ — GESLOTEN op
  28-08-2026, in een eigen sessie.** De vondst stond en de controle die V36 voorstelde is de
  acceptatie geworden. De term bestaat om de serie-R-route naar niveauregeling af te remmen, en de
  schade die zij aanricht is Q_es-vermenigvuldiging: `1 + R_source/R_e`, met R_e de DC-weerstand
  (A3j rij 23, A4 M-E). Hij deelde echter door `Re(Z)` BIJ de bronweerstandsprobe, en sinds V34 zit
  die probe op de impedantiepiek van de laagste weg: gemeten 19,31 Ω tegen een gemeten R_e van
  3,05 Ω — een factor 6,33 die tot **40,1** kwadrateert. Sinds V37 is de NOEMER een KEUZE-sleutel
  met twee waarden (`dissipationReferenceSource`: `'probe'` = default en dus v1 byte-onaangeraakt,
  `'re'` = de v2-route), met de opgeloste R_e ernaast als polish-sleutel
  (`dissipationReferenceReOhm`) in precies de vorm die V33 voor de barrière koos. De R_e is
  dezelfde die M-E publiceert en die de Q_es-inversie gebruikt — één R_e, één herkomst, sinds V37
  drie lezers (F4b lek 1). Geen terugval: een genoemde bron zonder opgeloste R_e levert géén
  verhouding en meldt welke invoer ontbrak, precies zoals bij V32, V33 en V34. De acceptatie is de
  referentie zelf: `1 + R_source/R_e` reproduceert de `Qes_mult`-referenties van élke bevroren
  netlist binnen hun tolerantieklasse (grootste afwijking 0,36 % tegen een klasse van 5 %) en de
  piekhoogte doet dat aantoonbaar niet (minstens 18 % ernaast op élke netlist die werkelijk
  serieweerstand draagt). Het gewicht is NIET bijgesteld, en dat is een besluit met dezelfde
  volgorde als bij V36: eerst de noemer, dán pas de vraag of het gewicht klopt. Zie V37 in Deel B.
- **V29 — mag `safety` een netlist weigeren die vrijwel kortsluit als er géén vloer gesteld is?**
  Twee verdedigbare houdingen (strikt P4 tegenover een uit de gemeten driverimpedanties
  afleidbare degeneratiegrens), aanleiding is de V28-shortlist met 0,01 Ω erin. **Open**, geen
  besluit genomen.

## A6a. Ontwerp-pijplijn (werkvolgorde per project)

De klassieke handmatige volgorde luidt: (1) impedantie lineariseren — Zobel op stijgende Le, LCR op resonantiepieken; (2) kruispunten en hellingen kiezen; (3) secties van onder naar boven ontwerpen; (4) niveaus padden; (5) fase/polariteit controleren; (6) voicen. Die volgorde bestaat omdat élke stap de volgende handmatig rekenbaar maakt: een geresistiveerde belasting laat tekstboekformules kloppen, vaste kruispunten ontkoppelen de secties.

In een meetgedreven, gezamenlijk optimaliserende engine vervalt die reden — en erger: **sequentieel optimaliseren van gekoppelde doelen is schadelijk.** Kruispunt, fase en SPL zijn één gekoppeld probleem (vensterinteractie, fase-doorkoppeling), en het casusboek bevat het bewijs uit eigen huis: een amplitude-optimizer die ná een fase-optimalisatie draaide vernietigde de fasetracking. De v2-volgorde scheidt daarom niet de *doelen* maar de *beslislagen*:

1. **Opname & geldigheid** — manifest, geometrie, afgeleide parameters, dekkingskaart (A5).
2. **Pre-design** — verankerde gevoeligheidsanalyse, haalbare kruisvensters met koppelingsindicatoren, orde-afleiding per flank, meetafgeleide zoekruimtegrenzen (A5d). Uitvoer: structuurbeslissingen en een rapport van spanningen, vóór er iets ontworpen is.
3. **Topologie-sjabloon** — inclusief compensatienetwerken als *kandidaten met bestaansrecht-toets*: een Zobel wordt voorgesteld waar de gemeten Le-stijging de LP-knie in reikt; een LCR waar een resonantiepiek nabij een filterknie ligt **én** de componentwaarden bouwbaar zijn (de bouwbaarheidstoets uit V3: op lage f_s exploderen de waarden). Nooit standaard: de solver kent de echte belasting al, dus compensatie moet zijn plek verdienen via poorten en doelen, niet via de gewoonte "eerst vlak maken".
4. **Gezamenlijke waarde-optimalisatie, dan het TOELAATBARE GEBIED** — kruispunten, fase én SPL in één doelfunctie, binnen poorten en grenzen. Nooit na elkaar. *Herijkt bij F3 (A5e.1):* de uitkomst van deze stap is geen winnaar maar een VERZAMELING. Elke gescande kandidaat wordt tegen de actieve eisen en poorten gehouden; alles wat slaagt is toelaatbaar, en daaruit komt een gediversifieerde shortlist (topologie-klasse eerst, dan afstand in genormaliseerde componentruimte). Slaagt er niets, dan verruimt de relaxatie-ladder in zichtbare stappen uitsluitend de falende smaak-eisen — nooit een beschermingsgrens — en draagt de uitkomst het etiket dat zegt waaraan zij wél voldoet. De keuze uit de shortlist is een mensbeslissing; de engine levert het veld, niet het oordeel.
5. **Snapping, robuustheid, rapport** — discrete catalogus, worst-case, Monte-Carlo, dekkings- en afruioverzicht.
6. **Bouw-QC** — systeem-impedantievingerafdruk tegen de simulatie.

Registervermelding: de klassieke volgorde-regels zijn ✅ als *sjabloon-heuristieken* (stap 3) en ❌ als optimalisatievolgorde (stap 4).

## A6. Fasering

Elke fase één ononderbroken implementatiesessie groot, met acceptatie via het casusboek (Deel B). Volgorde bindend.

**F0 — voorwaarde.** Lopende sanering van de oude impedantie-ondergrens afronden (raakt dezelfde codepaden). *Acceptatie: suite groen, geen verwijzing naar de oude constante.*

**F1 — Metriekbibliotheek + SPL-extractoren, alleen rapporterend.** Losgekoppeld van de optimizer; rapportpaneel per geladen filter, inclusief "uit — invoer ontbreekt". Solver uitbreiden met elementstromen. *Acceptatie: alle golden references uit het casusboek binnen afronding gereproduceerd; eenheidstests per metriek tegen handberekeningen.*

**F2 — Poorten M-A/M-B/M-C in de engine.** Grenzen per project instelbaar; grenshandhaving in de polish structureel. *Acceptatie: geen kandidaat schendt een actieve poort; de poort-ontwijkingsregressies uit het casusboek falen niet meer.*

**F3 — Zachte doelen M-D t/m M-H + invoerbeheer.** Instelbare gewichten, drempelloos; projectvelden volgens het geometriemodel A5a (bronnenlayout, meetopstelling, kastgeometrie) plus R_e; zichtbaarheidsregel P4; kruispunt-vensters. *Acceptatie: casusboek-rangordes gereproduceerd; bij ontbrekende invoer aantoonbaar inactief én gemeld.*

**F4 — Parasietkoppeling + robuuste snapping.** Catalogus-DCR/ESR-modellen; exacte samenstellings-parasieten; worst-case over de instelbare onzekerheidsband; Monte-Carlo eindrapport; snoeiregels. *Acceptatie: de naald-optimum-regressie uit het casusboek wordt door de engine zelf gevangen.*

**F5 — Meetsessie-koppeling.** Elk filterontwerp gekoppeld aan een meetsessie-ID; waarschuwing bij mismatch (baffle-/positiewijziging invalideert het filter — procesregel uit het vak). *Acceptatie: laden van een filter bij afwijkende sessie geeft zichtbare waarschuwing.*

**F6 — verkennend, apart besluit: topologievoorstellen.** Gerichte inserties (serie-L, L-pad, shunt-demping, ordewissel) door de volledige pijplijn geëvalueerd; waarden-optimalisatie kan deze klasse verbeteringen principieel niet vinden. Starten na ervaring met F1–F5.

## A7. Teststrategie

- **Casusboek als regressieset.** Elke gevalideerde casus (Deel B) levert golden references die elke build moet reproduceren. Het casusboek groeit met elk project; de specificatie verandert er niet door.
- **Dode-knop-test.** Voor elk gewicht en elke grens een geautomatiseerde sweep die aantoont dat de uitvoer verandert.
- **Grenzen-assert.** Elke run eindigt met een controle dat alle parameters binnen hun grenzen liggen.
- **P6-lint.** Reviewregel: geen letterlijke frequenties/waardes in metriekcode die niet herleidbaar zijn tot een afleiding of een projectinstelling.
- **Nieuwe-meting-test.** Neem een casusboek-meting, verschuif synthetisch f_s of voeg een breakup-piek toe, en assert dat alle afgeleide parameters en banden meebewegen. Dit bewijst per build dat de regels op data werken en niet op onthouden constanten.
- **Synthetische grondwaarheid-casussen.** Genereer meetsets uit bekende modellen (T/S + kast + kolben-directiviteit + gekozen gate): de extractoren moeten de bekende parameters exact terugvinden. Dekt de eenzaam-datapunt-zwakte van afleidingsregels (zie V3-kanttekening) zonder op nieuwe echte projecten te wachten, en levert casussen voor systeemtypes die het casusboek nog mist (gesloten sub, 2-weg, filler-topologie).
- **Dekkingstest.** Vervang in een casusboek-project een meting door een variant met kortere/langere venstertijd en assert dat (a) de geldigheidsintervallen meebewegen, (b) elke metriek zijn dekking herrapporteert, en (c) de optimizer-kostenfunctie aantoonbaar geen samples buiten de geldige band gebruikt.

## A8. Risico's en niet-doelen

- Metriek-inflatie: register-formaat is verplicht; geen complete rij, geen opname.
- Rekentijd: Thévenin kost twee extra solves maar alleen rond resonanties; worst-case is de duurste stap — profileren vóór optimaliseren.
- Niet-doel: vuistregels afschaffen. Ze blijven in het rapport als duiding naast de berekende waarde, zodat de dialoog met de gemeenschap aansluitbaar blijft.
- Niet-doel: app-defaults (P4).

---

# DEEL B — Casusboek (projectspecifiek, zijlijn)

*Dit deel valideert Deel A en levert de golden references. Niets hieruit mag terugvloeien als standaardwaarde.*

## Casus 1 — Koan 2951 (meetdata 22-08-2026, analyses 25-08-2026)

Configuratie: 3-weg; 2× SB WO24TX-8 parallel, MR13TX-4 in bolpod, T25T-6 in WG104-waveguide; c-t-c W1-W2 275,8 mm, W2-M ~261 mm, M-T 129,2 mm; z-offsets −601,6/−325,9/−64,6/+64,6 mm; gate 5,021 ms.

**Golden references (drie kandidaten):**

| | HUIDIG 2e orde | KAND-A 2e orde | KAND-B 3e orde |
|---|---|---|---|
| W-M / M-T fase ±1 okt | 19,8° / 7,1° | 2,8° / 3,6° | 1,3° / 3,5° |
| min\|Z\| / min EPDR | 3,46 / 1,73 Ω | 3,32 / 1,66 Ω | 3,44 / 1,72 Ω |
| M-A: totaal / grootste R | 46% / 25,5 W | 53% / 30,9 W | 39% / 19,7 W |
| M-C tweeter @ f_s | −24,6 dB | −33,3 dB | −34,5 dB |
| M-D extra bult | +3,78 dB | +4,30 dB | +3,36 dB |
| M-E Q-mult | 2,31× | 2,50× | 1,84× |
| M-F interim W-M, tussen de wegen (dichtstbij / zwaartepunt / verste) | 0,274 / 0,419 / 0,563 λ | 0,351 / 0,537 / 0,722 λ | 0,340 / 0,520 / 0,699 λ |
| M-F interim W-M, binnen de wooferweg | 0,29λ | 0,36λ | 0,36λ |
| M-F interim M-T (één bron per weg: de drie vallen samen) | 0,84λ | 0,92λ | 0,94λ |
| M-F eind, ±15° dip | — | — | −3,9 dB @ ~3,5 kHz |
| SPL-venster | ±2,2 dB | ±1,67 dB | ±1,79 dB |

**Validaties van Deel A op deze casus:**
- V1 (M-A): normalisatiefout op E_g ontdekt en gedocumenteerd; dissipatie bleek bindend (39–53%).
- V2 (poort-ontwijking): fasedoel via ondergedempte L/C met serie-R tegen de grens (drift richting extreem hoge R zonder grenshandhaving) — regressie voor F2.
- V3 (M-D-afleiding): bovenste impedantiepiek 52,3 Hz, Q 4,97 → band en f_ref volgens A4-afleiding reproduceren de handmatige analyse; spoel-vuistregel (2,7 mH ↔ +2,45 dB) gereproduceerd; LCR-vlakstelling op deze f_p vergt onbouwbare waarden (~60–120 mH) — motiveert waarom M-D een zacht doel is.
- V4 (M-C): onderscheidde kandidaten met 10 dB verschil zonder extra invoer.
- V5 (M-F): strijdige vakregels (klassiek ≤ halve golflengte vs. 1,0–1,4 golflengte met slechtste zone rond 0,5–0,7) — beide verwerpen dezelfde foute oplossing om verschillende redenen; alleen F-eind beslecht de rangorde. Synthese uit metingen bevestigd: kruisgebied verticaal onschadelijk (≤1,3 dB op ±15° bij het onderste kruispunt).
- V6 (M-H): breakup-scan vond dominante wooferpiek +3,2 dB Q≈7 die de bestaande notch bevestigt; f_break/3 valt samen met het onafhankelijk gekozen kruispuntvenster. Milde pieken (+2,9 dB mid) tonen de noodzaak van ernst-weging. Open meetverzoek: HD-sweep wooferpaar.
- V7 (extractoren): gate-grens uit FF/NF-divergentie (~465 Hz) consistent met eerder handmatig bepaalde gate-limiet; diffractie-rimpel RMS 0,39 dB bevestigt teardrop+waveguide; pod-mid houdt spreiding ver voorbij kolbentheorie (−6 dB@30° ≈ 5,4 kHz).

- V8 (opnamepas): drie schatters behoeven verfijning, ontdekt door de generieke pas op deze casus te draaien: (a) R_e-schatting uit min|Z| van de laagste bins pakt reactantie mee (4,6 vs werkelijke ~3,0 Ω) → gebruik Re(Z) bij lage f; (b) de stijgende spreekspoel-inductantie wordt als "piek" gedetecteerd (mid, hoge f, Q≈0,5) → discriminator piek-vs-flank nodig; (c) breakup-detectie is gevoelig voor de bandkeuze wanneer die niet op de geldigheidsgrenzen wordt geclipt (dezelfde wooferpiek: +0,7 vs +3,2 dB); (d) R_e-schatting via Re(Z) bij de laagste bins overschat wanneer de meting dicht op f_L begint (3,81 vs ~2,9 Ω bij een 10 Hz-start naast f_L=16,5 Hz) → motionele fit of extrapolatie vereist, en de verliesindicator Z(f_b)/R_e erft die fout één-op-één; (e) semi-inductantie-fit op de tweeter leverde een onzinnige exponent omdat het motionele staartgebied de fitband domineerde → geldigheidsdetectie verplicht; (f) detail-instortingsdetector gaf vals-hoge grenzen op fysiek gladde responsies en vals-lage op ruis → alleen met SNR-wacht en als advies; (g) FF/NF-vergelijking zonder fysisch stapmodel keurt gate-gladde data goed (59 Hz "betrouwbaar" op een 2,5 ms-venster) en zonder Keele-clipping faalt de fit volledig → modelvorm, exponentgrens en NF-clipping zijn alle drie verplicht; (h) looptijd-extractie via kale fasehelling overschat systematisch bij bandbegrensde drivers (rolloff-faselag telt mee als "afstand"; rangorde en verhoudingen klopten wel) → minimumfase-component eerst verwijderen. Alle vijf zijn afleidingsfouten, geen regelfouten — precies wat de nieuwe-meting-test moet blijven vangen.

- V12 (grens-inversie): de bult-budget-inversie reproduceert de spoel-vuistregel exact — bij Rs ≈ 0,5 Ω en budget 2,5 dB volgt max-L 2,65 mH, vrijwel letterlijk de "2,7 mH bij 4 Ω" uit de gemeenschap; de L↔R-afruil wordt expliciet (bij Rs = 2 Ω is het 2,5 dB-budget met géén enkele L haalbaar). Qes-budget-inversie op gemeten R_e: 0,87/1,45/2,90 Ω bij 1,3/1,5/2,0×. Gevoeligheids-gap-bound omsloot de gerealiseerde shelf-weerstand. Tegen-voorbeeld gedocumenteerd: de enkelvoudige serie-C-voorbound (5–10 µF) botst met de gerealiseerde 4e-orde midtak (42 µF serie) — bewijs dat voorbounds topologie-bewust of met speling moeten, met de poort als autoriteit.
- V11 (vensterinteractie): op het referentieontwerp (2,49 okt midband) is de drie-bronnen-zone afwezig (amplitude ontkoppeld) terwijl de mid-tak op het onderste kruispunt −121°/okt elektrische rotatie draagt die grotendeels van de bovenste-kruispunt-secties komt — fasekoppeling zonder amplitudekoppeling, exact het mechanisme achter het oorspronkelijke trackingprobleem van deze casus. Bevestigt: rapporteren i.p.v. verbieden, en gezamenlijke optimalisatie als antwoord.
- V10 (directiviteits-aanscherpingen): richtings-persistentie gevalideerd op het 0°/30°-paar — alle vier de gedetecteerde conuspieken van de betreffende driver bleven op 30° staan of namen toe (tot +7,9 dB), dus échte resonanties met power-gewicht: de ernst-weging van het bovenste kruisplafond gaat daarmee omhóóg, niet omlaag, wat het eerder gekozen conservatieve kruispunt achteraf steunt en het hoger geoptimaliseerde kandidaat-kruispunt op de rand zet. Effectieve-diameterextractie gevalideerd: fit toont vol conusoppervlak in het bundelingsbegin en krimpende effectieve diameter daarboven (conus-ontkoppeling) — direct bruikbaar voor de datagedreven Keele-grens.
- V9 (kruisvenster-synthese): generieke assemblage draaide op de casusparameters. Onderste paar: venster 397–551 Hz — vloer bindend door meetgeldigheid, plafond door ernst-gewogen breakup; het gekozen kruispunt valt erbinnen en het hele venster ligt in de gunstige lobing-zone. Bovenste paar: venster 1294–2284 Hz mét blootgelegde driewegs-spanning: de slechtste lobing-zone beslaat de onderhelft van het venster, de gunstige lobing-zone ligt bóven het breakup-plafond, en het geconvergeerde kruispunt ligt op de rand — de positie van die rand hangt volledig aan de ongekalibreerde ernst-weging. Conclusie: de synthese maakt de werkelijke afruil zichtbaar vóór het ontwerpen; kalibratie van de wegingscurve (HD-data) is de ontbrekende schakel.

- V13 (een driver is een SOM van metingen, niet één meting) — ontdekt bij F1 door de opnamepas op de volledige meetset te draaien. Het wooferpaar is één weg, één Driver-part en één parallelle .lim, maar twéé ver-veldbestanden. Scannen op één conus beantwoordt een vraag die niemand stelt: de breakup die telt zit in de druk die het páár uitstraalt, en dat is de complexe som. Dezelfde conusresonantie leest **+0,7 dB op één conus en +3,24 dB op de som** — en het hele ernst-gewogen kruisplafond (551 Hz) hangt aan welke van die twee je gelooft. Regel: metingen met dezelfde driver-tag en dezelfde hoek worden complex gesommeerd vóór élke scan, en `combineAtAngle` is de enige ingang tot de extractoren. Generiek, niet casusspecifiek: elke array-weg heeft dit.

- V14 (de adviserende FF/NF-detector mag geen band slopen) — ontdekt door de app te dráaien op de eigen demo-set, niet door een test. Twee constructiefouten in de eerste implementatie, beide met hetzelfde gevolg: de gate-vloer sprong van 397 Hz naar 2 kHz, twee drivers verdwenen uit het rapport en de wegvolgorde keerde om. (a) *Abstentie ontbrak:* een fit die nérgens past levert "het residu is bovenin nog steeds slecht", en dat veroordeelt alles eronder — terwijl de conclusie hoort te zijn dat het model deze data niet beschrijft. Fit-oordeel nu op het **mediane** absolute residu, niet op de RMS: een écht kapotte zone is precies waarvoor de detector bestaat en trekt een RMS over de drempel, waarmee de detector zou abstineren op zijn eigen kerngeval. (b) *Persistentie ontbrak:* A5b.1(ii) zegt "blijvend residu", en dat woord doet werk — één uitschieter bovenin veroordeelde de hele band. Alleen een aaneengesloten reeks van minstens 1/6 octaaf telt nu. Derde bevinding uit dezelfde sessie: **wegvolgorde hoort op de ongeclipte respons**. Waar de energie van een driver zit is een eigenschap van de driver, niet van het venster dat erop stond; ordenen op de geclipte band laat de volgorde afhangen van welke meting het hardst gepoort is. Alle drie nu met regressie vastgelegd.

- V15 (P6 geldt ook voor de golden references) — bij de F1-oplevering reproduceerde de engine vijf referenties niet, en in alle vijf de gevallen had de engine gelijk: het referentiebestand had een eigenschap van één meetsessie ingebakken. Dat is dezelfde fout als een hardgecodeerde frequentie in de engine, één niveau hoger. (a) *W-M fasetracking* was gemiddeld over het volle ±1 octaaf rond het kruispunt, waarvan bij HUIDIG de onderste helft onder de 397 Hz-vloer ligt (kruispunt 360 Hz). Op de geclipte band (A5.5) leest de engine 23,8° tegen de genoteerde 19,8° — en het beslissende bewijs: **KAND-A en KAND-B reproduceren de oorspronkelijke referentie exact** (2,79 vs 2,8 en 1,24 vs 1,3), want hún kruispunten liggen boven de vloer. De metriek is nu geclipt en rapporteert zijn dekking. (b) *Mid-breakup #4* is er twee (14379 Hz +2,83 en 14955 Hz +3,17), gelezen als één breder kenmerk op een grover raster; de andere drie reproduceren tot binnen 0,06 dB op dezelfde schatter. (c) *SPL-venster* is geen A4-metriek en de band waarover het genomen was stond nergens — een referentie zonder band is geen referentie, en is verwijderd. (d) *M-C, tweeterspanning op f_s* — het tweede en scherpste geval, en het bewijs dat het patroon geen toeval was. De referentie gebruikte **hardgecodeerde sessie-banden** (4–10 kHz voor de tweeter, 0,7–1,5 kHz voor de mid) waar A4 om de uit de kruispunten afgeleide doorlaatband vraagt. Gevoed met precies die banden reproduceert de engine de oude waarden tot binnen **0,05 dB** (−24,65 / −33,26 / −34,47 tegen −24,6 / −33,3 / −34,5): het bandverschil is de volledige verklaring, er zit geen tweede oorzaak onder. Die reproductie staat als staande test in de golden-suite, met de sessieparameters in het referentiebestand in plaats van in de test. (e) *Verankerde gaps en grens-inversies* zijn geen acceptatiecriterium in F1: de eerste wacht op het doelcurve-object (A5e.2) omdat A5d.4(a) het ankerniveau ná baffle step wil, de tweede is een F2-referentie omdat A5d.6 zoekruimtegrenzen levert. Anker en haalbaarheidswaarschuwing reproduceren wél en blijven asserts.

  **Procesregel die hieruit volgt.** Een golden reference die een **band, een middeling of een grid** gebruikt legt die parameters expliciet vast in het referentiebestand. Zonder die parameters is de waarde niet reproduceerbaar, en een niet-reproduceerbare waarde is geen referentie maar een herinnering. Twee van de vijf herzieningen (W-M fase, M-C) waren dezelfde fout in verschillende vermomming, en in beide gevallen kostte het uren om achteraf te reconstrueren wat vooraf één regel had gescheeld. Het referentiebestand draagt sinds F1 zijn eigen herzieningsnotitie, zijn afgeleide tolerantieklassen mét motivering, en per herziene referentie de parameters van de ingetrokken waarde. Openstaande afwijkingen na F1: **geen**.

- V16 (de derde vermomming van V15, en een poort die zichzelf kan ontlopen) — bij de F2-oplevering.

  **(a) De bult-inversie stond op een sessieband.** `grens_inversies.maxL_bij_Rs0,5_budget2,5dB` = 2,65 mH bleek berekend op de band 40–110 Hz met normalisatie op 150 Hz — de hardgecodeerde getallen in `metrics5.py` — waar A4 M-D om B = [0,7·f_p, 2,2·f_p] met f_ref = 3·f_p vraagt. Gevoed met precies die sessieparameters lost de engine 2,71 mH op en ligt de bult bij de genoteerde 2,65 mH binnen de dB-tolerantieklasse van het 2,5 dB-budget; op de afgeleide conventie is de grens 2,43 mH. Exact het patroon van V15(a) en V15(d), nu voor de derde keer, en opnieuw had de engine gelijk. Het V12-tegenvoorbeeld ("bij Rs = 2 Ω is 2,5 dB met géén enkele L haalbaar") reproduceert wél onveranderd: de bult bij L = 0 is daar al 3,04 dB. De twee andere inversies reproduceren op hun eigen, nu vastgelegde parameters — de Qes-inversie exact op R_e = 2,90 Ω, de pad-R-inversie tot 0,011 Ω op de mediaan |Z| over de afgeleide doorlaatband met het genoteerde 4,1 dB-budget.

  **Bijvangst die vermelding verdient:** het casusboek draagt twéé lezingen van dezelfde R_e van het wooferpaar — 2,90 Ω (`Re_werkelijk_ca`, waar de Qes-inversie op staat) en 3,05 Ω (`compare.py`, waar de M-E-referentie op staat). Geen van beide is fout; wat fout was, is dat geen van beide referenties zei wélke zij gebruikte. Beide staan nu in het referentiebestand met hun herkomst.

  **(b) Een poort waarvan de referentie meebeweegt is geen poort.** M-C vergelijkt de spanning op f_s met de *doorlaatband*, en die band volgt uit de kruispunten. Wordt hij bij elke polish-stap opnieuw afgeleid, dan kan de optimizer de poort halen door het kruispunt te verplaatsen: de meetlat schuift mee met het ontwerp. De afgeleide parameters van een poort worden daarom bij aanvang van een run **bevroren** op het ontwerp waar de run mee begint, en de opgeleverde kandidaat wordt op *beide* conventies getoetst — op de bevroren banden én op de banden die zijn eigen kruispunten impliceren. Slagen voor de ene en zakken voor de andere is een bevinding, geen afrondingsverschil, en wordt als zodanig gerapporteerd.

  **(c) Een voorbound met speling mag het ontwerp waarop hij wordt losgelaten nooit zelf uitsluiten.** V12's tegenvoorbeeld (enkelvoudige serie-C-voorbound van 5–10 µF tegen een gerealiseerde 4e-orde midtak met 42 µF) is geen kalibratieprobleem van de verruimingsfactor: een grotere factor verplaatst de botsing alleen. De regel die de hele klasse wegneemt: een bound die als `slack` is gemarkeerd wordt verruimd tot de waarde die het ontwerp zelf draagt, met een notitie. De poort blijft de autoriteit, en die oordeelt over de f_s-spanning zelf in plaats van over een componentwaarde die daarvoor in de plaats staat.

- V17 (een diagnose die door mijn eigen rapport werd tegengesproken) — bij F2b, en het is een procesles, geen engineles.

  **Wat er gebeurde.** De 3-weg-scan op de demoset bleef minutenlang in `part audit (seed)` staan met een bevroren teller. Ik schreef dat toe aan de poortvraag die F2 in de audit-lus had gezet: elke vraag lost het hele netwerk op en integreert M-A, dus "de audit vraagt het per verwijderkandidaat" klonk sluitend. Het stond als vaststaand in het opleverrapport.

  **De tegenspraak stond in datzelfde rapport.** De v1-run die ik ter vergelijking had gedraaid — zónder poorten — bleef in *exact dezelfde stage* even lang hangen. Dat had de verklaring meteen moeten uitsluiten. Twee waarnemingen in één verslag, waarvan de tweede de eerste weerlegt, en ik heb ze niet naast elkaar gelegd. De poortvraag stond bovendien in de audit al ná de kwaliteitscheck, dus de veronderstelde herhaling bestond daar niet eens.

  **Wat de meting zegt.** Op de tweewegfixture, dezelfde seed, met en zonder poorten: **v1 3424 ms / 9538 sims, v2 2219 ms / 6144 sims, vier poort-evaluaties in de hele run.** De v2-run is niet trager maar *sneller*, en dat is geen meetfout maar het mechanisme: een poortweigering kapt een zoektocht af die anders was doorgelopen. Een harde grens bespaart werk zodra hij bijt — het omgekeerde van wat een strafterm doet, die de zoektocht juist door verboden gebied laat dwalen. Wat wél traag is op een groot 3-weg-netwerk is de seed-part-audit zelf, op v1 en v2 gelijk; bestaand gedrag, nu gemeten en als TODO vastgelegd.

  **Wat de teller ving dat een klok nooit had gevonden.** De acceptatie-eis was een *telling*, geen tijdmeting. Die telling klopte niet: zeven evaluaties tegen zes getelde. Oorzaak: `constraintViolation` — de A3f-backstop bij de reparatiepas, de snap en de eindcontrole — riep de poorthaak rechtstreeks aan, buiten cache en teller om. Eén ontsnapte aanroeppad, onzichtbaar voor elke tijdmeting en voor elk oog, gevonden door een assert die twee getallen vergeleek. Alles loopt nu door één `cachedGateViolation`. In dezelfde test zat mijn eigen tweede fout: de uniciteitscheck dedupliceerde op part-*id's* in plaats van op waarden, waardoor hij groen zou blijven op een cache die nooit raakt.

  **De etiket-schakel: waaróm het waarnemen faalde.** Beide misdiagnoses hingen aan één regel voortgangscode. `stage('value tune')` draait vóór `runAudit(parts, 'part audit (seed)')`, en niets zet het etiket daarna terug — dus élke hartslag gedurende de volledige waarde-tune rapporteert "part audit (seed)". Op een groot 3-weg-netwerk is dat de langste stage die er is. Daar bovenop zwijgt de hartslag tijdens `auditNetwork` zelf, dat zijn volle-grid-solves buiten de evaluatieteller om doet, zodat de sim-teller bevriest op precies het moment dat een lezer bewijs van leven zoekt.

  Het gevolg: de waarnemer ziet minutenlang een verkeerde stagenaam met een stilstaande teller, en concludeert "hang". Ik concludeerde bovendien "hang veroorzaakt door de nieuwe poortvraag in de audit-lus" — omdat het etiket letterlijk *audit* zei. Het etiket wees de verdachte aan. De UI deed niets fout; zij rendert getrouw wat de engine aanlevert, en de engine leverde de verkeerde naam. Vastgelegd als `TODO(observability)` op de plek van het etiket, met drie punten en een expliciete afbakening voor de sessie die het repareert: voortgangsberichten maken géén deel uit van het byte-invariant van het resultaat, dus labels en hartslag mogen vrij bewegen.

  **De regel die hieruit volgt.** Een prestatiediagnose is een bewering over een oorzaak, en die valt onder dezelfde bewijslast als een metriek (P1): eerst de grootheid meten, dan pas de vuistregel geloven. Een plausibel mechanisme dat de waargenomen vertraging verklaart is geen bewijs zolang de controlemeting — dezelfde run zonder de verdachte — niet is afgelegd. Ik had die controlemeting al gedaan en genegeerd. En een tweede, uit de etiket-schakel: **een diagnose die leunt op een voortgangsmelding erft de betrouwbaarheid van die melding.** Een stagenaam is geen meting.

- V18 (het dip-schouder-artefact, en waarom dezelfde fix twee keer niet dezelfde fix is) — bij F3, gevonden door de test die iets anders moest bewaken.

  **Het artefact.** Een residu is `curve − trend`, en een smalle DIP trekt de trend met zich mee omlaag. Aan wéérszijden van die dip ligt de curve daardoor bóven de verlaagde trend en wordt het residu positief. Een detector die alleen naar kruinen in het residu kijkt rapporteert élke smalle dip dus als **twee pieken**, die hem flankeren, elk ruwweg een kwart van de dipdiepte. Gemeten op een synthetische dip van 4 dB, 1/20 octaaf breed, op 5 kHz: pieken op 4485 en 5597 Hz, beide +0,95 dB.

  **Hoe hij gevonden werd, en door wat.** Niet door een prestatieklacht en niet door een oog op de code, maar door acceptatietest (d) van F3 — de test die het *smaakprincipe* moest vastleggen: smalle piek rapporteren, smalle dip vergeven. Die test voerde een dip in en verwachtte een lege kolom, en kreeg er twee pieken terug. **De test die het principe bewaakte, bewaakte de detector.** Dat is het argument voor asymmetrische acceptatietests in één zin: een test die alleen het verwachte geval voert, ziet de spiegeling van zijn eigen aanname nooit.

  **De remedie, en waarom zij niet overal geldt.** Op de F3-systeemsom is de oplossing eenvoudig: een piek is een lokaal maximum van het residu **én** van de respons. Op de schouders van een dip is de respons monotoon, dus die vallen af; elke echte piek blijft. De som is nominaal vlak, en dat is precies wat de test geldig maakt.

  Op de **breakup-scan** (A5b.2) werkt geen van beide remedies, en dat is gemeten voordat het werd opgeschreven:
  - *"Eis ook een lokaal maximum van de curve."* Sloopt echte breakups. Een breakup zit op een respons die ergens heen gaat: op de afval van een woofer *vlakt* een conusresonantie de daling af, hij keert hem niet om. Casus 1's gedocumenteerde +3,2 dB-piek op 1395 Hz verdween.
  - *"Verwerp een kruin waarvan het naburige residu-minimum dieper is dan de kruin hoog is."* Sloopt ze óók, en de data zegt waarom: diezelfde 1394 Hz-kruin leest +3,25 dB tússen minima van −4,54 en −5,74 dB. Op een rimpelende driverrespons is een kruin tussen twee diepe dalen geen artefact — zo ziet een breakup eruit.

  **Wat er op het spel stond.** Die 1395 Hz-detectie is niet decoratief: met de ernst-weging (3,2 dB → divisor 2,53) zet zij het plafond van het woofer-mid-kruisvenster op **551 Hz**, en `plafond_bindend: "breakup_ernst"` in het referentiebestand zegt dat het de énige binding op die bovengrens is. Een filter dat een kwart van de echte detecties wegneemt om dit artefact te verwijderen, zou de app het enige argument ontnemen dat zij heeft om dat kruispunt laag te houden. En de tegenwerping "op 1395 Hz is de woofer toch 35 dB onderdrukt" is precies de vuistregel die M-H vervangt: de vervorming ontstaat ín de driver, ná het filter, dus elektrische demping raakt haar niet.

  **De regel die hieruit volgt.** Twee scans met dezelfde formule zijn niet twee instanties van hetzelfde probleem. De geldigheid van een detectorregel hangt aan de vórm van de curve waarop hij draait — nominaal vlak of nominaal hellend — en een remedie overzetten zonder die vorm te toetsen is hoe een bugfix een regressie wordt. Het artefact blijft in de breakup-scan bewust staan, met de meting erbij, begrensd doordat een flankkruin ongeveer een kwart van de dipdiepte is en er dus een notch van meerdere dB nodig is om de rapportagedrempel te halen.

- V19 (waar een referentie een FUNCTIE van is — de classificatie van casus 1) — bij F4a, en het is een sessie zonder één gedragswijziging.

  **Waarom.** De audit (`docs/audit_engineV2_optimizerV1_grens.md`, §6 en §8) stelt vast dat engine v2 vandaag alleen WAARDEN begrenst: welke kandidaten er zijn beslist `crossover3Variants` stroomopwaarts, vóór de v1/v2-splitsing. Zodra v2 eigen kandidaten genereert (F4d) levert dat legitiem andere netwerken op, en elke golden reference die een eigenschap van de ZOEKTOCHT vastlegt in plaats van natuurkunde gaat dan rood — precies op het moment dat de acceptatie-autoriteit nodig is. V15 schreef die les op voor een eigenschap van één meetsessie; dit is dezelfde fout één laag lager, voor een eigenschap van één engine. De vraag was dus niet "klopt het getal" maar "waar is het getal een functie van".

  **De drie klassen.** A = (metingen) → waarde, engine-onafhankelijk. B = (metingen, gegeven netlist) → metriek, berekend op een vaste netlist die als BESTAND in `test-fixtures/casus1/` staat. C = (metingen, zoektocht) → uitkomst: een kruispunt dat een zoektocht koos, componentwaarden waarop zij uitkwam, de score van een run, de samenstelling van een shortlist.

  **De uitkomst, en zij was niet de verwachte.** Van de 272 bladeren van het referentiebestand zijn er 204 waardedragend (de rest is proza en bestandsboekhouding). Daarvan zijn er **123 klasse A**, **71 klasse B**, **0 klasse C**, plus 10 tolerantieklassen — die geen klasse dragen, want een tolerantie is nergens een functie van maar een besluit met een motivering. **Er is niets gedegradeerd, omdat er niets te degraderen viel.**

  De reden is één ontwerpbesluit dat al lang geleden goed is uitgevallen: **de drie kandidaten van casus 1 zijn als netlist-BESTAND bevroren, niet als uitkomst van een run.** `manifest_en_geometrie.netlists` noemt drie `.adsfilter.json`-bestanden die sinds `b04f9fa` onveranderd in de repo staan; `casus1Filter` leest ze van schijf en `buildReport` rekent erop. Geen enkele test die een casus-1-referentie consumeert draait een zoektocht — nagelopen met `grep` op `optimizeNetworkValues`, `crossover3Variants`, `handleV2Request` en `runV2Chain3` over alle acht consumerende testbestanden. Wat de audit vreesde bestaat voor deze casus dus niet.

  **Dat is een bevinding en geen opluchting.** Zij is pas waar sinds iemand het heeft nagekeken, en niets hield haar waar. Twee dingen doen dat sinds F4a wél: elke referentie draagt de velden `klasse` en `afhankelijkheid` (letterlijk `meting`, `meting+netlist` of `meting+zoektocht`), en `src/lib/engine2/goldenClassification.test.ts` faalt op een blok zonder klasse, op een klasse die niet bij haar afhankelijkheid past, op een klasse C buiten `v1_baseline`, en op een bronbestand dat een `v1_baseline`-waarde leest. Het lege `v1_baseline`-blok draagt de commit waarop de classificatie is gedaan (`b137f1d`) plus de herleiding: de kandidaatgeneratie bewoog het laatst bij `61a3ea4`, de tuner bij `c7030ab`. F4d kan zijn eigen uitkomst ernaast leggen zonder ergens een acceptatiecriterium te vinden dat er geen mocht zijn.

  **Wat de classificatie wél opleverde: negen ontbrekende parameterblokken.** Klasse bepalen dwingt je te lezen waar een getal vandaan komt, en dan valt op wat er niet staat. **Veertien** van de 46 referentiegroepen in de tabel hieronder bleken een BAND, een GLADDING of een RASTER te gebruiken die alleen in de code stond — precies wat de V15-procesregel verbiedt. Zij zijn *herdefinieerd* en ondergebracht in **negen** parameterblokken; negen en niet veertien, omdat de vier SPL-scans (breakups, persistentie, richting, diffractie) er aantoonbaar één delen. De waarden zijn onaangeraakt gebleven en de parameters staan er nu bij — mechanisch geverifieerd: van de 272 bestaande bladeren is er geen enkele van waarde veranderd. De overige 31 groepen zijn *behouden* (14 + 31 = 45), en de zesenveertigste rij is het lege baseline-blok.

  De scherpste drie:
  - **De SPL-scans** (`_spl_scan_parameters`). Breakups, richtings-persistentie, de richtingsverhouding en de diffractierimpel draaien alle vier tegen dezelfde 1/2-octaaftrend op hetzelfde 500-punts logaritmische raster, geclipt op de eigen geldigheidsband van de driver. Geen van die drie stond in het bestand — terwijl **V8c letterlijk vastlegt dat dezelfde conusresonantie +0,7 of +3,2 dB leest naargelang die band**, en het kruisplafond van 551 Hz aan dat verschil hangt. De meest bandgevoelige referentie in het boek droeg haar band niet.
  - **M-E** (`_M_E_parameters`). `Qes_mult` deelt door R_e, en het casusboek draagt twee lezingen van dezelfde R_e van het wooferpaar (V16: 2,90 en 3,05 Ω). Welke van de twee eronder lag stond in een zin in V16 en in een constante in de testfixture — `CASUS1_WOOFER_DC_OHM = 3.05`. Een parameter die alleen in code bestaat is exact wat V15 verbiedt, en de test vergelijkt de twee nu.
  - **M-F-interim** (`_M_F_interim_parameters`). λ = d·f/c, en wélke d stond nergens. Het onderste paar gebruikt niet de 261 mm tussen wooferpaar en mid maar de **275,8 mm ARRAY-afstand binnen de wooferweg** — het paar is één weg met twee bronnen, en de bronscheiding die de lobe maakt zit binnen die weg. Op HUIDIG is dat 0,289 tegen 0,274 λ: buiten de λ-klasse van 4 %, dus een andere grootheid en geen afronding. *(Bij V20 herzien: het blok draagt nu alle vier de afstanden, en de vraag welke van de twee juist was is beantwoord door haar te verwerpen.)*

  De andere zes: de directe R_e-aflezing (mediaan over de laagste 2,5 % van de punten — genoemd in proza bij woofer en tweeter, en bij de mid nergens), de spreekspoelfit (band = één decade boven de hoogste motionele resonantie), de verankerde gaps (energiegemiddelde tussen de overnames, met de overname als meetkundig midden van het A5d.3-venster), de kruisvensters (orde-factor 1,4, de ongekalibreerde ernst-divisors 3,0/2,0 en de casusboek-c-t-c), M-A/M-B (het volle poortvrije analyseraster en de IEC 60268-1-weging) en de vensterinteractie (KAND_B, en een fasehelling over een vol octaaf rond het kruispunt).

  **De grens tussen "herdefiniëren" en "niet aanraken".** V15 gaat over een band, een middeling of een raster. Detectiedrempels — `RESONANCE_MIN_Z_OVER_RE`, de fasenul-hoek, de reflex-dipfractie — zijn géén V15-geval: zij zijn schattergedrag, en dat wordt gedekt door de schatter-versionering (`z-re@1.1`) en door casus S1. Die scheiding aanhouden is wat verhinderde dat "elke referentie krijgt parameters" ontaardde in het overschrijven van de hele engine in JSON.

  **De les die overblijft.** Een referentie zonder klasse is een getal waarvan niemand weet wat het overleeft. Dat casus 1 er goed uit komt, komt doordat haar kandidaten bestanden zijn — en dat is een eigenschap van hoe de fixtures zijn aangelegd, niet van hoe het bestand is geschreven. Een volgende casus die kandidaten als RUN-uitkomst vastlegt, krijgt het probleem dat de audit voorzag, en krijgt het stil. Vandaar de regel in `.claude/skills/casus-toevoegen/SKILL.md`: elke nieuwe referentie draagt klasse en afhankelijkheid, en klasse C mag alleen onder `v1_baseline` of een toekomstig `v2_baseline` staan.

  **Openstaand, en bewust niet in F4a opgelost.** Er is geen tolerantieklasse voor graden-per-octaaf; `goldenCasus1.test.ts:611` draagt daarom zijn eigen 15 %, en dat is dezelfde soort fout als een test die zijn eigen dB-klasse meesleept. Een klasse vaststellen is een besluit met een motivering en geen classificatie, dus het is genoteerd in `vensterinteractie.parameters.openstaand_tolerantie` en wacht op de sessie die het neemt.

  **De inventarisatietabel.** Vijf kolommen: referentie, klasse, consumerende test, besluit, reden. `gCT` = `src/lib/engine2/goldenCasus1.test.ts`, `bIT` = `src/lib/engine2/optimizer/boundInversions.test.ts`, `cST` = `src/lib/engine2/optimizer/casus1Shortlist.test.ts`, `mWT` = `src/lib/engine2/manualWindowAndLobing.test.ts`, `fix` = `src/lib/engine2/casus1.fixture.ts`, `gClT` = `src/lib/engine2/goldenClassification.test.ts`.

| referentie | kl. | consumerende test | besluit | reden |
|---|---|---|---|---|
| `toleranties.*` (10) | — | gCT:134-149 | behouden | Geen referentie maar de aanvaardingsbreedte VAN referenties; nergens een functie van. |
| `afgeleide_parameters.woofer.Re` / `.mid.Re` / `.tweeter.Re` | A | gCT:162, 323, 384 | behouden | Motionele fit; band, weging en startpunten staan volledig in `re_fit_parameters`. |
| `..woofer.Re_naief`, `.mid.Re_direct`, `.tweeter.Re_direct` | A | gCT:166, 389 | **herdefinieerd** | Venstermiddeling waarvan het venster (laagste 2,5 % van de punten, mediaan) alleen in proza stond, en bij de mid nergens. |
| `..*.Re_motionele_rok_ohm` (3) | A | gCT:171, 262 | behouden | Uit de gefitte tak zelf; de fitband staat in `re_fit_parameters`. |
| `..*.Re_fit_residu`, `..*.Re_fit_bandgevoeligheid_ohm` (6) | A | gCT:244-249 | behouden | Fitkwaliteit met eigen tolerantieklasse en volledige parameterset (F3b). |
| `..*.Re_fit_band_hz` (3) | A | gCT:253-259 | behouden | De band zelf, expliciet — dit ís de V15-parameter. |
| `..woofer.Re_werkelijk_ca` | A | gCT:163 | behouden | Meterlezing van het parallelle wooferpaar; herkomst genoteerd. |
| `..woofer.fL` / `fb` / `fH` / `Zdip` | A | gCT:176-179 | behouden | Reflex-classificatie over de hele sweep; schattergedrag zit in de versiestring. |
| `..woofer.Q_bovenpiek` | A | gCT:294 | behouden | Open referentieniveau van de −3 dB-punten is al gemotiveerd in `toleranties_toelichting.Q_pct`. |
| `..woofer.breakup.{f,dB,Q}`, `..mid.breakups` (5) | A | gCT:312-315, 353-357 | **herdefinieerd** | Trendbreedte, scanraster en band ontbraken — juist de referentie waarvan V8c zegt dat zij bandgevoelig is. |
| `..mid.persistentie_30gr` (5) | A | gCT:358-365 | **herdefinieerd** | Zelfde scan plus een ±1/6-octaaf zoekvenster; geen van beide stond er. |
| `..mid.dir_m3_30` / `dir_m6_30` | A | gCT:373-374 | **herdefinieerd** | De VERSCHILcurve wordt gegladd op dezelfde trend; gladding en raster ontbraken. |
| `..mid.fc` / `Zmax` / `r0` / `Qmc` / `Qec` / `Qtc`, `..tweeter.fs` / `Zmax` / `r0` | A | gCT:326-331, 390-392 | behouden | Gesloten-classificatie over de hele sweep. |
| `..*.semi_inductantie_n` (2) | A | gCT:296, 332 | **herdefinieerd** | Fitband (één decade boven de hoogste resonantie) en de weigergrenzen stonden alleen in de code. |
| `..*.NF_fmax` (2) | A | gCT:302, 333 | behouden | Keele over de getagde diameter; de diameter staat in het manifest. |
| `..woofer.FF_vloer_header` | A | gCT:303 | behouden | 1/T uit de header; de headertijden staan in `manifest_en_geometrie.ff_headers`. |
| `..tweeter.diffractie_rimpel_rms_dB`, `..dominante_omweg_mm` | A | gCT:393-398 | **herdefinieerd** | RMS-band, log-raster, 1024-punts lineaire transformatie, Hann-venster en de 4-perioden-ondergrens ontbraken alle vijf. |
| `..tweeter._Re_sessie_25_08.waarde` / `.r0` | A | gCT:389 | behouden | Ingetrokken waarde mét haar schatter — de V15-vorm zelf. |
| `verankerde_gaps_dB.anker` | A | gCT:580 | behouden | Acceptatiecriterium; reproduceert, en nagemeten identiek op alle drie de netlists (gClT). |
| `verankerde_gaps_dB.woofer_tov_mid` / `.tweeter_tov_mid` | A | gCT:587 (status), 590-591 | **herdefinieerd** | Niveaubanden (energiegemiddelde tussen de overnames, overname = meetkundig venstermidden) ontbraken. |
| `kandidaten.*.minZ` / `.minEPDR` (6) | B | gCT:420-421 | **herdefinieerd** | Zoekt een minimum over het HELE poortvrije analyseraster; band noch raster stond er. |
| `kandidaten.*.dissipatie_pct`, `.R8_W_bij_100W` / `.grootste_R_W_bij_100W` (6) | B | gCT:426-431 | **herdefinieerd** | IEC-weging, normalisatie op aangenomen vermogen en het raster ontbraken. |
| `kandidaten.*.Qes_mult` (3) | B | gCT:436-440 | **herdefinieerd** | Deelt door R_e = 3,05 Ω, een waarde die alleen in `fix:281` en in een zin van V16 bestond. |
| `kandidaten.*.lf_bult_extra_dB` (3) | B | gCT:454-458 | behouden | Band en referentie afgeleid uit f_p; vastgelegd in `grens_inversies.parameters.maxL_bult`. |
| `kandidaten.*.lobing_{wm,mt}_*_lambda` (27, was 6) | B | gCT:461-499 | **herdefinieerd bij F4a, hernoemd en uitgebreid bij V20** | Wélke c-t-c stond nergens, en het onderste paar gebruikte de array-afstand en niet de paarafstand. V20 beantwoordt dat: er zijn vier afstanden en de metriek kiest er geen. `lobing_wm_lambda` heet nu `lobing_wm_binnen_weg_lambda`, waarde en klasse ongewijzigd. |
| `kandidaten.*.V_tweeter_op_fs_dB` (3) | B | gCT:445-449 | behouden | Doorlaatband afgeleid uit de eigen kruispunten (F1-conventie, genoteerd in `_V_tweeter_op_fs_dB_opmerking`). |
| `kandidaten.*.wm_fase_oct` / `.mt_fase_oct` (6) | B | gCT:473-481 | behouden | ±1 octaaf geclipt op de geldigheidsband; de conventie staat in `_wm_fase_oct_opmerking`. |
| `kandidaten.KAND_B_3e.lobing_eind_dip_15gr` | B | gCT:488-489, mWT:66-68 | behouden | Het ±15°-venster staat in de sleutelnaam, de akoestische centra in de geometrie. |
| `kandidaten.KAND_B_3e.rms_vlakheid_dB` / `.spl_venster_pm_dB` | B | cST:83-92 | behouden | Volledige parameterset in `_F3_respons_oordeel` (doelcurve, gladding, band, raster). |
| `kandidaten._F3_respons_oordeel.overige_kandidaten.*` (4) | B | cST:95-102 | behouden | Idem, en de kolom smalle pieken is expliciet leeg gemeld (cST:117-121). |
| `kandidaten._F3_respons_oordeel.{gladding,band_hz,grid}` | B | cST:70-79 | behouden | Dit zijn de V15-parameters zelf. |
| `kandidaten._V_tweeter_op_fs_dB_sessie_25_08.*` (11) | B | gCT:495-530 | behouden | Ingetrokken waarden mét sessieband, middeling, raster en f_s-afronding. |
| `kruisvensters.woofer_mid_orde4.*` | A | gCT:537-546 | **herdefinieerd** | Orde-factor, ernst-divisors, significantiedrempel en c-t-c ontbraken; de sleutelnaam draagt de orde, en een naam is geen parameter. |
| `kruisvensters.mid_tweeter_orde4.*` | A | gCT:548-557, 559-576 | **herdefinieerd** | Idem. |
| `grens_inversies.maxRs_Qmult1_3/1_5/2_0_ohm` | A | bIT:78-91 | behouden | Volledige parameterset sinds F2, inclusief wélke R_e-lezing. |
| `grens_inversies.maxL_bij_Rs0_5_budget2_5dB_mH` | A | bIT:139-160 | behouden | Band uit f_p, budget en pad-R expliciet; assert op de metriek, niet op de mH. |
| `grens_inversies._maxL_sessie_25_08.*` (5) | A | bIT:162-196 | behouden | Ingetrokken waarde met haar sessieband — de V15-vorm. |
| `grens_inversies.max_padR_tweeter_gap_ohm` + `parameters.max_padR.*` | **B** | bIT:200-208 | behouden | De impedantiemediaan is meting, maar de doorlaatband komt uit de kruispunten van HUIDIG; herkomst stond er al. |
| `grens_inversies.parameters.voorbound_serie_C.*` | **B** | bIT:212-270 | behouden | `gerealiseerd_uF`/`_orde` zijn eigenschappen van de netlist KAND_B (C1 = 42,0 µF); geen acceptatiewaarde maar een mechanisme-eis. |
| `vensterinteractie.midband_octaaf`, `.drie_bronnen_zone`, `.fase_doorkoppeling_...` | B | gCT:600-613 | **herdefinieerd** | Kandidaat (KAND_B) en de venstervorm van de fasehelling stonden er niet; op HUIDIG leest hetzelfde blok 2,65 okt en −127 °/okt. |
| `manifest_en_geometrie.bestanden.*` (24) | A | fix:209-215 | behouden | Meetmanifest — projectinvoer, geen afleiding. |
| `manifest_en_geometrie.ff_headers.*` (3) | A | mWT:156-162 | behouden | Headertijden uit de meetbestanden. |
| `manifest_en_geometrie.geometrie.*` (14) | A | fix:238-262 | behouden | Kastgeometrie; c-t-c-herkomst sinds F3c expliciet toegeschreven. |
| `manifest_en_geometrie.netlists.*` (3) | A | fix:287 | behouden | **De reden dat er geen klasse C is:** de kandidaten zijn bestandsnamen, geen runuitkomsten. |
| `re_fit_parameters.*` (6 waarden) | A | gCT:272-288 | behouden | De V15-parameters van de motionele fit. |
| `v1_baseline.referenties` | C | gClT (verbiedt lezen) | — | Leeg bij F4a; niets viel te degraderen. |

- V20 (welke afstand geldt voor lobing tussen een weg met N bronnen en de aangrenzende weg?) — opgeworpen bij F4a, **beantwoord op 27-08-2026 door de vraag te verwerpen**.

  **De vraag zoals F4a haar stelde.** M-F-interim rekent λ = d·f/c op het kruispunt. Voor het paar wooferarray → mid gebruikte de engine de **array-afstand** (275,8 mm, tussen de twee woofers onderling) en niet de **paarafstand** (261 mm, tussen wooferpaar en mid). Op HUIDIG scheelt dat 0,289 tegen 0,274 λ — buiten de λ-tolerantieklasse van 4 %, dus twee verschillende grootheden en geen afronding. F4a legde de gemaakte keuze vast in het referentiebestand en liet de vraag welke van de twee JUIST is expliciet open.

  **Het besluit.** Geen van beide, en de vraag zelf deugde niet. Voor lobing tussen twee wegen bestaat **geen enkele afstand die een weg met N bronnen samenvat**; elke keuze uit de kandidaten is een aanname die zich als meting voordoet. Daarom:

  a. **De verticale synthese is de autoriteit** voor lobing tussen wegen — alle bronnen, alle z-offsets, alle akoestische centra, de doelhellingen van de kandidaat. Zij is de énige lobing-grootheid waar een gebruikers-eis of een kandidaat-oordeel aan mag hangen. Referentie: `kandidaten.KAND_B_3e.lobing_eind_dip_15gr` (−3,9 dB @ ~3,5 kHz).
  b. **λ-fracties zijn rapportage/screening.** Voor een weg met N bronnen tegenover de aangrenzende weg worden er **drie** gerapporteerd — tot de dichtstbijzijnde bron, tot het amplitudegewogen zwaartepunt, tot de verste bron — plus **de grootste onderlinge scheiding binnen de weg** als aparte grootheid. Amplitudeweging komt uit de aansturing; parallel = gelijk, en de metriek meldt dat zij die gelijkheid heeft aangenomen in plaats van er stil een 1 voor te schrijven. Nergens een aanname van N = 2 of van drie wegen.
  c. **De bestaande `lobing_wm_lambda` mat de binnen-de-weg-scheiding en heette verkeerd.** Hernoemd naar `lobing_wm_binnen_weg_lambda`; waarde (0,29 / 0,36 / 0,36) en klasse (B) ongewijzigd. Een afleidingsfout in de naamgeving, geen rekenfout — en dáárom is de waarde behouden in plaats van herzien. `lobing_mt_lambda` is niet hernoemd: mid en tweeter zijn elk één bron, en dan is hij een echte tussen-de-wegen-fractie.

  **Waarom casus 1 de oude vraag niet kon beslechten, en de nieuwe wél illustreert.** F4a merkte op dat 0,289 en 0,274 allebei in de gunstige zone vallen, zodat de ontwerpbeslissing er niet van kantelt. Dat blijft waar voor die twee getallen, en het is precies waarom zij samen te weinig waren. De vier fracties bij het kruispunt van de kandidaten zetten dat op scherp:

  | | HUIDIG (f_x = 360 Hz) | KAND_B (f_x = 447 Hz) |
  | --- | --- | --- |
  | dichtstbijzijnde bron (261,3 mm) | 0,274 λ | 0,340 λ |
  | amplitudegewogen zwaartepunt (399,2 mm) | 0,419 λ | 0,520 λ |
  | verste bron (537,0 mm) | **0,563 λ** | **0,699 λ** |
  | binnen de wooferweg (275,7 mm) | 0,289 λ | 0,359 λ |

  Eén handover, vier fracties, en zij liggen op HUIDIG een factor twee uit elkaar. De verste-bron-lezing landt op 0,563 λ — midden in de zone die de oude score de ongunstigste noemde — terwijl de dichtstbijzijnde op 0,274 λ in de gunstige zone ligt. **Beide getallen zijn juist en zij zeggen tegengestelde dingen**, omdat het twee verschillende afstanden zijn tussen dezelfde twee wegen. De oude implementatie rapporteerde er één (0,289) en de discussie ging over de vraag of dat er 0,274 had moeten zijn — terwijl de lezing die er in de buurt van een oordeel komt, 0,563, in geen van beide voorstellen voorkwam. Dat is de eigenlijke vondst van V20: de keuze tussen twee kandidaten verborg een derde.

  Wat daaruit volgt is niet dat KAND_B slechter is dan hij leek. Het volgt dat je het aan deze getallen niet kunt zien, en daarvoor bestaat de synthese: die zegt voor KAND_B −3,9 dB op ±15° in het kruisgebied, en dát is de uitspraak waar een oordeel op mag staan.

  **De niet-monotone zonescore is vervallen en heeft geen vervanger.** Hij scoorde precies de ene λ waarvan hierboven blijkt dat zij niet te kiezen is; een curve over een niet te kiezen getal is een oordeel dat op een aanname rust. De kennis die erin zat gaat niet verloren — de twee verzoende vakregels staan in V5, en de knopen zelf staan hier, zodat een toekomstige screening ze kan oppakken zonder ze opnieuw af te leiden: (0,00 → 0,00), (0,25 → 0,15), (0,60 → 1,00), (1,00 → 0,25), (1,40 → 0,35), (2,00 → 1,00), stuksgewijs lineair in λ. **Wat er niet meer mag:** een poort, een budget of een shortlist-criterium op een λ-fractie. Dat is een blijvend verbod en geen momentopname.

  **Wat er in de code veranderde, en wat nadrukkelijk niet.** Nieuw: `metrics/lobing.ts` (pure functies, versie `lobing-lambda/2.0`, geldigheidspropagatie vanuit het kruispunt van de kandidaat), `Geometry.waySources` (waar élke straler zit, per weg), en `sourcesFromArray` in de adapter — die laatste bouwt posities uit **aantal + spacing + akoestisch centrum**, en dus alleen waar het aantal bekend is. Een array-afstand op zichzelf blijft géén invoer voor deze metriek: een afstand zegt niet hoeveel stralers zij scheidt, en er twee van maken zou de N = 2-aanname terugbrengen langs de achterdeur. Onaangeraakt: de synthese zelf (`verticalLobing`), de v1-route, en elke poort en elk budget. Het gedrag verandert uitsluitend in de rapportagelaag.

  **Waar het meetfeit vandaan komt dat dit mogelijk maakte.** De twee wooferposities staan al sinds de eerste sessie afzonderlijk in het referentiebestand (`z_offset_mm.woofer_boven` en `.woofer_onder`); de fixture middelde ze weg vóórdat een metriek ze zag. Dat gemiddelde is nog steeds juist voor de synthese — die wil één akoestisch centrum per tak — en het was fout voor de fracties, die juist bestaan omdat een weg met twee stralers op meer dan één afstand van zijn buur staat. De gegevens waren er dus al; wat ontbrak was een metriek die ernaar vroeg. **Bijvangst, en zij is als test vastgelegd:** de dichtstbijzijnde-afstand die uit de z-offsets volgt (261,3 mm) ís de paarafstand die het casusboek los noteert (`ctc_mm.woofer_mid` = 261), en de binnen-de-weg-scheiding (275,7 mm) ís `ctc_mm.woofer_woofer` (275,8). Twee onafhankelijk opgeschreven getallenreeksen die samenvallen tot op de afronding — als zij ooit uiteenlopen weet niemand meer met wélke een referentie berekend is, en dat is de F3c-les over herkomst toegepast op de enige plek waar dezelfde afstand twee keer is opgeschreven.

  **Wat haar alsnog zou kunnen bijstellen.** Een verticale meting over het kruisgebied van een weg met twee bronnen, waarvan de gemeten dip zegt welke van de vier fracties het gedrag verklaart. Dat zou de fracties niet tot een keuze terugbrengen — het besluit onder (a) hangt daar niet van af — maar het zou wél zeggen welke van de vier het meest voorspellend is, en dat is een nuttige rangorde in de **rapportage**. Op deze meetset ligt die meting er niet. **Gesloten wat het besluit betreft; open als verfijning.**

- V21 (de ingevoerde DC-weerstand kwam nooit aan — één hiërarchie, twee implementaties) — bij F4b, en het lek was drie fasen oud.

  **Wat het was.** `V2RunSettings.reOhmByModel` bestond sinds F2, werd sinds F2 gelezen (`worker.ts`, `measurementFacts`), en werd door niemand ooit gevuld — `grep -rn "reOhmByModel" src/` gaf uitsluitend treffers in `worker.ts` zelf. Het A5a-formulierveld dat de ontwerper invult ging een andere kant op: `App.tsx` → `AdapterBranch.measuredReOhm` → `buildEngineV2Input` → `buildReport`, en daar hield het op. **De hele F3b-verbetering was rapportage-only.**

  **Waarom de terugval niet onschuldig was.** De worker riep `estimateRe(curve)` aan zónder opties, en `impedance.ts` schakelt de motionele fit alleen in als `opts.fundamentalHz` én `opts.motionalPeaks` gezet zijn. Beide ontbraken per constructie — de worker heeft de geclassificeerde resonanties niet, die zitten in de opnamepas — dus de fit was altijd `null` en de **directe aflezing** won altijd. Op het wooferpaar van casus 1 is dat 3,81 Ω tegen een opgeloste 2,90 Ω. De M-E-inversie `R_s ≤ R_e·(q−1)` is lineair in R_e, dus de grens stond **32 % te ruim**, terwijl het paneel ernaast het juiste getal toonde. Eén hiërarchie, twee implementaties, en zij waren het oneens.

  **Hoe aangetoond.** Door de échte route: `handleV2Request` met de payload eerst door `structuredClone`, en de assert op de `R_e_ohm` en `R_e_source` die de opgeleverde `qes-series-r`-grens meedraagt. Zonder payload leest die bron letterlijk "no resolved R_e reached this run"; mét payload staat de doorgegeven waarde er verbatim in en is de grens `R_e·(q−1)` daarvan. Het getal in de test is de eigen aflezing van de fixture maal een factor — geen enkele Ω-waarde staat in de test.

  **Wat gewijzigd is.** De opnamepas blijft de énige plek waar A5c.1 gelopen wordt; de worker leidt niets meer opnieuw af. `measurementFacts.ts` (nieuw) draagt de opgeloste R_e mét zijn herkomsttekst over de grens, `App.tsx` vult hem bij `v2ScanSettings` uit het rapport dat er toch al ligt, en de sleutelvertaling gaat via `driverIds` + `canonicalModelForRole` — het rapport spreekt netlist-modelnamen, de worker canonieke, en dat zijn niet dezelfde. De terugval in de worker is **niet** verwijderd (de route zonder rapport heeft hem nodig) maar loopt alleen nog als de payload niets levert, en zegt dat dan in `collect.notes`. Sinds F4b heeft dat notitiekanaal ook een scherm: `App.tsx` verzamelt de notities van de kandidaten, ontdubbelt ze en toont ze bij de scanuitslag. **Een kanaal zonder lezer rapporteert niets — dat is hoe dit lek en V23 samen drie fasen overleefden.**

  **De vingerafdruk.** Nieuw ingrediënt `facts` (A5e.4): een run op de opgeloste feiten en een run op de terugval waren tot F4b niet te onderscheiden — zelfde seed, zelfde ontwerp, zelfde vingerafdruk, en één van de twee deelde door het verkeerde getal. De herkomst zit erin naast de waarde, want 2,90 Ω van een meter en 2,90 Ω uit een fit zijn dezelfde grens en een andere bewering. `determinism.test.ts` weigerde de build tot het nieuwe ingrediënt zijn eigen mutatie kreeg — precies waarvoor die dekkingsassert bestaat.

  **Acceptatie op casus 1.** De R_e die de grens oversteekt IS het getal waar de klasse-B-referentie `kandidaten.*.Qes_mult` door deelt: `factsForWorker(...).reOhmByModel.woofer` gelijk aan `kandidaten._M_E_parameters.R_e_ohm` uit het referentiebestand — het parameterblok dat F4a moest aanleggen omdat die waarde tot dan alleen in een constante in de fixture bestond. Eén R_e, één herkomst, aan beide kanten van de grens. Zonder ingevoerde waarde steekt de **motionele fit** over en aantoonbaar niet de directe aflezing (het verschil ligt buiten de ohm-klasse) — het getal dat de worker met eigen middelen nooit kon bereiken.

  **Waarom de v1-route niet geraakt is.** Alles wat hier beweegt zit in `engine2/` en in de v2-tak van `App.tsx`. `optimWorker.ts` is byte-onaangeraakt en importeert nog steeds niets uit `engine2/`; `netOptimizer.ts`, `threeWayChain.ts` en `designChain.ts` zijn niet gewijzigd. Met de vlag uit bestaat `v2ScanSettings` niet en is `engineV2Report` `null`, dus de payload wordt niet eens opgebouwd. `toggleRegression.test.ts` blijft byte-identiek.

- V22 (de meetgeldigheid werd bij de grens weggegooid — V15, één laag lager) — bij F4b.

  **Wat het was.** `worker.ts` zette `validHz[model]` op `[grid[0], grid[grid.length-1]]`: het hele analyseraster, voor élke driver. De A5b.1-geldigheidsintervallen — 1/T uit de meetheader, geclipt op de omvang van de bestanden — staken de grens niet over. `freezeGateReference` kreeg dat raster mee, en `passbandOf` klemt de doorlaatband aan **beide** kanten op precies die "fallback" (`analysis.ts`: `[Math.max(lo, fallback[0]), Math.min(hi, fallback[1])]`). Met het volle raster is die klem inert, dus de bevroren doorlaatbanden en elke inversie die er een leest oordeelden ook op frequenties waarvan de meting zelf zegt dat ze er niet zijn.

  **Waarom dit V15 is en geen nieuw soort fout.** V15 legde vast dat een referentie die een band gebruikt die band moet meedragen, anders is zij niet reproduceerbaar. Hier gebruikt een *grens* een band, en die band werd bij de overdracht vervangen door een ruimere — dezelfde fout één laag lager: niet "de referentie vergat haar band" maar "de route gooide haar band weg". En net als bij V15 had de engine gelijk en de route ongelijk: de opnamepas had het interval correct afgeleid.

  **Hoe aangetoond.** Met een fixture waarin raster en geldigheid *bewust* verschillen: de gemeten tweeter-impedantie wordt boven een gekozen plafond maal acht genomen, en het plafond wordt als geldigheidstop meegegeven. De M-C-voorbound draagt de mediane |Z| over de doorlaatband als parameter, dus het effect is direct afleesbaar — **45,7 Ω zonder interval tegen 5,8 Ω met interval**, en de grens zelf beweegt mee. De onderkant van de sweep blijft schoon, met opzet: daar wonen de directe R_e-aflezing en de resonantieclassificatie, en die vervuilen zou de run laten falen om een reden die niets met geldigheid te maken heeft. Een interval dat *ruimer* is dan het raster wordt op het raster geklemd en niet geloofd — een array houdt op waar hij ophoudt.

  **Wat gewijzigd is.** `validHzByModel` in de payload, gevuld uit `d.onAxis.bandHz` van het rapport; in de worker komt `validHz[model]` daaruit, geclipt op het raster, en het raster is uitsluitend terugval — genoteerd in `collect.notes` en in de vingerafdruk. Op casus 1 is het interval dat oversteekt aantoonbaar de header-gate-vloer die het referentiebestand noteert (`afgeleide_parameters.woofer.FF_vloer_header`), en aantoonbaar smaller dan het analyseraster.

  **Waarom de v1-route niet geraakt is.** Zelfde argument als V21: het veld bestaat alleen in de v2-payload en wordt alleen door de v2-worker gelezen.

- V23 (een ingevuld veld dat niets doet, en dat nergens stond) — bij F4b, en het is de kleinste van de drie reparaties met de scherpste les.

  **Wat het was.** `worker.ts` geeft de budgetinversie `gapBudgetDb: null` mee, met een `TODO(A5e.2)` erboven: A5d.4(a) wil het ankerniveau ná baffle step in de beoogde opstelling, en dat is een eigenschap van het doelcurve-object — een open besluit. `bounds.ts` slaat de dempingsgrens dan over met een `continue` en zónder notitie ("het anker heeft per definitie geen verzwakkingsbudget"), want vanuit die functie gezien is een ontbrekend gap-budget geen ontbrekende invoer. Er volgde wél een noot in `collect.notes` — en `collect.notes` bereikte het scherm nooit. Resultaat: een ontwerper die `dampingMarginDb` invult krijgt een veld dat niets doet en dat nergens zegt dat het niets doet.

  **Waarom dat een doctrine-schending is en niet alleen een gemis.** F0 legde vast: **leeg = geen oordeel**. Het spiegelbeeld stond nergens: *ingevuld en niet toegepast = ook geen oordeel*. Een getal dat in een veld staat ziet eruit alsof het meedoet.

  **Wat gewijzigd is — en vooral wat níet.** De TODO staat er nog, het besluit blijft open, en er is geen gap verzonnen. Wat er bij is gekomen is één zin in `predesign.boundNotes`, die het paneel al rendert bij de budgetsectie: "stated — not applied on this route (waiting on A5e.2)". Met de asymmetrie erbij, want die is echt en de lezer heeft er recht op: in het **rapport** wordt de marge wél toegepast (dat heeft de verankerde gaps om hem bovenop te leggen), het is de **zoektocht** die hem niet kan gebruiken. Zonder ingevuld veld verschijnt er niets — een ongevraagd veld verdient geen zin.

  **Bijvangst — GEREPAREERD IN F4b2.** Op dezelfde route droeg `BudgetWay` geen `nearField` en geen `impedance` (`grep` op `worker.ts`: nul treffers), dus óók `lfBumpBudgetDb` kon daar nooit tot een grens komen — hij leverde altijd de noot "needs a near-field measurement, the loaded impedance sweep and the impedance peak". Een vierde gat van dezelfde familie, buiten de drie die de audit noemt, en al aanwezig sinds F2. F4b maakte het **zichtbaar** door `collect.notes` een scherm te geven; F4b2 heeft het gedicht — de nabij-veldkromme, de impedantiesweep en de fundamentele resonantie steken sindsdien over als feiten. Zie **V25** voor de vier-inversies-tabel, voor de meting die de vorm van die reparatie bepaalde (het ketenraster levert geen weigering maar een grens van 1 048 576 mH), en voor wat er wél open blijft.

  **Waarom de v1-route niet geraakt is.** De noot zit in het v2-rapportmodel, dat met de vlag uit niet gebouwd wordt.

- V24 (hardgecodeerde kruispunt-defaults in `App.tsx`, en waarom ze blijven staan) — bij F4b, audit §7.

  **Wat het was.** Vier `useState`-defaults en hun laad-terugvallen zetten het kruispunt van een ontwerp: 2200 ± 400 Hz voor de bovenste overname en 400 ± 150 Hz voor de onderste, plus 1800/3500 Hz als migratiewaarden voor een oud projectbestand. Het zijn frequenties uit één project die een ánder project sturen — `xoLowPin` en `xoHighPin` kooien de structuurzoektocht — en de lage geeft een bereik van 250–550 Hz terwijl de A5d.3-meetgeldigheidsvloer voor dat paar op 396,7 Hz ligt. **Het bereik begint 147 Hz onder de laagste frequentie die de app zelf vertrouwt.** Dezelfde klasse die P6 verbiedt; `p6Lint.test.ts` scande alleen `src/lib/engine2/`, dus de regel bestond en de bewaking niet.

  **Waarom ze niet weg konden.** De toggle-invariant zegt dat de app met de vlag uit byte-identiek is aan de app van vóór engine2. Deze waarden afleiden op de v1-route verándert v1-gedrag, en dat is precies het ene wat dit project niet doet.

  **Wat gewijzigd is.** Ze staan verzameld in één benoemd blok `V1_PIN_DEFAULTS_LEGACY`, met de audit-verwijzing en de reden erbij, en **geen enkele waarde is veranderd**. `p6Lint` heeft een tweede scope gekregen op `src/App.tsx`: een frequentie-literaal op een regel die een pin-identifier noemt is verboden tenzij die regel het legacy-blok noemt, plus een **snapshot** van het blok zodat er niets bij kan komen zonder dat de test breekt — een benoemd huis voor een schending helpt alleen zolang het klein blijft. De scope is bewust smal (deze namenfamilie, niet "elke frequentie in App.tsx"): een blanket-regel zou plotgrenzen, weergavelimieten en een notch-default meepakken, en een lint die wolf roept wordt weggehaald.

  **Wat de lint meteen ving.** De audit noemde vier `useState`-defaults en de laad-terugval. Er waren er méér: `xoRangeValue` — de **tweewegroute** — droeg dezelfde twee literalen nog eens (`num(xoFreqHz, 2200)`, `num(xoMarginHz, 400)`), en de migratiewaarden 1800/3500 stonden ook nergens in de opsomming. De lint vond ze binnen een minuut. Dat is het argument voor de lint in één zin: een handmatige inventarisatie van literalen is compleet tot zij het niet is, en niemand merkt het verschil.

  **De v2-route neemt zijn pin ergens anders vandaan.** `xoPinsValue` splitst nu: de getypte waarde van de ontwerper wint altijd — dat is de F3b/F3c-doctrine, de app maakt de onenigheid zichtbaar en doet dan precies wat haar gezegd is — maar wanneer een veld niets bruikbaars bevat valt de v1-route terug op het legacy-blok en de v2-route **niet**. Die neemt de A5d.3-band via de F3c-aanbeveling, en is er geen venster af te leiden, dan is er **geen pin** en wordt dat gemeld in `v2RunNotes` bij de scanuitslag. Een stille 400 Hz is de fout die daarmee weg is. De lint bewaakt die splitsing structureel: de legacy-namen mogen alleen binnen de `!useV2Pins`-tak gelezen worden.

  **Waarom de v1-route niet geraakt is.** Het blok is een hernoeming, geen herwaardering: dezelfde getallen, dezelfde plekken, dezelfde volgorde. De tweewegroute (`xoRangeValue`) blijft volledig v1 — die is nog niet op v2 aangesloten (`TODO(F2c)`) — en gebruikt dus ook nog het blok. `toggleRegression.test.ts` is groen, en dat is het bewijs.

- V25 (het vierde gat: de LF-bult-inversie had nooit invoer — en het raster loog niet, het zweeg) — bij F4b2.

  **Wat het was.** V23 noteerde het als bijvangst: `BudgetWay` kreeg op de workerroute geen `nearField` en geen `impedance`, dus `lfBumpBudgetDb` kon daar nooit tot een grens komen. Gemeten met alle vier de budgetten tegelijk gewapend, door de échte route:

  | # | inversie | gedreven door | wat zij nodig heeft | rapportroute | workerroute vóór F4b2 | na F4b2 |
  |---|---|---|---|---|---|---|
  | 1 | `qes-series-r` | `budgets.qesMultiplierMax` | `reOhm`, `lowest` | ✅ | ✅ (sinds F4b op de opgeloste R_e — V21) | ✅ |
  | 2 | `bump-series-l` | `budgets.lfBumpBudgetDb` | `nearField`, `impedance`, `fPeakHz`, `lowest`, `pathROhm`, optioneel `crossingAboveHz` | ✅ | ❌ **dood** | ✅ **hersteld** |
  | 3 | `gap-pad-r` | `budgets.dampingMarginDb` | `gapBudgetDb` ≠ null, `zPassbandMedianOhm` | ✅ | ❌ dood (`gapBudgetDb: null`) | ❌ **blijft dood, met reden** |
  | 4 | `drive-series-c` | `gates.maxDriveOnFsDb` | `highPassProtected`, `fsHz`, `zPassbandMedianOhm`, `order?` | ✅ | ✅ maar altijd op orde 1 | ✅ op de gedeclareerde orde |

  **2 van 4, en dat was de stand sinds F2** — niet iets wat F4b veroorzaakte. Wat F4b deed was `collect.notes` een scherm geven; daardoor werd zichtbaar wat er al drie fasen stond. De audit-tabel in §3 zegt "3 van 4" en draagt sinds F4b2 een gedateerd erratum; de tabelregel zelf is niet aangeraakt, omdat F4c en F4d er met paragraafnummers naar verwijzen.

  **De meting die de reparatie van vorm deed veranderen, en mijn eerste antwoord was fout.** De vraag was: volstaat het raster dat de worker al heeft? Ik heb hem eerst verkeerd gesteld — ik mat de PRECISIE van de inversie op het raster van het rapport (de impedantiespanwijdte, 10 Hz–20 kHz) en vond 0,0143 dB verschil met de klasse-A-referentie, ruim binnen de dB-klasse van 0,15. Conclusie: het raster volstaat, de impedantie hoeft niet over.

  Dat was het verkeerde raster. De worker houdt de impedantie op het KETENRASTER, en de ondergrens daarvan is de ver-veldspanwijdte — in `App.tsx` minstens 200 Hz. M-D evalueert over [0,7·f_p, 2,2·f_p], op deze woofer **36,7–115,2 Hz**: volledig onder dat raster. En de inversie weigert daar niet. Zij leest nergens bult, verdubbelt haar bracket tot `BOUND_BRACKET_DOUBLINGS` en levert **1 048 576 mH** af — duizend henry, aangeboden als zoekgrens.

  Het was dus geen precisievraag maar een DEKKINGSvraag, en het antwoord staat aan de andere kant van de streep: de sweep steekt over, op zijn eigen raster, met zijn geldigheidsinterval erbij (de lek-2-vorm van F4b). Er is bewust **geen terugval** op de rasterkopie die de worker al heeft: een inversie zonder data onder haar band hoort géén grens te leveren, niet een grote.

  **Om dezelfde reden steekt f_p zelf over.** `fPeakHz` werd in de worker geclassificeerd uit dezelfde rasterkopie. Een classificatie die de resonantie niet ziet vindt niets — of vindt een conusmode en noemt die f_s, precies de fout waarvoor A5c.2's fasetest bestaat (V8b). De opnamepas heeft hem al opgelost op de volle sweep; de worker consumeert. Dat repareert stilzwijgend ook M-C, dat zijn f_s uit diezelfde classificatie haalde.

  **Wat er verder is bijgekomen, en waar het vandaan komt.** `order` en `crossingAboveHz` zijn NETWERKeigenschappen, geen meetfeiten, en komen daarom niet via `measurementFacts` uit het rapport — de orde in het rapport is de PRE-DESIGN-orde die de ontwerper voor een overname heeft ingesteld (`orderByPair`), en die over een v1-kandidaat leggen beschrijft die kandidaat als iets wat hij niet is: casus 1's HUIDIG is een 2e-orde ontwerp onder een 4e-orde vensterinstelling. Beide komen dus van de workerkant, dezelfde scheiding als `pathROhm`: de orde uit de gedeclareerde uitlijning die de kandidaat draagt (`structureLow`/`structureHigh` op de driewegroute, de filterspec op de tweewegroute; 'auto' betekent dat er niets gedeclareerd is en de voorbound valt terug op zijn eigen gedocumenteerde default), het kruispunt uit `xoLow`/`xoHigh`. `TODO(F4c)` staat op beide: het kandidaat-object maakt de bron expliciet.

  **`pathROhm` verschilt tussen de routes, en dat blijft zo.** Het rapport heeft geen netwerk en geeft 0; de worker kent het seed-netwerk en geeft de werkelijke serieweerstand. Dat is geen onenigheid maar twee verschillende vragen. De acceptatietest voedt daarom BEIDE kanten het parameterblok van de klasse-A-referentie (`pad_R_ohm` uit de fixture) in plaats van wat elke route zelf zou produceren — anders zou de test een verschil meten dat er hoort te zijn.

  **Hoe aangetoond.** Vijf asserts op de inversie zelf: dezelfde invoer uit het rapport en uit de payload leveren een byte-identieke grens; die grens IS de klasse-A-referentie `maxL_bij_Rs0_5_budget2_5dB_mH` binnen haar eigen tolerantieklasse (de assert staat op de METRIEK, niet op de millihenry — een geïnverteerde grens erft de tolerantie van de metriek die zij inverteert); en het ketenraster levert aantoonbaar de absurde grens op, zodat de reden om de sweep mee te sturen in de suite staat en niet alleen in dit boek. Drie asserts door de échte route met `structuredClone`: met beide krommen wordt de grens bereikt, met geen van beide niet en de noot zegt welke invoer ontbrak, en met alleen het nabije veld nog steeds niet — de sweep is de helft die niet uit het analyseraster verzonnen mag worden.

  **De vingerafdruk.** Het F4b-ingrediënt `facts` is uitgebreid van twee naar vijf feiten (R_e, A5b.1-geldigheid, resonantie, nabij veld, sweep) in plaats van dat er een ingrediënt bij kwam — de naam beschrijft nog steeds precies wat erin zit. Omdat de NAAM niet verandert, ziet de dekkingsassert in `determinism.test.ts` die groei niet; daar staat sinds F4b2 een tweede assert naast die elk van de vijf apart de sleutel moet zien bewegen, plus een telling zodat een zesde feit niet ongetest kan meeliften.

  **Waarom de v1-route niet geraakt is.** Alles zit in de v2-payload, in `engine2/` en in de v2-tak van `App.tsx`. `optimWorker.ts` is byte-onaangeraakt, `netOptimizer.ts`, `threeWayChain.ts` en `designChain.ts` zijn niet gewijzigd, en de inversieformules in `bounds.ts` evenmin — alleen wat zij als invoer krijgen. Met de vlag uit wordt de payload niet opgebouwd. `toggleRegression.test.ts` is byte-identiek.

  **Openstaand.** De dempingsmarge (inversie 3) wacht op A5e.2 en op niets anders. En `crossingAboveHz` is op de tweewegroute het meetkundig midden van het gestelde bereik in plaats van een kruispunt, omdat die route een RANGE draagt en geen punt — F4c maakt dat expliciet.

- V26 (wie mag kiezen: de 37 tuner-instellingen ingedeeld, en de v2-run vergrendeld) — bij F4c.

  **Wat het was.** De v2-route zette vier van de tuner-instellingen en nam de rest letterlijk over uit wat de v1-keten toevallig had gebouwd (audit §2.2). Onschadelijk zolang v1 óók de kandidaten kiest — instellingen en kandidaat komen dan uit dezelfde hand en zijn het per constructie eens. Het houdt op onschadelijk te zijn zodra v2 een eigen kandidaat aanlevert: een v1-hellingsdoel, een v1-kooi of een v1-pin trekt die kandidaat dan stil terug naar de v1-keuze, en niets zegt het.

  **Twee correcties op de aanname vooraf, en de tweede is de belangrijkste.**

  *Ten eerste: het zijn er 37, geen "ruim vijftig".* De audit schatte het aantal op ruim vijftig; geteld op de top-level sleutels van `NetOptimizeOptions` zijn het er 37. Geen verschil dat iets aan de redenering verandert, wel een getal dat nu klopt en dat een test bewaakt.

  *Ten tweede: `run.ts` is niet de route die de app neemt.* De `Omit<>` daar begrenst `runV2Optimization`, en die wordt uitsluitend door twee tests aangeroepen — `grep` bevestigt het. De scan-knop gaat via de wórker, en daar bouwt de kéten (`threeWayChain.ts`) de tuner-opties uit `Chain3Settings` en merget de engine-hook als láátste. Die volgorde is de hefboom: wat de hook noemt, wint. Alleen `run.ts` afsluiten zou een deur op slot doen die niemand gebruikt.

  **De indeling.** Drie klassen, gedefinieerd in Deel A (A3j) in algemene bewoordingen; de tabel hieronder is de bijlage voor déze tuner en geen norm. **Keuze** (25): bepaalt WAT er gezocht wordt. **Grijs** (5): gewichten die de scalar vormgeven en daarmee bepalen welk deel van het veld bezocht wordt — polish naar de vorm, keuze naar het effect (audit §6.4). **Polish** (7): bepaalt HOE er gezocht wordt binnen een gegeven keuze; mag overerven.

  **Wat gewijzigd is.** `run.ts`'s `tuneOptions` is versmald van "alles behalve de drie die v2 bezit" naar "alles wat geen keuze en geen gewicht is"; keuzes en gewichten komen binnen via twee nieuwe, benoemde objecten. **De compiler is de bewaking** — twee bestaande tests stopten meteen met compileren omdat ze `phasePriority` en `staged` door `tuneOptions` gaven, en dat is precies de vangst waarvoor de scheiding bestaat. Op de workerroute noemt de hook nu tien keuzes en vijf gewichten expliciet, teruggelezen uit de instellingen die de keten kreeg: **niets wordt hier gekozen**, en dat is het punt — de waarden zijn dezelfde, ze steken alleen benoemd over.

  **Wat er nog niet gesteld kan worden, en waarom dat een noot is en geen omissie.** Vijftien keuze-sleutels worden binnen de keten samengesteld (`xoRangePairs` uit de eigen kooi van de kandidaat, en verder `branchTargets`, `safety`, `snapPrefs`, `staged`, `audit`, `midBranch`, `angleData` en de solo-familie). Die hier herleiden zou een tweede implementatie van ketenlogica zijn, en dat is hoe twee beschrijvingen van één ding uiteen gaan lopen — V21's les, een laag hoger. Ze staan met naam en toenaam in `collect.notes`: *"Search choices still inherited from the v1 chain, not v2-derived: …"*. F4d verhuist ze naar de kandidaat.

  **De vijf grijze sleutels, elk met zijn motivering.**

  - `phasePriority` — verdeelt het budget tussen amplitude en fase. Zet hem hoog en de zoektocht bezoekt ontwerpen die fase kopen met vlakheid; zet hem laag en zij komt daar nooit. Dat is geen fijnafstemming, dat is welk deel van het veld bestaat.
  - `directivityWeight` — bepaalt of de energiegemiddelde respons meetelt. Op nul is de zoektocht op-as-blind voor bundeling; erboven wordt een ándere kandidaat de beste.
  - `powerFoldWeight` — het gewicht van de DI-vouwterm rond elk kruispunt. Weegt precies het gebied waar de kandidaat over overname gaat.
  - `dissipationWeight` — stuurt weg van serieweerstand vóór de laagste tak. De term bestaat omdat de tuner zonder niveau-anker een serie-R als goedkoopste niveauregeling gebruikt (19-08: R_s 7,15 Ω, Q_es ×3,24 won de ranking). Het gewicht bepaalt of die route open staat.
  - `costWeight` — budgetdruk bij het snappen. Een BOM-voorkeur van de ontwerper, geen numerieke instelling.

  Geen van de vijf is opnieuw gebalanceerd en er is er geen bijgekomen; F4c stelt ze alleen vast in plaats van ze te laten overwaaien. Een gewicht dat níemand stelt is de default van de tuner, en dát is ook een besluit: `run.ts` en de worker noemen sindsdien de gewichten die aan de tuner zijn overgelaten.

  **De twee vondsten uit F4b2 staan in dezelfde tabel** (rijen 38 en 39), want ze zijn van dezelfde soort ook al zijn het geen tuner-instellingen: de ondergrens van het ketenraster is een keuze die v1 stil aan de v2-route oplegt, en de orde bij uitlijning `'auto'` is een keuze-sleutel zónder declaratie.

  **Hoe aangetoond.** Dezelfde run twee keer uitgedrukt — de F4b2-vorm (alles door `tuneOptions`, gereconstrueerd met een cast langs het versmalde type heen, want de regressie moet vergelijken met wat de code déed en niet met een opgepoetste versie ervan) en de F4c-vorm (dezelfde waarden via `choices` en `weights`) — en de opgeleverde netwerken karakter voor karakter vergeleken. **Byte-identiek op beide seeds.** Met een assert ervoor dat de twee seeds aantoonbaar verschillende netwerken opleveren: zonder die assert zou "onveranderd op twee seeds" ook waar zijn voor een zoektocht die zijn seed negeert.

  **Wat wél verandert: de vingerafdruk.** `choices` is een nieuw ingrediënt, dus een run die zijn kandidaat stelde en een run die hem overerfde zijn niet langer identiek gestempeld — precies waarvoor het ingrediënt bestaat. Het netwerk is hetzelfde, de stempel niet, en een lezer die een oude vingerafdruk naast een nieuwe legt hoort dat te weten.

  **De regressie op de route die de app wél neemt (nagekomen bij F4c).** De eerste fixture pinde `runV2Optimization`, en het erratum onder audit §2.2 zegt waarom dat niet genoeg is: niets in de app roept die functie aan. Er is daarom een tweede fixture door de échte route — `handleV2Request` → `runThreeWayChain`, payload door `structuredClone` — met beide vormen erin: **inherited** (`runThreeWayChain` zónder v2-hook, dus zuivere overerving uit de keten) en **stated** (de route zoals hij nu is, met tien keuzes en vijf gewichten expliciet). Poorten en budgetten leeg in de payload, met opzet: met niets gewapend gaf de pre-F4c-hook aantoonbaar `{}` terug, zodat het énige verschil tussen de twee vormen F4c's herstellen is.

  **Uitkomst: byte-identiek, op geen enkele sleutel afwijking.** Dat is geen toeval maar de reden waarom de tien en de vijf zó gekozen zijn: elke sleutel die de hook herstelt geeft de keten verbatim door uit `s.*` (`threeWayChain.ts:360–396`), dus hem herstellen zet dezelfde waarde tweemaal. De sleutels die de keten TRANSFORMEERT — `staged` uit `s.targets`, `xoRangePairs` uit de eigen kooi van de kandidaat — worden juist niet hersteld, en dat is precies waarom.

  **Wat de meting er ongevraagd bij opleverde.** Op de workerroute **bereikt de seed de zoektocht niet**: de keten draait één keer en er is geen gejitterde start — die zit in `run.ts`. De twee seedrijen in de fixture zijn dus identiek. Dat is vastgelegd in plaats van weggepoetst: een wijziging die de seed wél laat doorwerken is een echte gedragswijziging, en dit is de plek waar zij zichtbaar wordt. Het betekent ook dat "twee seeds" op deze route geen tweede pad door de zoektocht toetst, en dat de dekking van deze regressie dus aan één kandidaat hangt (`xoLow` 500, `xoHigh` 3000). Uitbreiden vraagt een tweede kandidaat, niet een tweede seed.

  **Waarom de v1-route niet geraakt is.** `netOptimizer.ts` is niet gewijzigd, `threeWayChain.ts` en `designChain.ts` evenmin, en er is geen gewicht bijgekomen of herbalanceerd. Alles wat beweegt zit in `engine2/`. Met de vlag uit draait de keten precies het object dat zij altijd bouwde — de hook wordt niet aangeroepen. `toggleRegression.test.ts` is byte-identiek.

  ---

  **Bijlage V26 — de 37 tuner-instellingen, ingedeeld.** Regelnummers zijn `src/lib/netOptimizer.ts` tenzij anders vermeld. "wie zet hem" geldt voor de v2-route.

| # | sleutel | landt op | klasse | reden | wie zet hem op v2 |
|---|---|---|---|---|---|
| 1 | `phasePriority` | 815, 865 | **grijs** | verdeelt budget amplitude/fase — bepaalt welk deel van het veld bezocht wordt | v2-run (expliciet) |
| 2 | `rSourceDisqualifyOhm` | 872 | keuze | hard verbod: infeasible bron-R | v2-kandidaat |
| 3 | `loadFloor` | 873, 874, 1286 | keuze | hard verbod: afgeleide versterkervloer | v2-kandidaat |
| 4 | `ampMinLoadOhm` | 600, 881, 1875 | keuze | hard verbod: de vloer van de ontwerper | v2-kandidaat |
| 5 | `band` | 45 plekken vanaf 387 | keuze | wélke band beoordeeld wordt is wat "goed" betekent | v2-kandidaat |
| 6 | `maxIterations` | 816, 2319–2364 | polish | iteratiebudget; verandert niets aan wat gezocht wordt | mag overerven |
| 7 | `angleData` | 19 plekken vanaf 835 | keuze | wapent de directiviteitstermen; zonder is de zoektocht op-as | v2-kandidaat |
| 8 | `directivityWeight` | 866 | **grijs** | of de energiegemiddelde respons meetelt — andere winnaar | v2-run (expliciet) |
| 9 | `powerMetric` | 867 | keuze | kiest de DEFINITIE van de vermogensmaat ('smooth' / 'legacy') | v2-kandidaat |
| 10 | `powerFoldWeight` | 1116 | **grijs** | weegt precies het gebied rond de overname | v2-run (expliciet) |
| 11 | `errorSmoothOct` | 1129, 1131 | polish | gladding van de zoek-foutmaat; poorten en doelen blijven op het rauwe raster | mag overerven |
| 12 | `ampTarget` | 817, 1117 | keuze | wélke curve vlak gemaakt wordt (op-as of luistervenster) | v2-kandidaat |
| 13 | `breakupGuard` | 10 plekken vanaf 818 | keuze | ontwerpregel op stopbandlek naast het kruispunt | v2-kandidaat |
| 14 | `staged` | 25 plekken vanaf 1216 | keuze | het DOEL waar de trapmethode aan gehouden wordt | v2-kandidaat |
| 15 | `xoRange` | 1939 | keuze | pint het akoestische kruispunt | v2-kandidaat |
| 16 | `phaseMetric` | 819, 1906, 1978 | keuze | kiest de fasemaat; "must match the design optimizer's setting" | v2-kandidaat |
| 17 | `onStage` | 820, 1255–1275 | polish | voortgangscallback; beïnvloedt niets (V17: een etiket is geen meting) | mag overerven |
| 18 | `catalogSnap` | 3200 | keuze | bindt de catalogus of niet — een ontwerpbesluit | v2-kandidaat |
| 19 | `costWeight` | 385, 3206 | **grijs** | budgetdruk bij het snappen: een BOM-voorkeur, geen numerieke instelling | v2-run (expliciet) |
| 20 | `snapPrefs` | 7 plekken vanaf 2134 | keuze | welke serie, welke tier per positie | v2-kandidaat |
| 21 | `acousticSlopes` | 855–860 e.v. | keuze | de nagestreefde helling per flank | v2-kandidaat |
| 22 | `xoRangePairs` | 1820, 2019 | keuze | de kooi per aangrenzend paar | v2-kandidaat (nu nog keten) |
| 23 | `dissipationWeight` | 868 | **grijs** | opent of sluit de serie-R-route naar niveau-aanpassing | v2-run (expliciet) |
| 24 | `xoFloorPairs` | 2025 | keuze | stijve fysica-vloer per paar | v2-kandidaat |
| 25 | `xoPinHard` | 1819, 1949–2032 | keuze | stijve barrière i.p.v. zachte pin (alleen reparatiepas) | v2-kandidaat |
| 26 | `solo` | 26 plekken vanaf 822 | keuze | topologie: nul driverparen | v2-kandidaat |
| 27 | `soloSensitivityDb` | 849 | keuze | de code noemt hem zelf "A DESIGNER'S CHOICE, not a constant" | v2-kandidaat |
| 28 | `soloTargetLevelDb` | 1614–1643 | keuze | ÍS de doelfunctie in solo-modus | v2-kandidaat |
| 29 | `branchTargets` | 1443, 1447, 2011 | keuze | de leiband: het contract per tak | v2-kandidaat |
| 30 | `zFloorStrict` | 3066, 3110, 3673 | keuze | verzet de lat van de reparatiepas | v2-kandidaat |
| 31 | `safety` | 31 plekken vanaf 439 | keuze | volle-band-verbod op degeneratie | v2-kandidaat |
| 32 | `midBranch` | 824 | keuze | topologie: twee paren i.p.v. één | v2-kandidaat |
| 33 | `audit` | 36 plekken vanaf 401 | keuze | poort 4, het fysieke onderdelenaudit | v2-kandidaat |
| 34 | `gateViolation` | 539, 975–1019 e.v. | polish (v2-bezit) | de poorthaak; v2 zet hem sinds F2 | v2-run |
| 35 | `onGateEvaluated` | 1023 | polish | instrumentatie; "nothing here may influence a decision" | mag overerven |
| 36 | `valueCeilings` | 2196, 2198 | polish (v2-bezit) | A5d.6-inversie; v2 zet hem sinds F2 | v2-run |
| 37 | `valueSumCeilings` | 2216 | polish (v2-bezit) | A5d.6-somplafond; v2 zet hem sinds F2 | v2-run |
| 38 | ketenraster-ondergrens | `App.tsx:4128` | **keuze** | ver-veldspanwijdte als hard getal; F4b2 mat dat de LF-bult-inversie daarop 1 048 576 mH afleverde | v2-kandidaat — nog niet gezet |
| 39 | orde bij uitlijning `'auto'` | `worker.ts` (F4b2) | **keuze zonder declaratie** | `structureLow/High` is `undefined` bij 'auto', dus `drive-series-c` valt terug op zijn default terwijl de rapportroute de echte orde heeft | v2-kandidaat — moet de orde per flank altijd dragen |

  **Wat er met rij 38 en 39 gebeurt.** Beide zijn geclassificeerd en geen van beide is in F4c gezet — dat zou kandidaatgeneratie zijn, en die is F4d. Rij 38 blijft op de v1-route byte-identiek; de v2-route mag hem expliciet maken zodra de kandidaat er een heeft. Rij 39 is de scherpste van de twee: het is een keuze-sleutel die op de v2-route soms helemaal niet gedeclareerd is, en het kandidaat-object uit F4d moet de orde per flank áltijd dragen — anders is "geen declaratie" opnieuw niet te onderscheiden van "orde 1".

- V27 (de kandidaatgeneratie verhuist — en wat er onderweg niet meeverhuist) — bij F4d.

  **Wat het was.** Engine v2 leidde de haalbare kruisvensters, de aanbevolen band en de orde-regels af, en gebruikte er niets van: de kandidaten kwamen uit `crossover3Variants`, dat op niveau-ankers en buurten van rauwe snijpunten werkt. De audit zei het scherp (§6.1): *"v2 kan vetoën en rapporteren. Het kan niet voorstellen."* Na F4d doet het dat wel — op de v2-route, en alleen daar.

  ---

  **DEKKINGSTABEL 1 — wat `crossover3Variants` per kandidaat oplevert, veld voor veld.**

  `Chain3Variant` heeft vijf velden. Dat is de hele kandidaat; al het andere dat een keten-invoer draagt is per RUN gedeeld, niet per kandidaat.

| v1-veld | wat het is | v2-bron | gedekt |
|---|---|---|---|
| `label` | `"W-M 411 · M-T 2520 Hz"` | `GeneratedCandidate.label` — paar, frequentie **en uitlijning**, want twee orden op één frequentie zijn twee kandidaten en de scan-tabel sleutelt op deze string | ✅ |
| `xoLow` | centrum van een schijf van de pin of van de buurt van het rauwe snijpunt | `crossings[0].hz` (`predesign/candidates.ts`) — positie *i* van *n*, gelijkmatig in octaafafstand over de aanbevolen band | ✅ |
| `xoHigh` | idem, bovenste as | `crossings[N-1].hz` — N-weg, niets telt tot twee | ✅ |
| `xoLowRange` | de kooi: ±halve tussenafstand, geklemd op rails | `crossings[0].cageHz` — ±halve tussenafstand **in octaven**, geklemd op het segment waarin de positie ligt | ✅ |
| `xoHighRange` | idem | `crossings[N-1].cageHz` | ✅ |

  **En wat `crossover3Variants` gebruikt om die vijf te maken — dáár zitten de niet-gedekte velden.** Elk hieronder is een expliciete ontwerpbeslissing van deze sessie, geen stille terugval.

| v1-mechanisme | v2-bron | besluit F4d |
|---|---|---|
| `overlapAnchor` op de NIVEAU-getrimde responsies (waar twee wegen elkaar ontmoeten na een voorlopige padding) | geen | **niet overgenomen.** Het anker is waar de *niveaus* kruisen van een luidspreker die nog niet bestaat — de padding is nog niet gekozen. De audit noemt het zelf zwak bewijs (§6.1), en A5d.3 levert een venster dat op meetgeldigheid, f_s, breakup-ernst en directiviteit staat. Een niveau-anker naast een venster zou een tweede, zwakkere mening zijn over dezelfde vraag. |
| `warm` (warm start: de kruispunten van het ontwerp dat nu in de sim staat) | geen | **niet overgenomen.** "Wat je al hebt" is geen uit de metingen afgeleid voorstel. De behoefte erachter — het bestaande ontwerp naast het veld kunnen leggen — wordt beantwoord door het vergelijkingsblok (`predesign/comparison.ts`), zonder een v1-kandidaat het v2-veld in te smokkelen. |
| `diAnchor` (DI-match, regel 9 / M-G) | nog geen | **niet overgenomen, en dit is de enige die spijt doet.** DI-continuïteit is een echte A5d.3-voorkeurszone en hoort in het VENSTER thuis als tweezijdige doelband (A4 M-G: "de snijzone van de twee D(f)-curven wordt dan een tweezijdige doelband"), niet als losse extra kandidaat. `xoWindow.ts` kent die zone nog niet. Openstaand item; tot dan sturen de vensters de generator en wordt de DI-match alleen gerapporteerd. |
| `hpFloorHz` (tweeter-HP-vloer ≥ 2×Fs) | `XO_FS_FACTOR_BY_ORDER` in het venster | ✅ gedekt, en **strenger**: k daalt met de orde (3,0 / 2,0 / 1,6 / 1,4), dus het venster wordt per kandidaat-orde opnieuw afgeleid in plaats van één vaste factor voor alles. |
| rails (`[250,1500]`, `[1200,7000]`, plafonds 2000/12000, vloer 150) | geen | **niet overgenomen, met opzet.** Dat zijn projectgetallen (P6, audit §7). Het venster vervangt ze volledig: waar geen venster is, is er geen kandidaat, en dat wordt gemeld in plaats van opgevuld. |
| `xoHigh ≥ 2,5 × xoLow` | monotonie-eis | **gedeeltelijk.** De generator eist dat de overnames **stijgen** en laat combinaties vallen die dat niet doen (met telling). De factor 2,5 zelf is een v1-getal en is niet overgenomen: als twee aangrenzende vensters elkaar overlappen is dát de bevinding, en die staat in de vensters. |
| `steps` (kandidaatstappen per as, 1/4/9 ketens) | `chainBudget` | ✅ gedekt, van betekenis veranderd: hij begrenst nu het VELD in plaats van het raster te definiëren. Boven het budget worden **posities** gedund en **orden nooit**, en beide aantallen worden gemeld. |
| duplicaat-inklapping (twee schijven op hetzelfde punt) | product + monotonie | ✅ gedekt; posities zijn per constructie uniek binnen een as. |

  ---

  **DEKKINGSTABEL 2 — de vijftien keuze-sleutels die F4c bij naam "still inherited" noemde.**

  F4c stelde er tien; de overige vijftien werden in de keten samengesteld en stonden met naam en toenaam in `collect.notes`. Ze zijn nu alle vijftien **verklaard** — en niet alle vijftien met een waarde, want zeven van hen hebben er geen. De drie toestanden zijn *stated*, *absent (met reden)* en *delegated (aan een genoemde stap, met reden)*, en `declarationCoverage` eist dat zij samen de sleutelverzameling **exact** dekken. Een sleutel die in géén van de drie zit, is precies de stille erving die F4d beëindigt, en de build breekt erop.

| sleutel | F4d-toestand | waarom |
|---|---|---|
| `xoRangePairs` | **stated** | de kooien van de kandidaat zelf. Hij had ze altijd al; sinds F4d steken ze benoemd over in plaats van via `input.xoLowRange`. |
| `xoFloorPairs` | **stated** | **de A5d.3-venstervloer**, niet de v1-fysicavloer. Dit is audit §6.3 in één regel: de vloer die stuurt is gesteld, de andere staat ernaast als tegenoordeel. |
| `staged` | stated | het rimpel/fase-doel van de ontwerper; de keten gaf `s.targets` verbatim door. |
| `safety` | stated | de volle-band-veiligheidsset; verbatim doorgegeven. |
| `snapPrefs` | stated | welke serie, welke tier; verbatim. |
| `audit` | stated | de onderdelenaudit; verbatim. |
| `loadFloor` | stated of **absent (P4)** | de afgeleide versterkervloer; niet ingevuld = geen oordeel, en dat staat er als reden in plaats van als ontbrekende sleutel. |
| `zFloorStrict` | stated | de keten zet hem zelf op `true` met een gestelde reden ("de seed is onze eigen synthese"). Dezelfde waarde, nu benoemd — F4c's argument: een waarde die niemand noemt is niet te onderscheiden van een besluit. |
| `xoRange` | **absent** | pint ÉÉN overname, en dit ontwerp heeft er N. `xoRangePairs` zegt hetzelfde N-weg; één as hier noemen laat de lezer raden welke. |
| `xoPinHard` | **absent** | de stijve barrière hoort bij de hold-the-pin-reparatiepas, die pas draait nádat een gepinde as ontsnapt is. Vooraf wapenen maakt van elke kooi een muur, en een kooi is boekhouding en geen belofte. |
| `solo` | **absent** | de solo-familie beschrijft een één-weg-ontwerp. |
| `soloSensitivityDb` | **absent** | idem. |
| `soloTargetLevelDb` | **absent** | idem. |
| `branchTargets` | **delegated** → de ontwerpstap van de keten | de leiband per tak volgt uit de uitlijning en de knieën die díe stap net heeft vastgesteld; hij bestaat niet vóórdat zij gedraaid heeft. Hem hier herleiden zou een tweede implementatie van ketenlogica zijn — V21, één laag hoger. |
| `angleData` | **delegated** → de keten-invoer | de gemeten hoeksets reizen al mee in de payload. Een tweede kopie is een tweede ding dat het oneens kan zijn met het eerste. |
| `midBranch` | **delegated** → de keten-invoer | de respons en de bijstelling van de middentak zijn `input.m` en `midAdjust`. Zelfde argument. |

  **De twee vondsten uit V26 (rijen 38 en 39).**

  - **Rij 39 (orde bij uitlijning `'auto'`) is GESLOTEN.** Een gegenereerde kandidaat kent zijn orde per flank altijd, dus hij stelt altijd een uitlijning (`structureLow`/`structureHigh` gebonden aan die orde) én stuurt `orderByModel` mee voor de pre-bound. "Geen declaratie" en "orde 1" zijn op deze route niet langer te verwarren.
  - **Rij 38 (ketenraster-ondergrens) is GEMETEN EN GESTELD, niet verplaatst.** Op casus 1 begint het analyseraster op 200 Hz terwijl de laagste A5d.3-venstervloer op 397 Hz ligt. Geen enkele kandidaat wordt onder die vloer geplaatst en de oordeelband is al op meetgeldigheid geclipt (audit §5), dus daar wordt niets gescoord. Wat overblijft is geen lek maar een **stilte**: de rasterrand komt uit de meetspanwijdtes en het fMin-veld, niet uit een afgeleide vloer. De v2-route zegt dat nu in de runnotities. *Waarom niet verplaatst:* het raster is `sim`, en daar tekent élke grafiek op dit scherm uit. Hem verzetten zou de rapportage-oppervlakken op de v2-route mee veranderen, en dat is een grotere wijziging dan F4d's opdracht — die zegt dat gedrag uitsluitend op de v2-route verandert, niet dat élk v2-oppervlak mag bewegen. Een lezer die dit betwist heeft een punt; het staat er daarom als afweging en niet als voldongen feit.

  ---

  **A5e.4 op de route die de app neemt.** Zie het tweede erratum onder audit §3 voor de meting per onderdeel. Kort: het **budget** werkt door (`maxIterations`), de **seed** en `starts` niet — de keten draait één keer per kandidaat en er is geen gejitterde start. Bij F4c was dat bijvangst; bij F4d is het een **besluit**: diversiteit komt uit kandidaten, niet uit gejitterde starts. Een kandidaat is een keuze die een ontwerper kan lezen en betwisten; een gejitterde start is toeval, en een veld dat uit toeval bestaat laat zich niet over topologie-klassen spreiden omdat niets zijn topologie koos. `DEFAULT_RUN_STARTS` staat daarom op **1**: de engine jittert niet meer uit zichzelf, een project dat erom vraagt krijgt het nog steeds, en de machinerie blijft getest. De assert *"de seed bereikt de zoektocht niet"* is bewust **bevestigd** in plaats van verwijderd, nu met een reden erbij, en er staat een tegenproef naast dat een andere KANDIDAAT de zoektocht wél bereikt.

  **Wat F4d aan de vingerafdruk toevoegt.** Het `choices`-ingrediënt was op deze route altijd leeg — `runV2Optimization` vult het en dat pad loopt niemand. Leeg was juist zolang v1 de kandidaten koos. `V2ScanSettings.candidateFieldKey` draagt sinds F4d het hele veld: elke kandidaat met kruispunten, kooi, orde en uitlijning, plus de generator-parameters en wat er gedund is.

  ---

  **`clampPin`: waar hij ingreep, en wat er met de A5d.3-vensters gebeurde.**

  Eén plek, `App.tsx` in `runVfOptimize`, direct na `xoPinsValue()` en vóór álles wat de pin gebruikt. Hij vuurt alleen wanneer het v1-venster `userClampedByData` heeft gezet — dat wil zeggen: de ontwerper (of, sinds F4b, de A5d.3-afleiding via `xoPinsValue`) heeft een bereik gesteld dat onder de v1-datavloer duikt. Dan wordt de pin **vervangen** door het midden van het v1-venster.

  De doorwerking is breed, want de geklemde pin gaat vervolgens naar: (a) `crossover3Variants` als zoekruimte, (b) `settings.xoLowPin`/`xoHighPin` en daarmee de kooi in de tune, (c) `judgeWindows`, waartegen het OPGELEVERDE kruispunt geoordeeld wordt, en (d) terug in `physWin3` als gebruikersvenster. Vier plaatsen, één substitutie, en het enige zichtbare spoor was een banner over iets anders. Live op het KOAN-project: aanbevolen band 396,7–448,5 Hz → 707–728 Hz, waarna de pre-start-raming meldde dat 4 van de 4 kandidaten buiten het A5d.3-venster 396,7–549,7 Hz vielen. De raming had gelijk.

  **F4d:** `clampPin` begint met `if (useV2) return pin;`. Op de v1-route byte-identiek. Op de v2-route wordt niets meer geklemd, en de twee vloeren komen naast elkaar te staan met hun herkomst (`predesign/floorComparison.ts`), inclusief de melding welk deel van het veld de ándere laag geweigerd zou hebben. Geen automatische verzoening: de twee beantwoorden verschillende vragen, en dat de v1-waarde won omdat hij eerder in de pijplijn zit is geen argument.

  ---

  **De uitkomst op casus 1.** *(HERZIEN BIJ V28 — lees dit blok als het verslag van wat F4d deed, niet als de huidige stand. De F3c-uitsnijding die de M-T-as van vijf posities naar drie bracht is opgeschort; het veld is nu vijftien kandidaten en de tabellen hieronder zijn met hun opvolgers vervangen bij V28.)*

  Het veld dat de metingen impliceren, met de orde die het casusboek zelf voor deze vensters noteert (4 op beide overnames):

| as | venster (orde 4) | aanbevolen band | posities | waarom dat aantal |
|---|---|---|---|---|
| woofer→mid | 396,7–548,5 Hz | 396,7–548,5 Hz (de slechtste lobing-zone 657–920 Hz ligt boven het plafond) | **396,7 / 466,5 / 548,5 Hz** | 0,47 octaaf band; 1 + ⌊0,47 / (1/6)⌋ = 3 |
| mid→tweeter | 1294,0–2283,5 Hz | 1294,0–1327,4 **en** 1858,4–2283,5 Hz | **1294,0 / 2033,9 / 2283,5 Hz** *(V28: nu 1294,0 / 1491,4 / 1719,0 / 1981,2 / 2283,5)* | 0,33 octaaf *aanbevolen* band (de slechtste lobing-zone 1327–1858 Hz is eruit gesneden); 1 + ⌊0,33 / (1/6)⌋ = 3. **V28: die uitsnijding is opgeschort, dus 0,82 octaaf VENSTER en 1 + ⌊0,82 / (1/6)⌋ = 5.** |

  Twee keer drie, om volstrekt verschillende redenen — wat precies het punt is van een aantal dat wordt afgeleid in plaats van gekozen. Product: **9 kandidaten**, en de V9-spanning van dit project (de slechtste lobing-zone ligt binnen het bovenste venster) is nu een **gat in de kandidatenlijst** in plaats van een zin in het paneel.

  *Precies dat gat is wat V28 opwierp, en het antwoord was dat het er niet had mogen zijn: het werd gesneden door een λ-fractie op één c-t-c-afstand, en V20a reserveert elk lobing-oordeel voor de verticale synthese. Sinds V28 is het veld drie × vijf = **15 kandidaten**, en de V9-spanning staat weer in het paneel — nu ook op elke kandidaat zelf, met bron en met de mededeling dat zij niet is toegepast.*

  **De pre-start-raming meldt 0 van 9 buiten het venster** en 0 van 9 buiten de aanbevolen band, dus de dialoog verschijnt niet. *(V28: 0 van 15 buiten het venster — dat blijft een eigenschap die de generator niet kán schenden — maar niet meer 0 buiten de AANBEVELING, want de generator volgt haar niet meer. De raming zegt dat, en dat is gewenst zolang V28 open is.)* Met de tegenproef ernaast: dezelfde schatter, gevoed met de kruispunten die het v1-venster oplevert (707–728 Hz), meldt **4 van 4 buiten** — de audit-meting, gereproduceerd als uitspraak over de schatter in plaats van over de run.

  **Klasse A, nagemeten.** Het veld is een functie van de METINGEN alleen: dezelfde negen kandidaten komen uit een rapport dat op HUIDIG, op KAND-A en op KAND-B gebouwd is. Dat is de F4a-classificatie op de generator toegepast, en het is de reden dat de gegenereerde netlists als klasse B kunnen worden vastgelegd zonder ergens een klasse C te introduceren.

  ---

  **DE VERGELIJKING — v2-kandidaten naast de v1-baseline.**

  De negen kandidaten zijn door de échte route getuned (`handleV2Request` → `runThreeWayChain`, seed 20260827, raster 96 punten 200–20 kHz, oordeelband 397–19 500 Hz) en als `KAND-V2-*.adsfilter.json` bevroren. Alle getallen hieronder komen uit dezelfde metriekbibliotheek op dezelfde meetset — `predesign/comparison.ts`, dat niets rangschikt en waarin geen kolom een functie van een andere kolom is.

| ontwerp | min \|Z\| (Ω) | min EPDR (Ω) | dissipatie (%) | grootste R (W) | drive @ f_s (dB) | LF-bult (dB) | Q-mult (×) | SPL-venster (±dB) | RMS-afwijking (dB) | fase, slechtste paar (°) |
|---|---|---|---|---|---|---|---|---|---|---|
| HUIDIG | 3,46 | 1,73 | 46 | 25,55 | −25,08 | 3,75 | 2,86 | 1,34 | 0,60 | 23,83 |
| KAND-A | 3,32 | 1,66 | 52 | 30,93 | 10,48 | 4,25 | 3,22 | 1,47 | 0,87 | 3,69 |
| KAND-B | 3,44 | 1,72 | 39 | 19,57 | 11,13 | 3,41 | 4,10 | 1,30 | 0,70 | 3,41 |
| KAND-V2-1 | 0,00 | 1,59 | 40 | 37,83 | 19,11 | 3,40 | 1,71 | 1,65 | 1,41 | 84,66 |
| KAND-V2-2 | 0,01 | 0,02 | 2 | 1,30 | −12,68 | 1,49 | 1,15 | 4,41 | 2,80 | 65,57 |
| KAND-V2-3 | 1,39 | 0,70 | 0 | 0,34 | −21,61 | 1,49 | 1,12 | 5,09 | 2,91 | 21,51 |
| KAND-V2-4 | 1,31 | 0,66 | 1 | 0,51 | −19,76 | 1,49 | 1,10 | 5,25 | 3,04 | 18,10 |
| KAND-V2-5 | 1,24 | 0,62 | 14 | 11,50 | 4,24 | 1,76 | 1,41 | 5,40 | 3,05 | 20,69 |
| KAND-V2-6 | 1,18 | 0,59 | 15 | 12,53 | 4,13 | 1,71 | 1,45 | 5,54 | 3,12 | 20,20 |
| KAND-V2-7 | 1,15 | 0,58 | 15 | 11,59 | 4,05 | 1,70 | 1,41 | 5,64 | 3,21 | 18,67 |
| KAND-V2-8 | 1,08 | 0,54 | 15 | 12,20 | 3,95 | 1,69 | 1,44 | 5,80 | 3,29 | 18,58 |
| KAND-V2-9 | 0,84 | 0,43 | 16 | 12,01 | 3,28 | 1,68 | 1,44 | 6,16 | 3,53 | 20,74 |

  **De v2-kandidaten verliezen, over vrijwel de hele tabel.** Dat is de uitkomst, hij wordt hier genoteerd zoals hij is, en de vraag die telt is *waarvan* het een uitspraak is.

  **DE CONTROLE, en zij verandert de conclusie.** Dezelfde keten, dezelfde instellingen, dezelfde meetset — maar gestart op de kruispunten van HUIDIG zélf (360 / 2250 Hz, met een ruime kooi): **5,24 dB rimpel, 21,9° fase, min\|Z\| 1,42 Ω.** De negen v2-kandidaten leveren 3,11–9,15 dB en 15,0–27,0°, en de beste van hen (466,5 / 1294 Hz, 3,11 dB) is **beter dan de controle op de kruispunten van de baseline**.

  Daaruit volgt wat deze tabel wél en niet zegt:

  - **Wat zij niet zegt:** dat de v2-kandidaten slechte kruispunten zijn. Op de kruispunten van de baseline levert dezelfde ene ketenpas een even middelmatig netwerk op.
  - **Wat zij wél zegt:** dat één ketenpas — zonder catalogus-snapping, zonder EQ-banden, zonder ampèrevloer en zonder de iteraties van een ontwerpsessie — geen ontwerp oplevert dat in de buurt komt van de drie bevroren netlists. Die drie zijn geen uitkomst van één pas; ze zijn het resultaat van een lange sessie met een mens erin.
  - **De v1-tuner faalt dus NIET structureel op een v2-kandidaat.** Dat was de hypothese die getoetst moest worden (de startprompt noemt hem expliciet), en de controle verwerpt hem: de tuner doet op een v2-kandidaat wat hij op een v1-kandidaat doet.

  **Twee dingen die de vergelijking wél blootlegt, en beide zijn echt.**

  1. **`min|Z|` van 0,00–1,4 Ω tegen 3,3–3,5 Ω.** Casus 1 stelt geen versterkervloer, dus `ampMinLoadOhm` is afwezig en niets oordeelt over de belasting — P4, en de F0-doctrine (*leeg veld = geen oordeel*) in werking. De drie baselines dragen de impliciete discipline van een ontwerper die dat getal in zijn hoofd had; de v2-run heeft daar geen gestelde tegenhanger voor. Dat is geen bug maar een **ontbrekende projectinstelling**, en het is precies het soort ding dat zichtbaar hoort te zijn in plaats van vanzelf goed te gaan.
  2. **De fasetracking van KAND-V2-1 en -2 (84,7° en 65,6°).** *(Achterhaald bij V28: het segment van 33 Hz was een artefact van de uitsnijding en bestaat niet meer. Zie daar voor de nameting.)* Beide kruisen M-T op 1294 Hz, de ondergrens van het bovenste venster, in het segment dat maar 33 Hz breed is (1294–1327 Hz — de slechtste lobing-zone begint erboven). Een kooi van 2,6 % is nauwelijks een zoekruimte, en de tuner heeft er geen ruimte om de fase te repareren. Openstaand: of een segment dat smaller is dan de acceptatie-gladding een kandidaat verdient, of alleen een vermelding. De generator plaatst er nu één, omdat het toegestane band is en niets die keuze voor de ontwerper mag maken.

  ---

  **TWEE FOUTEN IN DE MEETOPSTELLING, en ze staan hier omdat ze allebei bijna als bevinding waren opgeschreven.**

  *Ten eerste: de eerste versie van de fixture wapende de BESCHERMINGEN niet.* Geen `targets` (het doel van de trapmethode), geen `safety` (het volle-band-verbod op degeneratie, V26 rij 31) en geen audit-drempels — met de redenering dat elk extra gewapend mechanisme een tweede verklaring voor een verschil is. Die redenering klopt voor een REGRESSIE en is precies verkeerd om voor een VOORSTEL: het zijn beschermingen, en een tuner zonder beschermingen levert netwerken op die vlak zijn op de oordeelband en degenereren erbuiten. Gemeten: **min\|Z\| = 0,00 Ω** — een dode kortsluiting — terwijl de keten een keurige 1,90 dB rimpel rapporteerde, want de rimpel werd gemeten waar het netwerk nog werkte.

  *Ten tweede, en dit was de duurdere: `synthMode` stond op `'filter'` en de app draait `'acoustic'`.* De controle legde het bloot: op `'filter'`, gestart op de kruispunten van HUIDIG, leverde dezelfde keten **31,4 dB** rimpel, dreef de overnames van 360/2250 naar **856/3848 Hz** en liet 0,00 Ω achter. Op `'acoustic'` werd dat 5,24 dB en 358/2370 Hz. Een fixture die niet de synthese van de app draait, meet de app niet.

  **De procesles is de bekende, één laag verder.** V15 zei het over referenties: een getal zonder zijn parameters is geen referentie. Hier ging het over een RUN, en de parameters die ontbraken waren niet exotisch — het waren de defaults van de app. De regel die hieruit volgt en die in de fixture staat opgeschreven: *een run-fixture die met een vergelijking als doel wordt gebouwd, draait de instellingen van de app en niet een minimale set.* En: **een tabel waarin het nieuwe verliest, verdient een controle vóórdat zij een bevinding wordt.** Zonder de controle zou hier gestaan hebben dat de v1-tuner op v2-kandidaten faalt, en dat was niet waar.

- V28 (**OPEN** — de F3c-uitsnijding stuurde het kandidaatveld met een λ-fractie) — opgeworpen bij de F4d-nazorg, 27-08-2026.

  **De vraag waarmee het begon.** Drie posities gelijkmatig over het 0,82-octaaf M-T-venster horen op ~1294 / ~1720 / ~2283 Hz te landen. De F4d-lijst gaf 1294 / 2034 / 2284. Waar komt dat gat vandaan?

  **De herleiding, bestand voor bestand.**

  1. `predesign/candidates.ts` legde zijn posities over `recommendedBand(window).effectiveHz` — de aanbevolen band, niet het venster.
  2. `predesign/recommendedBand.ts:150` bepaalt wat daaruit gesneden wordt: `w.zones.find((z) => z.kind === 'bad')`.
  3. Die zone wordt gemaakt in `predesign/xoWindow.ts:218` — `add('the WORST lobing zone', [LOBING_WORST_LOW * cOverD, LOBING_WORST_HIGH * cOverD], 'bad')` — met `LOBING_WORST_LOW = 0.5` en `LOBING_WORST_HIGH = 0.7` (`xoWindow.ts:140-141`).
  4. En `cOverD` komt uit `xoWindow.ts:212`: `SPEED_OF_SOUND_M_S / (input.spacingMm / MM_PER_M)`, waarbij `spacingMm` de ENE c-t-c-afstand is die `report.ts:675` voor dit paar doorgeeft.

  De uitgesneden grootheid is dus: **de band waarop d/λ tussen 0,5 en 0,7 ligt, voor één c-t-c-afstand.** Dat is een λ-fractie. Het is niet de verticale synthese; `verticalLobing` komt in dit hele pad niet voor. En 0,5–0,7 is niet zomaar een λ-fractie: het is precies het dal van de niet-monotone zonecurve die V20 heeft geschrapt (V20's knopen: 0,60 → 1,00, de ongunstigste).

  **Het oordeel: F3c is een V20-schending op een plek die V20 niet zag.** V20a zegt dat de verticale synthese de énige lobing-grootheid is waar een oordeel aan mag hangen, en het blijvende verbod luidt: geen poort, geen budget, geen shortlist-criterium op een λ-fractie. Bij F3c leek dat niet te bijten, want de aanbevolen band was **advies**: een zin en twee veldwaarden achter een knop, die de ontwerper mocht negeren. F4d heeft er zonder het te merken iets anders van gemaakt — de band waaruit de kandidaten worden gesneden. F4d's eigen uitbreiding van `noWeights.test.ts` benoemt precies waarom dat het verschil maakt: *"kiezen wélke kandidaten bestaan is dezelfde beslissing als kiezen tussen hun uitkomsten, één stap eerder."* De uitsnijding werd sturend op het moment dat de generator haar ging lezen.

  **Waarom dit geen leerstellige klacht is, maar nagemeten.** V20 stelde vast dat er voor een weg met N bronnen vier afstanden zijn en geen keuze ertussen. `xoWindow` krijgt er één. Wélke, bepaalt wat er wordt uitgesneden — en op het ONDERSTE paar van casus 1 (wooferarray → mid, een weg met twee bronnen) verandert dat het veld:

  | λ-lezing (V20) | afstand | uitgesneden zone | valt in het W-M-venster 396,7–548,5 Hz? |
  | --- | --- | --- | --- |
  | dichtstbijzijnde bron *(wat de engine gebruikt)* | 261,3 mm | 656–919 Hz | nee — boven het plafond |
  | binnen de wooferweg | 275,7 mm | 622–871 Hz | nee — boven het plafond |
  | amplitudegewogen zwaartepunt | 399,2 mm | **430–602 Hz** | **ja — snijdt af vanaf 430 Hz** |
  | verste bron | 537,0 mm | **319–447 Hz** | **ja — snijdt 396,7–447 Hz weg** |

  Vier juiste getallen, vier verschillende kandidatenlijsten op dezelfde as. De verste-bron-lezing zou de positie op 396,7 Hz hebben geweigerd; de dichtstbijzijnde weigert niets. De keuze die V20 verwierp bepaalt hier rechtstreeks wélke ontwerpen een tuner ooit te zien krijgt, en zij wordt nergens genoemd. Dat is dezelfde vondst als V20, één laag verder: **de keuze tussen twee kandidaten verborg een derde, en hier verbergt zij bovendien dat er gekozen wórdt.**

  **Wat de nazorgsessie heeft gedaan — en nadrukkelijk niet.**

  - **Opgeschort, niet gerepareerd.** `candidates.ts` kent nu `APPLY_BAND_EXCISIONS`, en die staat op `false`. De generator dekt het hele A5d.3-venster gelijkmatig. Het besluit of een uitsnijding het veld überhaupt mag vormen is aan deze entry en is niet genomen.
  - **`recommendedBand.ts` is byte-onaangeraakt**, en dat is opzet. De F3c-dialoog blijft de aanbevolen band tonen met haar overnameknoppen: als ADVIES is zij niet in strijd met V20a — een ontwerper die het leest en negeert is precies het geval waarvoor A5d.3 "toon de zones, middel ze niet" schreef. Wat verboden was, was dat een machine haar volgt zonder het te zeggen.
  - **Elke uitgesneden zone reist nu mee met de kandidaat, mét bron.** `XoZone.derivedFrom` is VERPLICHT geworden (`xoWindow.ts`): elke zone die band wegneemt moet zeggen wélke grootheid zij is en waaruit zij is gerekend. `CandidateCrossing.excisions` draagt zone, bron, `applied` en — als zij niet is toegepast — waarom niet. Het staat in de provenance-zin die een shortlistrij afdrukt, in de axis-notities voor het paneel, en in `casus1_v2_herkomst.json`. Een lezer die vraagt "waarom staat er geen kandidaat tussen 1327 en 1858 Hz?" krijgt sinds nu antwoord, ook wanneer het antwoord "die staat er wél" is.
  - **Geen poort, geen budget, geen drempel verplaatst of toegevoegd.**

  **Wat dit op casus 1 verandert — BREAKING, alleen voor v2-runs.**

  De M-T-as gaat van 0,33 octaaf aanbevolen band naar 0,82 octaaf venster, dus van drie posities naar vijf; W-M blijft drie (daar lag de zone al boven het plafond).

  | as | venster (orde 4) | band waarover gespreid | posities |
  | --- | --- | --- | --- |
  | woofer→mid | 396,7–548,5 Hz | 396,7–548,5 Hz (0,47 okt) | **396,7 / 466,5 / 548,5 Hz** |
  | mid→tweeter | 1294,0–2283,5 Hz | 1294,0–2283,5 Hz (0,82 okt) | **1294,0 / 1491,4 / 1719,0 / 1981,2 / 2283,5 Hz** |

  Het veld gaat van **9 naar 15 kandidaten**. En daarmee komt een tweede getal in beeld dat bij F4d onzichtbaar was: **de shortlist laat er tien door van de vijftien.** Bij F4d was het negen van negen — de shortlist had nog nooit iets geweigerd, en of hij dat kón was op deze casus niet te zien. Nu wel. Bevroren wordt de shortlist, zoals altijd, dus er staan **tien** `KAND-V2-*.adsfilter.json` op schijf tegen negen daarvoor.

  Geen enkele referentie werd hierdoor ONGELDIG, en dat is de F4a-classificatie die zich uitbetaalt: de referenties hangen aan BESTANDEN, dus een ander veld levert andere bestanden op en niet andere waarden voor dezelfde.

  De pre-start-raming meldt nog steeds **0 van 15 buiten het venster** — dat blijft een eigenschap die de generator niet kán schenden. Wat wél verandert: enkele kandidaten liggen nu buiten de F3c-**aanbeveling**, en de raming zegt dat. Dat is gewenst zolang V28 open is: een opschorting die ook de raming het zwijgen oplegde, zou nergens op het scherm laten zien dat het veld en de aanbeveling uit elkaar zijn gelopen.

  **Wat de bredere M-T-dekking opleverde — en één ding dat zij juist NIET opleverde.**

  1. **De 33 Hz-kooi is weg, de rimpel beweegt — maar de fasetracking van V27's twee probleemgevallen is NIET gerepareerd, en dat weerlegt de verklaring die V27 gaf.**

  V27 noteerde als tweede echte bevinding dat KAND-V2-1 en -2 (84,7° en 65,6° fase) allebei op 1294 Hz kruisten, in het segment van 1294–1327 Hz: *"Een kooi van 2,6 % is nauwelijks een zoekruimte, en de tuner heeft er geen ruimte om de fase te repareren."* Dat is een toetsbare uitspraak, en de opschorting toetst haar: met het hele venster als band is de kooi op diezelfde 1294 Hz zo'n 95 Hz breed, bijna een factor drie ruimer.

  Wat de ene ketenpas per kandidaat rapporteert, F4d naast V28:

  | kandidaat (W-M · M-T) | F4d (kooi 33 Hz) | V28 (kooi ≈95 Hz) |
  | --- | --- | --- |
  | 396,7 · 1294 | 9,15 dB / 27,0° | **3,25 dB / 19,0°** |
  | 466,5 · 1294 | 3,11 dB / 21,3° | 3,93 dB / 26,6° |
  | 548,5 · 1294 | 6,34 dB / 17,0° | 6,33 dB / 16,1° |

  Bijna zes dB rimpel weg op de slechtste, 0,8 dB erbij op de middelste. **Een bredere kooi is dus geen strikt makkelijker probleem** — één ketenpas over een grotere zoekruimte is een ánder probleem, niet hetzelfde probleem met meer speling.

  En op de metriek waar het V27 om ging is het antwoord ronduit nee. De M-T-fasetracking van de twee kandidaten die op 1294 Hz kruisen ging van 84,7° / 65,6° naar **89,9° / 89,2°**. Niet beter: slechter.

  **Wat er in plaats daarvan mee correleert, staat in de tabel ernaast.** Precies die twee dragen `min |Z| = 0,01 Ω` — een dode kortsluiting. De dérde kandidaat die óók op 1294 Hz kruist, 548,5 · 1294, heeft `min |Z| = 0,86 Ω` en een M-T-fasetracking van 19,9°: dezelfde overname, dezelfde kooi, normale fase. De kooibreedte verklaart het verschil dus niet en de overnamefrequentie evenmin; wat de twee uitzonderingen delen is een gedegenereerde belasting.

  Dat is **V27's eerste bevinding en niet zijn tweede**: casus 1 stelt geen versterkervloer, `ampMinLoadOhm` is afwezig, en niets oordeelt over de belasting (P4, de F0-doctrine). De tuner mag naar 0,01 Ω lopen en doet dat, en een netwerk dat daarheen is gelopen heeft geen bruikbare fase meer. V27 schreef de fasetracking toe aan te weinig zoekruimte; de ruimte is verdrievoudigd en de fase is verslechterd. **De ontbrekende projectinstelling is de verklaring, en de smalle kooi was het toeval dat ernaast lag.**

  V27's openstaande vraag — *"of een segment dat smaller is dan de acceptatie-gladding een kandidaat verdient"* — is daarmee niet beantwoord maar wel onschadelijk: dat segment bestaat niet meer, want het was een artefact van de uitsnijding. Wat blijft openstaan is het echte punt: **casus 1 heeft een versterkervloer nodig voordat een v2-vergelijking iets zegt over wat een tuner kán.**
  2. **De vergelijkingstabel schuift mee.** Zie het blok hieronder; het vervangt de v2-helft van V27's tabel, waarvan de rijen naar bestanden verwezen die niet meer bestaan. De conclusie van V27 verandert niet — één ketenpas levert geen ontwerp dat de drie bevroren netlists benadert, en de controle op de kruispunten van HUIDIG zélf (5,24 dB) blijft de reden dat dat een uitspraak is over de PAS en niet over de kandidaten.

  ---

  **DE VERGELIJKING NA V28 — tien bevroren v2-kandidaten naast de v1-baseline.**

  Dezelfde metriekbibliotheek op dezelfde meetset (`predesign/comparison.ts`), dezelfde kolommen, niets gerangschikt.

  |---|---|---|---|---|---|---|---|---|---|---|
  | HUIDIG | 3.46 | 1.73 | 46 | 25.55 | -25.08 | 3.75 | 2.86 | 1.34 | 0.60 | 23.83 |
  | KAND-A | 3.32 | 1.66 | 52 | 30.93 | 10.48 | 4.25 | 3.22 | 1.47 | 0.87 | 3.69 |
  | KAND-B | 3.44 | 1.72 | 39 | 19.57 | 11.13 | 3.41 | 4.10 | 1.30 | 0.70 | 3.41 |
  | KAND-V2-1 (396.7 / 1294 Hz, LR4) | 0.01 | 0.53 | 0 | — | 21.10 | 5.20 | 1.00 | 2.67 | 1.87 | 89.93 |
  | KAND-V2-2 (466.5 / 1294 Hz, LR4) | 0.01 | 1.82 | 31 | 19.11 | 20.66 | 13.74 | 1.43 | 3.81 | 2.40 | 89.17 |
  | KAND-V2-3 (396.7 / 2283.5 Hz, LR4) | 1.38 | 0.69 | 1 | 0.46 | -21.26 | 1.49 | 1.13 | 5.15 | 2.96 | 20.63 |
  | KAND-V2-4 (548.5 / 2283.5 Hz, LR4) | 1.17 | 0.58 | 15 | 12.49 | 4.13 | 1.71 | 1.45 | 5.59 | 3.17 | 20.06 |
  | KAND-V2-5 (396.7 / 1719 Hz, LR4) | 1.16 | 0.59 | 1 | 1.18 | -16.45 | 1.49 | 1.13 | 5.48 | 3.24 | 17.17 |
  | KAND-V2-6 (466.5 / 1981.2 Hz, LR4) | 1.14 | 0.57 | 15 | 11.78 | 4.17 | 1.84 | 1.43 | 5.67 | 3.24 | 17.89 |
  | KAND-V2-7 (396.7 / 1491.4 Hz, LR4) | 1.04 | 0.54 | 2 | 1.35 | -13.76 | 1.49 | 1.15 | 5.57 | 3.35 | 15.98 |
  | KAND-V2-8 (548.5 / 1719 Hz, LR4) | 0.95 | 0.48 | 16 | 12.35 | 3.75 | 1.76 | 1.46 | 6.15 | 3.48 | 19.99 |
  | KAND-V2-9 (548.5 / 1491.4 Hz, LR4) | 0.87 | 0.44 | 16 | 12.05 | 3.42 | 1.68 | 1.44 | 6.21 | 3.53 | 20.42 |
  | KAND-V2-10 (548.5 / 1294 Hz, LR4) | 0.86 | 0.44 | 16 | 11.74 | -12.30 | 1.71 | 1.44 | 6.16 | 3.58 | 19.90 |

  **Wat er tegenover de F4d-tabel verandert, en wat niet.** De v1-baselines zijn identiek — dezelfde bestanden, dezelfde metrieken. De v2-rijen zijn ándere netwerken (ander veld, andere shortlist) en niet betere: de rimpel- en fasekolommen liggen in dezelfde orde als bij F4d, en `min |Z|` blijft 0,01–1,4 Ω tegen 3,3–3,5 Ω voor de baselines. **De conclusie van V27 staat dus overeind en is niet door V28 gered.** Wat V28 wél doet, is de verklaring aanscherpen: de twee slechtste rijen zijn de twee met de gedegenereerde belasting, en dát is de ontbrekende versterkervloer en niet de kandidaat.

  **Wat V28 moet beslissen, en welke uitkomsten open staan.**

  1. **Verwerpen.** Geen enkele uitsnijding op een λ-fractie, ooit. De aanbevolen band blijft advies in de dialoog; de generator dekt altijd het venster. Dit is de huidige toestand, en de nulhypothese.
  2. **Herbouwen op de synthese.** Een uitsnijding is legitiem als zij uit `verticalLobing` komt: draai de synthese over het kruisgebied per kandidaat-frequentie en snij weg waar de gesynthetiseerde dip een gestelde grens overschrijdt. Dat is een échte A5d.3-voorkeurszone en geen aanname — maar het is duur (een synthese per positie), het vraagt een **gestelde** dipgrens (P4: zonder die grens geen oordeel), en het is niet zonder meer een uitsnijding: een dip is continu en een zone is binair.
  3. **Behouden als screening met etiket.** De uitsnijding blijft, maar alleen wanneer alle vier de V20-fracties hem eens zijn — de zone is dan de doorsnede van vier zones en de keuze tussen de afstanden is niet meer nodig. Op casus 1's onderste paar is die doorsnede leeg, wat de bruikbaarheid meteen laat zien.

  Optie 2 heeft de voorkeur van de nazorgsessie en is niet uitgevoerd: zij vraagt een gestelde grens die casus 1 niet heeft, en dat is een projectinstelling en geen sessiebesluit. **Open.**

  **Wat er in de code veranderde.** `predesign/candidates.ts` (`APPLY_BAND_EXCISIONS`, `BandExcision`, `excisionsFor`, `excisionSentence`, band = venster), `predesign/xoWindow.ts` (`XoZone.derivedFrom`, verplicht). **Onaangeraakt:** `recommendedBand.ts`, `metrics/lobing.ts`, `verticalLobing`, elke poort, elk budget, de v1-route, en `components/XoWindowAnnotation.tsx`. Met de vlag uit verandert er niets; `toggleRegression.test.ts` blijft byte-identiek.

- V29 (**OPEN** — mag `safety` een netlist weigeren die vrijwel kortsluit als er géén versterkervloer is opgegeven?) — opgeworpen bij de vloersessie, 27-08-2026.

  **De aanleiding, en zij is geen gedachte-experiment.** De V28-shortlist bevatte twee bevroren netlists met `min |Z| = 0,01 Ω` (KAND-V2-1 en -2). Nul komma nul één ohm is voor elke versterker die bestaat een kortsluiting. Ze stonden er niet door een fout: casus 1 stelde geen `ampMinLoadOhm`, dus M-B/|Z| oordeelde niet, en `safety` — het volle-band-verbod op degeneratie (V26 rij 31) — was gewapend en liet ze door. De shortlist deed precies wat hem gezegd was en leverde een ontwerp op dat niemand mag bouwen.

  **Wat `safety` vandaag wél doet.** Hij bewaakt het gedrag BUITEN de oordeelband: hij vangt netwerken die vlak zijn waar gemeten wordt en daarbuiten weglopen. Dat is waarom hij bestaat (V27: zonder hem leverde de eerste fixture 0,00 Ω met een keurige 1,90 dB rimpel). Wat hij niet doet is een absolute ondergrens aan de belasting stellen, want die grens is een eigenschap van de versterker en die kent hij niet.

  **De twee houdingen, allebei verdedigbaar.**

  1. **Strikt P4 — nee.** Leeg veld is geen oordeel; dat is de F0-doctrine en zij is er niet voor niets gekomen. Een app die stilletjes een vloer verzint waar de ontwerper er geen stelde, is precies de app die drie plekken met drie drempels had (`impedanceFloor.ts` bestaat om dat op te ruimen). Een buisversterker, een PA-eindtrap en een class-D-module willen verschillende antwoorden, en 0,01 Ω is alleen absurd als je weet welke er staat. Bovendien: de ontwerper ZIET de kolom — `min |Z|` staat in het vergelijkingsblok en in het poortrapport, met de vermelding "no limit set". De informatie wordt niet achtergehouden; er wordt alleen niet voor hem beslist. *Wat er dan wél moet gebeuren:* niets in de code, en een projectinstelling in het casusboek — wat deze sessie voor casus 1 heeft gedaan.
  2. **Een afleidbare degeneratiegrens — ja, maar niet als versterkervloer.** De gemeten driverimpedanties zetten zelf al een ondergrens: het complement kan niet lager dan de parallelschakeling van de `R_e`'s die de meting oplevert (casus 1: woofer 3,05 Ω gemeten DC, mid en tweeter erbij). Een netwerk dat dáár ver onder duikt, doet dat niet omdat de drivers dat kunnen maar omdat het filter een pad heeft gemaakt dat de drivers omzeilt — een serie-C die tegen een spoel resoneert, een shunt die naar nul loopt. Dat is geen belastingsoordeel maar een DEGENERATIE-detectie, en zij is uit de metingen af te leiden zonder dat iemand een versterker noemt. `safety` is de plek waar die hoort, want dat is wat `safety` is: het verbod op degeneratie. **Het onderscheid dat deze houding draagt:** "te zware belasting voor jouw versterker" is P4 en blijft afwezig-is-afwezig; "dit netwerk is fysisch ontaard" is een uitspraak over het netwerk zelf, en die mag een engine doen die de drivers heeft gemeten.

  **Waar de spanning precies zit.** Houding 2 is aantrekkelijk en heeft een echt risico: elke afgeleide grens is een getal dat niemand heeft gesteld, en dit project heeft (V21, V22, V25) drie keer meegemaakt dat een tweede afleiding náást een gestelde waarde uiteindelijk met haar in strijd was. Een degeneratiegrens uit de `R_e`'s zou bovendien een factor nodig hebben — hoevéél onder de parallelschakeling is "ontaard"? — en die factor is precies het soort getal dat A5e.1 en P6 niet eigenmachtig ingevuld willen zien.

  **Wat het zou beslechten.** Eén meting die er nu niet is: een netwerk dat de detectie zou weigeren, gebouwd en gemeten, zodat blijkt of de gedetecteerde degeneratie zich als degeneratie gedraagt of alleen op papier bestaat. Zonder dat is elke gekozen factor een aanname die zich als meting voordoet — de fout die V20 heeft opgeruimd.

  **Geen besluit.** Deze sessie heeft de vraag alleen gesteld en de aanleiding vastgelegd. Wat zij wél deed is houding 1 volgen voor casus 1: de vloer is GESTELD (`manifest_en_geometrie.gestelde_eisen`), de poort is gewapend, en de 0,01 Ω-netwerken zijn niet meer bevroren omdat de poort ze weigert — niet omdat `safety` iets nieuws doet. `safety`, M-A, M-B, M-C en elke andere poort zijn bij deze sessie byte-onaangeraakt. **Open.**

- V30 (de versterkervloer is GESTELD — en zij blijkt een veto en geen zoekdoel; **gedeeltelijk gesloten** bij de vervolgsessie, waar zij een zoekdoel werd) — bij de vloersessie, 27-08-2026.

  **Wat er gesteld is.** `manifest_en_geometrie.gestelde_eisen.versterkervloer_ohm = 2,6 Ω`, met de motivering van de ontwerper erbij: *"Het bestaande filter HUIDIG staat op ~2,6 Ω minimum en is qua SPL en fase goed; de v2-kandidaten worden zo op dezelfde voet vergeleken."* Het getal staat in dát blok en nergens anders — niet in `src/lib/engine2/`, niet als default, niet als constante in een fixture. De fixtures lezen het via `casus1AmpMinLoadOhm(golden)`, en het reist het pad van de app: het A5a-veld vult `settings.ampMinLoadOhm` én `v2ScanSettings.gates.ampMinLoadOhm`.

  **Twee dingen die bij het opschrijven meteen bijgesteld moesten worden.**

  1. *De poort heet M-B/|Z|, niet M-A.* De opdracht sprak van "de M-A-poort wapenen met de versterkervloer". In het A4-register is M-A de **dissipatiefractie** — dimensieloos — en een vloer in ohm kan maar één poort wapenen: `M-B/|Z|`, de eenvoudige modus van M-B, met `meetsAmpFloor` als vergelijkingsregel. Het register houdt hier de namen; M-A, M-B/EPDR en M-C blijven ongewapend, want casus 1 stelt daar niets voor.
  2. *HUIDIG meet geen 2,6 Ω maar 3,46 Ω.* `kandidaten.HUIDIG_2e.minZ` = 3,46 (min |Z| over het hele raster, poortvrij). De motivering noemt ~2,6. Het zijn twee grootheden — de app toont een systeemimpedantie op een eigen raster en band — en dit bestand beslist niet welke de ontwerper bedoelde. **Beide staan nu in het manifest**, naast elkaar. De gestelde vloer is 2,6 en dát wordt gewapend; gunstig neveneffect is dat de baseline waaraan de motivering refereert de vloer met marge haalt en dus niet zelf omvalt.

  ---

  **DE UITKOMST: 0 VAN 15.** Het A5d.3-veld (vijftien kandidaten sinds V28) is opnieuw door de échte route getuned mét de vloer gewapend. **Geen enkele kandidaat haalt hem.** De geleverde min |Z| liep van 0,03 tot 1,38 Ω tegen een gestelde 2,6 Ω; alle vijftien werden door `M-B/|Z|` geweigerd, de shortlist kwam op **0 van 15** en er is niets bevroren.

  **En toen begon het eigenlijke werk, want die uitslag betekende niet wat hij leek te betekenen.** Naast de run zonder vloer gelegd:

  | | zonder vloer | met vloer 2,6 Ω |
  | --- | --- | --- |
  | kandidaten | 15 | 15 |
  | shortlist | 10 | **0** |
  | netwerk BYTE-IDENTIEK aan de run zonder vloer | — | **13 van 15** |
  | netwerk veranderd | — | 2 van 15 (juist de twee die al op 0,01 Ω stonden) |

  Dertien van de vijftien leverden exact hetzelfde netwerk als de run waarin geen vloer bestond, terwijl zij op 0,86–1,38 Ω stonden en de vloer 2,6 Ω was. "0 van 15" is dus geen uitspraak over wat de tuner kán.

  ---

  **DE HERLEIDING, en de eerste hypothese was fout.**

  *Vermoeden vooraf:* `Z_FLOOR_OHM` — hardgecodeerd in `netOptimizer.ts`, zes locaties, beide ketens — bepaalt wanneer de reparatiepas afgaat, en de gestelde vloer is alleen een poort achteraf.

  *Weerlegd.* `grep -rn "Z_FLOOR_OHM" src/` geeft **nul treffers**: sessie F0 heeft de constante verwijderd, en wat er in `docs/OptimizerV2_startprompts.md:11` staat is de startprompt van díe sessie, geen openstaand item. De trigger van de reparatiepas is de GESTELDE vloer en niets anders:

  - `netOptimizer.ts:880-881` — `ampFloorOhm = opts.ampMinLoadOhm > 0 ? opts.ampMinLoadOhm : null`, met in het commentaar: *"THE one place this file decides whether an amplifier-load floor exists at all"*.
  - `netOptimizer.ts:909` — `zSlackOhm = ampFloorOhm − acceptedAmpFloor(ampFloorOhm)`, dus de 2 %-meettolerantie: op 2,6 Ω is dat **0,052 Ω**.
  - `netOptimizer.ts:3058` — `if (ampFloorOhm !== null && zCur.short > zSlackOhm)`. De pas gaat dus af zodra min |Z| onder **2,548 Ω** ligt: bij alle vijftien.

  **Gemeten in plaats van beredeneerd.** Drie kandidaten door de échte route, met de vloer gewapend, en `ampFloorRepair` uitgelezen (dat is een getypt pass-resultaat en geen tekstmatch — A3g):

  | kandidaat | min \|Z\| | `ampFloorRepair` |
  | --- | --- | --- |
  | 396,7 · 1294 | 0,035 Ω | `failed` |
  | 396,7 · 1491,4 | 1,045 Ω | `failed` |
  | 548,5 · 1294 | 0,859 Ω | `failed` |

  `'failed'` wordt uitsluitend binnen die `if` gezet, dus **de reparatiepas is bij alle drie afgegaan en bij alle drie mislukt**. De tuner heeft het geprobeerd. Dat de dertien byte-identiek terugkwamen komt doordat een mislukte reparatie wordt teruggedraaid: `cur` blijft staan en het netwerk is letterlijk hetzelfde.

  **Waar het vermoeden wél klopte, op een ander adres.** De vloer zit nergens in de hoofdzoektocht. De enige plek waar `zShortOhm` een kostenterm wordt is `netOptimizer.ts:2303` — `barr += 1200 * (m.zShortOhm / ampFloorOhm!) ** 2` — en dat blok staat achter `if (zFloorBarrier)`. `zFloorBarrier` is een parameter van `tune()` die op `false` staat (`netOptimizer.ts:2162`) en alleen door de reparatie-aanroepen op `true` wordt gezet (`3068`, `3073`). Het commentaar zegt het zelf: *"only the repair pass sets zFloorBarrier, and that pass runs only with a rating given."*

  > **De gestelde vloer is een VETO plus een reparatiepas achteraf. Zij is nooit een zoekdoel.** De zoektocht die de topologie en de waarden kiest weet niet dat er een vloer is; pas als zij klaar is wordt gekeken of het resultaat eronder duikt, en dan mag één barrière-retune proberen het op te tillen — vanuit een punt dat al voor iets anders geoptimaliseerd is.

  Dat is dezelfde lekklasse als audit §6.1 (*"v2 kan vetoën en rapporteren. Het kan niet voorstellen."*), één laag lager: **de vloer kan vetoën en repareren; hij kan niet sturen.** En het verklaart de uitslag precies. Een zoektocht die de vloer als doel had meegenomen was elders begonnen; een reparatie die pas achteraf 1,0 Ω naar 2,6 Ω moet tillen, moet een netwerk omgooien dat al ergens anders in vastzit.

  **Niet gerepareerd in deze sessie, met opzet.** Het is een wijziging in de kostenfunctie van `netOptimizer.ts` op het v1-pad, dus zij raakt de toggle-invariant en verdient een eigen schone sessie met eigen regressies. Wat deze sessie doet is het vastleggen met bestand:regel, zodat de volgende niet opnieuw hoeft te zoeken.

  ---

  **WAT ER MET DE BEVROREN NETLISTS GEBEURT — en waarom ze NIET verwijderd zijn.**

  De opdracht zei: netlists die de poort niet halen worden verwijderd, "geen referentie aanpassen maar een netlist die nooit had mogen bestaan". Die redenering staat, maar zij veronderstelt dat de poort een eerlijk oordeel over de kandidaat velt. Na de herleiding hierboven doet hij dat niet: hij velt een oordeel over een zoektocht die de vloer niet kende. Tien netlists weggooien op grond daarvan zou het bewijsmateriaal van V30 vernietigen.

  Dus: **de tien blijven staan, elk met een vlag.** `manifest_en_geometrie.v2_herkomst.vloeruitzonderingen` noemt ze bij naam, met hun gemeten min |Z|, de gestelde vloer en de reden — *"bevroren vóór de vloer gesteld werd, getuned zonder hem; de tuner heeft de vloer niet als zoekdoel gezien (V30); mag niet gebouwd worden."* De klasse-B-referenties blijven ongewijzigd: het zijn metrieken op netlist-BESTANDEN en die bewegen niet omdat er een eis bij is gekomen.

  De lijst is boekhouding en geen vrijstelling, en `frozenNetlistGates.test.ts` maakt dat hard: **élke bevroren netlist haalt de vloer, óf staat in de lijst.** Een naam weghalen terwijl de netlist de vloer nog steeds mist, zet de suite op rood — nagemeten, met `KAND_V2_1` (0,01 Ω): *"a frozen netlist misses the stated floor and is not named in v2_herkomst.vloeruitzonderingen — name it with its reason, or replace the netlist"*. De lijst hoort leeg te raken zodra V30 een opvolger heeft.

  ---

  **DE VERGELIJKING, met de vloer als eigen kolom.**

  | ontwerp | min \|Z\| (Ω) | min EPDR (Ω) | dissipation, total (%) | largest resistor (W) | drive at f_s, worst way (dB) | LF lift added (dB) | Q multiplier, lowest way (×) | SPL window (±dB) | RMS deviation (dB) | phase tracking, worst pair (°) | haalt de gestelde vloer 2.6 Ω? |
  |---|---|---|---|---|---|---|---|---|---|---|---|
  | HUIDIG | 3.46 | 1.73 | 46 | 25.55 | -25.08 | 3.75 | 2.86 | 1.34 | 0.60 | 23.83 | **ja** |
  | KAND-A | 3.32 | 1.66 | 52 | 30.93 | 10.48 | 4.25 | 3.22 | 1.47 | 0.87 | 3.69 | **ja** |
  | KAND-B | 3.44 | 1.72 | 39 | 19.57 | 11.13 | 3.41 | 4.10 | 1.30 | 0.70 | 3.41 | **ja** |
  | KAND-V2-1 | 0.01 | 0.53 | 0 | — | 21.10 | 5.20 | 1.00 | 2.67 | 1.87 | 89.93 | nee |
  | KAND-V2-2 | 0.01 | 1.82 | 31 | 19.11 | 20.66 | 13.74 | 1.43 | 3.81 | 2.40 | 89.17 | nee |
  | KAND-V2-3 | 1.38 | 0.69 | 1 | 0.46 | -21.26 | 1.49 | 1.13 | 5.15 | 2.96 | 20.63 | nee |
  | KAND-V2-4 | 1.17 | 0.58 | 15 | 12.49 | 4.13 | 1.71 | 1.45 | 5.59 | 3.17 | 20.06 | nee |
  | KAND-V2-5 | 1.16 | 0.59 | 1 | 1.18 | -16.45 | 1.49 | 1.13 | 5.48 | 3.24 | 17.17 | nee |
  | KAND-V2-6 | 1.14 | 0.57 | 15 | 11.78 | 4.17 | 1.84 | 1.43 | 5.67 | 3.24 | 17.89 | nee |
  | KAND-V2-7 | 1.04 | 0.54 | 2 | 1.35 | -13.76 | 1.49 | 1.15 | 5.57 | 3.35 | 15.98 | nee |
  | KAND-V2-8 | 0.95 | 0.48 | 16 | 12.35 | 3.75 | 1.76 | 1.46 | 6.15 | 3.48 | 19.99 | nee |
  | KAND-V2-9 | 0.87 | 0.44 | 16 | 12.05 | 3.42 | 1.68 | 1.44 | 6.21 | 3.53 | 20.42 | nee |
  | KAND-V2-10 | 0.86 | 0.44 | 16 | 11.74 | -12.30 | 1.71 | 1.44 | 6.16 | 3.58 | 19.90 | nee |

  Een kolom en geen filter: het vergelijkingsblok rangschikt niets en verbergt niets, en een tabel die alles onder de vloer stilletjes had weggelaten, beantwoordt een vraag die niemand stelde. De verdict-kolom komt uit `meetsAmpFloor` — dezelfde ene regel als de poort — dus kolom en poort kunnen niet uit elkaar lopen.

  **Het antwoord op de vraag die de opdracht stelde** (*zit de beste v2-kandidaat nog steeds op ~3,1 dB, of verandert de 0,01 Ω-verwijdering het beeld?*): geen van beide. Er is niets verwijderd, en er is ook geen nieuwe beste kandidaat — het veld mét de vloer leverde er nul. De drie v1-baselines halen de vloer alle drie met marge (3,32–3,46 Ω), de tien v2-netlists geen van alle (0,01–1,38 Ω), en het gat naar HUIDIG op RMS-vlakheid (0,60 dB tegen 1,87–3,58 dB) staat er nog precies zoals V27 het beschreef. **Zolang de vloer geen zoekdoel is, zegt dit gat niets over de kandidaten en alles over de ene ketenpas.** Dat is de opmaat die de opdracht vroeg, en zij wijst nu naar V30 in plaats van naar de kandidaatgeneratie.

  **Wat er in de code veranderde.** `casus1.fixture.ts` (`casus1AmpMinLoadOhm`, een lookup en geen constante), `casus1V2.fixture.ts` (de vloer in `CASUS1_V2_SETTINGS` en in de kandidaatverklaring), de twee scripts (poort wapenen, `kandidaat_uitkomst` per kandidaat, de vloerkolom, de uitzonderingslijst), `frozenNetlistGates.test.ts` en `goldenClassification.test.ts`. **Onaangeraakt:** `safety`, M-A, M-B, M-C, elke andere poort, `netOptimizer.ts`, `threeWayChain.ts` en de v1-route. Met de vlag uit verandert er niets.

  ---

  **V30 — VERVOLGSESSIE, 27-08-2026: DE VLOER IS NU EEN ZOEKDOEL. GEDEELTELIJK GESLOTEN.**

  De vorige sessie legde met bestand:regel vast dat de gestelde vloer een veto plus een reparatiepas achteraf is en nooit een zoekdoel, en liet de reparatie daarvan expliciet aan een eigen schone sessie. Dit is die sessie.

  **De inventarisatie eerst, want zij bepaalde de vorm van de ingreep.** Alle regelnummers hieronder zijn die van de boom VÓÓR deze sessie — dezelfde die V30 hierboven noteert; na de ingreep zijn ze verschoven.

  1. *De vondst van V30 klopt tegen de huidige boom.* `zFloorBarrier` was een parameter van `tune()` met de literal `false` als default (`netOptimizer.ts:2162`), en de enige aanroepen die hem op `true` zetten waren de twee van de reparatiepas (`3070`, `3073`). De hoofdzoektocht zag de vloer dus niet — bevestigd, niet aangenomen.
  2. *Het gewicht 1200 (`netOptimizer.ts:2303`) was een kaal literal en stond nergens anders.* Het is v1-eigendom, getuned vóór een lokale reparatie ("op 120 kostte een residu van 2,7 Ω een verwaarloosbare 1,2 en de reparatie liep vast"), en niets meet of die stijfheid ook voor een volle zoektocht deugt. Niet veranderd. Wél benoemd: `AMP_FLOOR_BARRIER_WEIGHT`, geëxporteerd, en op de v2-route reist hij als **grijze waarde** mee in de vingerafdruk met de noot *"overgenomen uit v1, niet v2-afgeleid"*. De naam is niet de voor de hand liggende: `noAppWideFloor.test.ts` verbiedt de stam van de verwijderde app-brede vloerconstante, en die guard ving eerst de constante en daarna het commentaar waarin de vangst werd uitgelegd. Precies waar een botte guard voor is.
  3. *Wie leest `ampFloorOhm` en `zSlackOhm` nog meer.* Elke andere lezer (`3058` reparatie-trigger, `3148` de noot, `3356` het snapdoel, `3673` de eindacceptatie, `1872` `zShortOhm` zelf) hangt aan `ampFloorOhm !== null` en niet aan de barrière — die vuren dus al zodra er een vloer gesteld is en het aanzetten van de barrière activeert daar niets nieuws. **Twee plekken hingen wél aan de barrièrevlag en hadden er niets mee te maken**, en dat is de vondst die de ingreep vorm gaf:

     - `2303`+ de corridor-annulering `barr -= 2 * m.corridorSq` — "takgetrouwheid wijkt voor de vloer";
     - `2342` `if (midB !== undefined && !zFloorBarrier && …)` — de blok-coördinaatverfijning wordt overgeslagen.

     Beide zijn gemeten **vóór de reparatiepas**: een lokale hertuning vanaf een afgerond netwerk, zonder vrijheid, die de corridor moet uitgeven om de dip op te tillen. Geen van beide is ooit een uitspraak geweest over een zoektocht die de vloer in haar doelfunctie heeft. Ze hingen aan die vlag omdat tot nu toe "de barrière staat aan" en "dit is de reparatiepas" **dezelfde bit** waren. Was dat zo gebleven, dan had "de vloer is een zoekdoel" er stilzwijgend ook "de corridor telt niet meer en de diepe polish vervalt" bij betekend — twee wijzigingen meer dan er gevraagd is. Daarom draagt `tune()` sinds deze sessie een aparte parameter `zFloorRepairPass`, die alleen de reparatie-aanroepen zetten, en hangen die twee gedragingen daaraan. Met de optie afwezig is elke aanroep byte-identiek aan voorheen; `floorAsGoal.test.ts` scant de bron zodat de scheiding een controleerbare bewering is en geen belofte.

  **Wat er gebouwd is.** `zFloorBarrier?: boolean` in `NetOptimizeOptions`, default `false`; het interne `zFloorBarrier` initialiseert uit `zFloorGoal`, dat op één plek naast `ampFloorOhm` wordt afgeleid en een gestelde vloer EIST (geen vloer ⇒ geen barrière, P4). Op de v2-route is het een **keuze**-sleutel (26 nu, 25 bij F4c; `NetOptimizeOptions` telt 38 sleutels): hij bepaalt wat "goed" is, en de kandidaat wapent hem zodra er een vloer gesteld is, of verklaart hem ABSENT met de P4-reden als er geen is. Nooit `false` bij afwezigheid — `false` zou zeggen dat iemand besloten heeft dat de vloer niet mag sturen, en met een leeg veld heeft niemand iets besloten. De ketens hoefden niets: de hook wordt in beide al als laatste gespreid, dus een gestelde keuze wint per constructie van een overgeërfde.

  ---

  **DE METING: VIJFTIEN KANDIDATEN, TWEE ARMEN, ÉÉN VERSCHIL.** `scripts/measure-v30-floor-goal.ts`, dertig ketenruns, ~30 min. Hetzelfde veld, dezelfde seed (20260827), dezelfde beschermingen, dezelfde gewapende poort. Het enige verschil is `zFloorBarrier`. De "vóór"-arm reproduceert de vorige sessie exact (min |Z| 0,86–1,38 Ω, RMS 2,72–3,58 dB), wat de arm zelf valideert.

  | | vóór (veto) | ná (zoekdoel) |
  | --- | --- | --- |
  | kandidaten | 15 | 15 |
  | haalt de vloer (poort in de run) | **0** | **11** |
  | shortlist | 0 | **10** |
  | netwerk byte-identiek aan de andere arm | — | 4 van 15 |

  Per kandidaat, met de prijs erbij. `min |Z|` is de poortwaarde uit de run; SPL, RMS en fase zijn `buildReport` op het GELEVERDE netwerk — ook voor de kandidaten die de poort weigert, want anders meet de tabel alleen de overlevers.

  | kandidaat (W-M · M-T) | min \|Z\| vóór → ná | vloer | SPL ± vóór → ná | RMS vóór → ná | W-M fase vóór → ná | M-T fase vóór → ná |
  | --- | --- | --- | --- | --- | --- | --- |
  | 396,7 · 1294 | 0,04 → 0,04 | nee → nee | 4,41 → 4,41 | 2,80 → 2,80 | 9,3 → 9,3 | 65,6 → 65,6 |
  | 396,7 · 1491,4 | 1,04 → **2,61** | nee → **ja** | 5,57 → 3,70 | 3,35 → 1,71 | 4,5 → 11,8 | 16,0 → 30,5 |
  | 396,7 · 1719 | 1,16 → **2,59** | nee → **ja** | 5,48 → 3,78 | 3,24 → 1,79 | 6,4 → 7,2 | 17,2 → 31,5 |
  | 396,7 · 1981,2 | 1,27 → **2,62** | nee → **ja** | 5,32 → 3,62 | 3,10 → 1,86 | 12,9 → 12,1 | 17,3 → 31,1 |
  | 396,7 · 2283,5 | 1,38 → **2,59** | nee → **ja** | 5,15 → 3,43 | 2,96 → 1,87 | 20,6 → 11,2 | 20,4 → 26,7 |
  | 466,5 · 1294 | 0,07 → **2,58** | nee → **ja** | 4,39 → 4,50 | 2,72 → 2,49 | 12,5 → 13,1 | **67,0 → 22,2** |
  | 466,5 · 1491,4 | 0,92 → 0,92 | nee → nee | 6,03 → 6,03 | 3,51 → 3,51 | 10,2 → 10,2 | 19,1 → 19,1 |
  | 466,5 · 1719 | 1,01 → 1,01 | nee → nee | 5,92 → 5,92 | 3,40 → 3,40 | 6,9 → 6,9 | 19,2 → 19,2 |
  | 466,5 · 1981,2 | 1,14 → **2,60** | nee → **ja** | 5,67 → 3,44 | 3,24 → 1,81 | 10,5 → 17,0 | 17,9 → 34,0 |
  | 466,5 · 2283,5 | 1,23 → **2,59** | nee → **ja** | 5,45 → 3,37 | 3,09 → 1,84 | 19,0 → 16,7 | 20,4 → 29,0 |
  | 548,5 · 1294 | 0,86 → 0,86 | nee → nee | 6,16 → 6,16 | 3,58 → 3,58 | 15,5 → 15,5 | 19,9 → 19,9 |
  | 548,5 · 1491,4 | 0,87 → **2,61** | nee → **ja** | 6,21 → 4,20 | 3,53 → 1,88 | 13,1 → 20,8 | 20,4 → 27,8 |
  | 548,5 · 1719 | 0,95 → **2,60** | nee → **ja** | 6,15 → 4,35 | 3,48 → 1,96 | **8,4 → 41,2** | 20,0 → 11,2 |
  | 548,5 · 1981,2 | 1,05 → **2,59** | nee → **ja** | 5,87 → 4,17 | 3,34 → 1,86 | **10,0 → 40,5** | 18,0 → 13,8 |
  | 548,5 · 2283,5 | 1,17 → **2,60** | nee → **ja** | 5,59 → 3,48 | 3,17 → 1,89 | 18,1 → 19,9 | 20,1 → 31,2 |

  **De prijs is niet wat de opdracht verwachtte, en dat is de hoofdbevinding.** De opdracht schreef: *"een deel haalt de vloer nu wél tegen een SPL/fase-kost"*. De SPL-kost is er niet — hij is een OPBRENGST. Elke kandidaat die de vloer haalt is óók vlakker geworden: RMS van 2,96–3,58 naar 1,71–1,96 dB, SPL-venster van ±5,15–6,21 naar ±3,37–4,35 dB, rimpel van 5,4–6,4 naar 3,6–4,6 dB. Dat is geen toeval en geen wonder: de "vóór"-netwerken waren voor een groot deel helemaal geen getunede netwerken. De reparatiepas ging bij alle vijftien af, mislukte bij alle vijftien, en een mislukte reparatie wordt teruggedraaid — wat er geleverd werd was wat er vóór de reparatie stond, en bij een deel was dat door de poorthook al teruggezet op het ZAAD. De vloer als zoekdoel levert dus niet "vlakheid ingeruild voor ohms" maar "een zoektocht die afloopt in plaats van eentje die wordt weggegooid".

  De **fase** is wel een prijs, en een echte. M-T-tracking gaat op de meeste kandidaten van 16–20° naar 27–34°. W-M is gemengd en op twee kandidaten ronduit slecht (8,4 → 41,2° en 10,0 → 40,5°, beide op de 548,5 Hz-as). Eén kandidaat gaat spectaculair de goede kant op (466,5 · 1294: M-T 67,0 → 22,2°), en dat is dezelfde kandidaat die van 0,07 Ω naar 2,58 Ω sprong — bij zo'n netwerk zegt de oude fasewaarde niets, want zij is gemeten aan iets dat niet gebouwd kan worden.

  Ter vergelijking, en niet ter conclusie: de v1-baselines staan op RMS 0,60–0,87 dB en fase 3,4–23,8°. Het gat op vlakheid is van ~2,5 dB naar ~1,1–1,3 dB gekrompen; op fase is het gegroeid. **Dit blijft één ketenpas per kandidaat, en de tabel spreekt over die pas, niet over wat een tuner kán.**

  ---

  **HET CORPUS.** De tien bevroren `KAND-V2-*`-netlists zijn hernoemd naar `V28_KAND_1..10` — dezelfde bestanden, byte-identiek gekopieerd onder een gedateerde naam, met hun klasse-B-blokken mee. Dat is geen referentie aanpassen: het zijn dezelfde netlists en dezelfde getallen, en zij blijven staan als de "vóór"-helft van de vergelijking hierboven, reproduceerbaar uit de repository zelf. De nieuwe shortlist (tien van vijftien) staat ernaast onder `KAND_V2_1..10`, opgewekt met dezelfde seed op hetzelfde veld.

  De uitzonderingslijst is daarmee van tien naar dertien namen gegaan en van vorm veranderd. Tien zijn de V28-netlists, die de vloer niet halen om de reden die V30 heeft vastgesteld. **De andere drie zijn een nieuwe bevinding en staan als V32 open:** `KAND_V2_1`, `_2` en `_6` PASSEERDEN de poort in hun eigen run (2,59–2,61 Ω) en missen de vloer als je ze als bestand nameet (2,36–2,45 Ω). Geen tegenspraak maar twee rasters, en de tuner had het zelf al gemerkt — zie V32.

  **Wat er in de code veranderde.** `netOptimizer.ts` (de optie, de afleiding `zFloorGoal`, de gesplitste `zFloorRepairPass`, het benoemde gewicht, en de doctrine-noot boven `BOUNDS` die nu zijn eigen uitzondering benoemt), `optimizer/choices.ts` (de sleutel geclassificeerd, `greyValues`), `optimizer/candidateDeclaration.ts` (de afleiding met haar P4-tegenhanger), `casus1.fixture.ts` (`casus1FilterFromParts`, uitgesneden zodat een geweigerde kandidaat óók gemeten kan worden), de twee scripts, het nieuwe meetscript, `floorAsGoal.test.ts`, `choiceKeyGuard.test.ts`, `goldenClassification.test.ts`, `frozenNetlistGates.test.ts`. **Onaangeraakt:** de reparatiepas zelf, `safety`, elke poort, `crossover3Variants`, de logica van beide ketens, en de v1-route — `toggleRegression.test.ts` is byte-identiek, en dát is het bewijs dat de default `false` doet wat hij zegt.

- V31 (**GEREPAREERD** op 27-08-2026 — een verworpen kandidaat levert een VERWERPING in plaats van zijn zaad; de arbitrage zelf blijft open) — opgeworpen bij de V30-vervolgsessie, 27-08-2026.

  **De aanleiding, gemeten.** Van de vijftien kandidaten haalden er elf de vloer zodra zij een zoekdoel was. De andere vier leverden een netwerk dat **byte-identiek** is aan hun "vóór"-arm, en de reden is niet dat de barrière niets deed. Alle vier keerden vroeg terug: het getypte pass-resultaat `ampFloorRepair` ontbreekt op het teruggegeven object, wat alleen gebeurt op het pad waar de **volle-band veiligheidspoort de hele tune verwerpt** en `optimizeNetworkValues` het zaad teruggeeft.

  | kandidaat | geleverd min \|Z\| | `safetyKinds` | wat de poort zei |
  | --- | --- | --- | --- |
  | 396,7 · 1294 | 0,035 Ω | `protection` | *tweeter protection got worse* |
  | 466,5 · 1491,4 | 0,924 Ω | `protection` | *tweeter protection got worse* |
  | 466,5 · 1719 | 1,014 Ω | `protection` | *tweeter protection got worse* |
  | 548,5 · 1294 | 0,859 Ω | `valley` | *the crossing sank into a 11 dB hole* |

  **En de verworpen tune wás beter.** Bij de eerste noteert `ampFloorNote` letterlijk *"the rejected tune — amp-load floor: system impedance dips to 1,8 Ω"*: de barrière tilde het netwerk van 0,035 Ω naar 1,8 Ω, bereikte de vloer niet, en de veiligheidspoort gooide daarna het hele resultaat weg. Wat de ontwerper krijgt is 0,035 Ω. **Een netwerk dat op twee eisen tegelijk faalt wordt hier vervangen door een netwerk dat op één ervan veel erger faalt.**

  Dat is een uitspraak over de ARBITRAGE en niet over de veiligheidspoort. Die poort heeft gelijk: een tune die de tweeterbescherming verslechtert mag niet geleverd worden, en zonder hem leverde de eerste V27-fixture 0,00 Ω met een keurige rimpel. Het probleem is dat de arbitrage tussen "de versterker moet dit kunnen drijven" en "de tweeter moet dit overleven" vandaag een **alles-of-niets-veto op de hele tune** is, met terugval op een zaad dat op geen van beide is beoordeeld. Drie mogelijke vormen, geen ervan hier gekozen:

  1. **Beide in de doelfunctie.** De tweeterbescherming krijgt, net als de vloer nu, een barrièreterm, zodat de zoektocht de afruil zelf maakt in plaats van hem aan een veto over te laten. Risico: dit is precies de weg waarlangs `fxOf` volloopt met harde eisen, en de netOptimizer-noot boven `BOUNDS` telt al twee dure metingen die daartegen pleiten.
  2. **Terugval op de beste toelaatbare tussenstand** in plaats van op het zaad. Goedkoop en eerlijk, maar het vraagt dat de tuner tussenstanden bewaart en dat "toelaatbaar" al tijdens de zoektocht bekend is.
  3. **Weigeren met naam en toenaam.** De kandidaat levert niets en meldt "geen netwerk gevonden dat beide eisen haalt", in plaats van een zaad dat als ontwerp leest. Het minst werk en het meest in de geest van P4 — maar het verandert de contractvorm van de keten.

  **Wat het zou beslechten:** één meting die er niet is — een run waarin de barrière en de tweeterbescherming allebei in de doelfunctie zitten, op deze vier kandidaten, naast de huidige. Zolang die er niet is, is elke keuze hierboven een voorkeur. **Open.**

  ---

  **V31 — VERVOLGSESSIE, 27-08-2026: OPTIE 3 GENOMEN. DE ARBITRAGE BLIJFT OPEN.**

  **DE INVENTARISATIE.** Regelnummers van de boom vóór deze sessie (`851c579`).

  | stap | bestand:regel | wat er gebeurt |
  | --- | --- | --- |
  | de veiligheidspoort verwerpt | `netOptimizer.ts:3915` | `return { parts: cloneParts(parts), … }` — het ZAAD, met `tuned: 0`, `safetyNote` en `safetyKinds`, en zónder `ampFloorRepair` |
  | de gevoeligheidspoort verwerpt (solo) | `netOptimizer.ts:3836` | dezelfde vorm, zonder `safetyKinds` — geen enkele meerwegroute wapent hem |
  | de worker neemt het over | `worker.ts:834` | `const result = run(…)`, en niets kijkt naar `safetyNote` |
  | het zaad wordt gemeten | `worker.ts:868` | `judge(result)` op het ZAAD; die getallen dragen het label van de kandidaat |
  | het bereikt de shortlist | `shortlist.ts:176` | `parts: c.parts` — een rij, dus een aanbod om te bouwen |
  | en het scherm | `App.tsx:6940` | `v2Field.push({ parts: c.result.parts, … })` |

  Twee dingen die de vorm bepaalden. **De detectie moet STRUCTUREEL zijn, niet tekstueel:** `netOptimizer.ts` zegt zelf bij `safetyKinds` dat de prozanoot nooit gelezen mag worden om iets te beslissen (dat is hoe `zOk` vier dingen tegelijk ging betekenen). `safetyNote` bestáát op precies de twee returns die een hele tune weggooien en nergens anders — dus de AANWEZIGHEID ervan is het signaal, en de tekst blijft voor een mens. **En de veiligheidsregel mocht niet veranderen:** zij heeft gelijk, en de opdracht verbood het.

  **WAT ER GEBOUWD IS — DRIE LAGEN, GEEN ERVAN EEN BESLUIT.**

  1. `netOptimizer.ts` krijgt één instrumentatie-optie, `rejectedTuneReport` (POLISH; sleuteltelling 38 → 39). Aan: de twee wholesale-returns dragen `rejectedTune` (de metrieken van wat werd weggegooid) en `rejectedParts`. Uit — élke v1-run — is het resultaatobject byte-identiek aan voorheen. Geen enkele regel leest deze velden; ze veranderen niets.
  2. `worker.ts` herkent de verwerping, en **trekt het netwerk in**: `result.parts` wordt leeg, de poorten worden niet geëvalueerd, `measurements` wordt de niet-geoordeelde toestand, en `rejectedParts` wordt gestript vóór de terugreis — het beste tussenresultaat wordt hier gemeten (min \|Z\|, SPL-venster, RMS, fase) en gaat als GETALLEN mee, nooit als onderdelen. Wat een aanroeper krijgt is `rejection: { kinds, reason, rejectedTune, note }`.
  3. `shortlist.ts` krijgt een DERDE uitgang naast "een eis" en "een poort". Bewust apart: de ladder mag de eerste verruimen, mag de tweede nooit aanraken, en heeft bij de derde niets te verruimen — er ís geen ontwerp. De verwerping verschijnt in `rejected` mét de regel die haar veroorzaakte, nooit als rij; en de diagnose ("wat kwam het dichtst in de buurt") kijkt niet meer naar een kandidaat die niets geleverd heeft, want dat zou het zaad tot beste bijna-misser maken.

  **DE METING, EN ZIJ ZEGT IETS ANDERS DAN V30 VERWACHTTE.** Op het opnieuw opgewekte veld (dezelfde seed, dezelfde vloer, ná V32) leveren er nog **twee** van vijftien geen netwerk, allebei op `protection`:

  | kandidaat (W-M · M-T) | regel | de GEWEIGERDE tune: min \|Z\| | SPL-venster | RMS |
  | --- | --- | --- | --- | --- |
  | 466,5 · 1491,4 | `protection` | 2,59 Ω | **±72,52 dB** | 1,70 dB |
  | 548,5 · 1294 | `protection` | 2,59 Ω | **±72,70 dB** | 1,43 dB |

  **En hier kantelt het oordeel over de arbitrage.** V30 noteerde dat de verworpen tune BETER was (de barrière tilde 0,035 → 1,8 Ω en het resultaat werd weggegooid). Zodra de poort de volle sweep leest, is dat beeld weg: de geweigerde tunes hálen de vloer nu (2,59 Ω) en hebben een SPL-venster van ±72 dB — één diepe uitdovingsnotch, want de RMS is met 1,4–1,7 dB gewoon netjes. Dat is precies wat een verslechterde tweeterbescherming eruit hoort te zien, en het is de metriek die de veiligheidspoort meet (`protSqDb`). **De poort had gelijk, en V31's reparatie is nu juist wat dat laat zien**: vóór V31 kreeg de ontwerper het zaad met de getallen van het zaad; nu krijgt hij "geweigerd wegens tweeterbescherming, en wat geweigerd werd stond op 2,59 Ω met een venster van ±72 dB".

  **WAT DAARMEE OPEN BLIJFT, en het is de kern van V31.** De arbitrage tussen "de versterker moet dit kunnen drijven" en "de tweeter moet dit overleven" is nog steeds een alles-of-niets-veto. Optie 3 uit de lijst hierboven is genomen — weigeren met naam en toenaam — en dat is de kleinste van de drie: hij repareert wat er GERAPPORTEERD wordt, niet wat er GEZOCHT wordt. Optie 1 (beide in de doelfunctie) en optie 2 (terugval op de beste toelaatbare tussenstand) staan onverkort open, en de meting die ertussen zou beslissen is nog steeds niet gedaan. Wat deze sessie wél heeft toegevoegd is dat die meting nu goedkoper is: het `rejectedTune`-blok maakt zichtbaar wat een veto kost, per kandidaat, zonder de run opnieuw te draaien.

  **WAT ER IN DE CODE VERANDERDE.** `netOptimizer.ts` (één optie, twee spreads, nul besluiten), `optimizer/worker.ts` (`CandidateRejection`, de intrekking), `optimizer/shortlist.ts` (de derde uitgang, `rejected`, selectieversie 1.0 → 1.1), `optimizer/choices.ts` (de sleutel geclassificeerd), `App.tsx` (de verwerping reist mee het veld in), plus `wholesaleRejection.test.ts` en de generator. **Onaangeraakt:** de veiligheidspoort zelf, elke veiligheidsregel, de barrière, het gewicht en de reparatiepas.

- V32 (**GESLOTEN** op 27-08-2026 — elke elektrische poort oordeelt op de gemeten impedantiesweep) — opgeworpen bij de V30-vervolgsessie, 27-08-2026.

  **De aanleiding.** Drie van de tien nieuw bevroren netlists — `KAND_V2_1`, `_2`, `_6` — passeerden `M-B/|Z|` in hun eigen ketenrun met 2,594–2,606 Ω, en missen dezelfde vloer als je het BESTAND nameet: 2,447 / 2,358 / 2,388 Ω. Geen van beide metingen is fout; zij kijken naar een ander gebied. De minima liggen op **82,5 / 83,7 / 82,1 Hz**, en het analyseraster van de keteninvoer begint op 200 Hz.

  **En dit is niet "de keten kijkt niet laag genoeg".** Nagemeten, want dat was de eerste verklaring en zij was fout:

  | raster | bereik | wie leest het |
  | --- | --- | --- |
  | `CASUS1_V2_GRID` (analyse) | 200 Hz – 20 kHz, 96 punten | de v2-POORTREFERENTIE, die hierop bevroren wordt |
  | het `safety`-raster | **20,5 Hz** – 20 kHz, 240 punten | de TUNER, voor `zShortOhm`, de reparatietrigger en de eindacceptatie |

  De tuner ziet die dip dus wél. Sterker: hij heeft erop gereageerd. In `casus1_v2_herkomst.json` staat per kandidaat `pas.ampFloorRepair`, en het patroon is exact:

  > **Alle vier de kandidaten met `ampFloorRepair: 'failed'` zijn precies de vier waarvan het minimum onder 200 Hz onder de vloer ligt. Alle zeven met `'none'` halen de vloer ook op de volle sweep.** Vier op vier, zeven op zeven.

  De tuner probeerde te repareren, faalde, en leverde af; de poort — die alleen boven 200 Hz keek — zei geslaagd. **Twee oordelen over dezelfde eis, op twee rasters, en het strengste van de twee is niet het oordeel dat wordt afgedrukt.**

  **Waarom de rasterbodem daar ligt, en waarom dat voor impedantie niet klopt.** 200 Hz is waar de VERRE-VELDMETINGEN van deze set beginnen. Voor een responsie-eis is die grens juist — een respons die niet gemeten is, wordt niet beoordeeld. Voor een impedantie-eis is zij verkeerd, en `netOptimizer.ts` zegt dat zelf al bij `band`: *"the amplifier-load floor and its repair pass deliberately keep working on the FULL grid regardless: they are impedance criteria, and an impedance measurement has no gate"*. Binnen de tuner wordt die regel nageleefd; de v2-poortreferentie is er nooit aan gehouden.

  Het is geen resolutiekwestie. Het vierde grensgeval, `KAND_V2_10`, heeft zijn minimum op 420 Hz — midden in het raster — en haalt de vloer met 0,004 Ω. Wat hier bijt is de BODEM, niet de dichtheid.

  **Een vermoeden, niet getoetst.** De vloer als zoekdoel duwt het netwerk naar de laagste \|Z\| die de DOELFUNCTIE ziet, en de doelfunctie leest `zShortOhm` — dus in principe wel het veiligheidsraster. Toch liggen drie van de tien minima nu op ~82 Hz, terwijl de tien V28-netlists (zonder barrière) er geen enkele onder 800 Hz hadden. Of dat verplaatsing is of toeval van drie gevallen, zegt deze sessie niet.

  **De richting van de reparatie is duidelijk en bewust niet genomen:** de impedantiekant van de v2-poortreferentie hoort de volle gemeten sweep te dekken, net als het veiligheidsraster, ook waar er geen responsie is. Dat raakt `casus1V2.fixture.ts`, `gates.ts` en de vorm van `GateReference`; het verandert de poortuitslagen van élk bestaand v2-corpus; en het verdient dezelfde behandeling als V30 zelf — een eigen sessie met een vóór/ná-meting, niet een correctie die onderweg meelift. **De drie netlists staan intussen in `vloeruitzonderingen` met deze reden erbij en mogen niet gebouwd worden.** Open.

  ---

  **V32 — VERVOLGSESSIE, 27-08-2026: ELKE ELEKTRISCHE POORT OORDEELT OP DE GEMETEN SWEEP. GESLOTEN.**

  **DE INVENTARISATIE EERST**, want zij bleek breder dan M-B/|Z|. Alle regelnummers zijn die van de boom VÓÓR deze sessie (`851c579`).

  | wie | bestand:regel (vóór) | oordeelde op | hoort te oordelen op |
  | --- | --- | --- | --- |
  | de bevroren referentie | `gates.ts:525` (`buildAnalysis(netlist, ref.grid, …)`) | het ketenraster | — (zij is de bron van de vier hieronder) |
  | M-A, dissipatiefractie | `gates.ts:540` | het ketenraster | de sweep |
  | M-B/EPDR | `gates.ts:542` | het ketenraster | de sweep |
  | M-B/\|Z\| | `gates.ts:542` (`minZOhm` uit dezelfde `epdr()`) | het ketenraster | de sweep |
  | M-C, spanning op f_s | `gates.ts:568` | het ketenraster | de sweep |
  | "hoogdoorlaatbeschermd" | `gates.ts:466`, `558` | het ketenraster | de sweep |
  | doorlaatband-\|Z\|-mediaan (voedt twee A5d.6-inversies) | `worker.ts:503` | het ketenraster | de sweep |
  | dezelfde mediaan, in het rapport | `report.ts:769` | **de ruwe sweep** | — (die was al goed) |
  | het analyseraster van het rapport | `report.ts:351` | de sweep-unie, 1600 punten | — (die was al goed) |

  Drie dingen vielen daarbij op, en alle drie hebben de vorm van de ingreep bepaald.

  1. **Het is niet één poort maar zes lezers**, en zij lezen allemaal uit dezelfde twee regels: `dissipation(analysis)` en `epdr(analysis)` op `ref.grid`. Eén raster verzetten repareert ze alle zes tegelijk — of vergeet ze alle zes tegelijk.
  2. **Het rapport deed het al goed.** `report.ts` bouwde zijn analyseraster uit de UNIE van de driversweeps (1600 punten, randen vlak gehouden, met een `problems`-regel erbij) en las de mediaan van de ruwe sweep. De v2-route deed geen van beide. Dit was dus nooit "welk raster is juist" maar "waarom zijn er twee implementaties" — en één ervan had het antwoord al.
  3. **`netOptimizer.ts` draagt de regel zelf**, bij `band`: *"the amplifier-load floor and its repair pass deliberately keep working on the FULL grid regardless: they are impedance criteria, and an impedance measurement has no gate."* De tuner leefde die na; de poortreferentie is er nooit aan gehouden.

  **WAT ER GEBOUWD IS.** Eén functie, `impedanceReferenceFrom` in het nieuwe `optimizer/impedanceReference.ts`, en twee aanroepers: `report.ts` (voor zijn analyseraster) en `freezeGateReference` (voor de nieuwe helft `GateReference.impedance`). Zelfde uitgestrektheid, zelfde resolutie (`ANALYSIS_GRID_POINTS`), zelfde randbehandeling, zelfde zin erover. "Poort en paneel zeggen hetzelfde" is daarmee een IDENTITEIT geworden in plaats van een toevalligheid die standhoudt tot iemand er één bewerkt.

  `evaluateGates` splitst sindsdien in twee analyses: de RESPONSANALYSE op `ref.grid` leidt nog uitsluitend de kruispunten af (dat is een responsgrootheid en haar bodem hoort de verre-veldspan te zijn), en de ELEKTRISCHE analyse op `ref.impedance.grid` levert élke ohm, elke dB en de beschermingsafleiding.

  **GEEN SWEEP, GEEN OORDEEL, EN GEEN TERUGVAL.** Ontbreekt de sweep — of ontbreekt hij voor één tak, want een systeemimpedantie is geen grootheid per driver — dan levert de poort GEEN waarde, met een zin die de ontbrekende invoer noemt (de lek-2-vorm van F4b). Terugvallen op het responsraster zou precies het oordeel herstellen dat hier wordt ingetrokken, en het stil doen. Dat betekende wel dat de casus-1-fixture voortaan de gemeten feiten móest meesturen: zij stuurde er nul, en `factsForWorker` — het bruggetje dat `App.tsx` al gebruikt — stuurt ze nu alle vijf. Halve feiten sturen (de sweep wél, het geldigheidsinterval van dezelfde meting niet) is de incoherentie waar F4b's lek 2 over ging.

  **DE ENE ZACHTE PLEK, GEMETEN IN PLAATS VAN BEREDENEERD.** Het oordeelraster is de UNIE van de sweeps en niet de doorsnede — de doorsnede is op deze set 200 Hz en dat is de blindheid zelf, van de andere kant benaderd. De prijs: de tweetersweep begint op 199,95 Hz, dus onder die grens wordt de tweeterimpedantie vlak gehouden en rust élk oordeel op 82 Hz deels op extrapolatie. Het fysische antwoord is dat een seriecondensator die tak daar allang uit beeld heeft gehaald. Dat is een argument; hier is de meting: het geëxtrapoleerde gebied maal tien en maal een tiende — een factor honderd — beweegt het systeemminimum op géén enkele bevroren netlist, tot vier decimalen. Vastgelegd in `frozenNetlistGates.test.ts`, zodat het antwoord op een ontwerp dat er ooit wél van afhangt een tweetersweep is die lager reikt, en geen ruimere test.

  ---

  **DE METING: WAT DE REPARATIE MET HET CORPUS DEED.** Zelfde veld, zelfde seed (20260827), zelfde vloer, zelfde beschermingen. De "vóór"-helft is geen tweede run maar het BEVROREN V30-corpus, want V32 is geen optie die je uit kunt zetten; beide helften gaan door hetzelfde `buildReport`-pad. `scripts/compare-v30-v32-corpus.ts`, seconden.

  | | vóór (V30-corpus) | ná (V31/V32-corpus) |
  | --- | --- | --- |
  | veld | 15 | 15 |
  | leverde geen netwerk (V31) | 4 (als zaad afgeleverd) | **2 (als verwerping)** |
  | netwerk geleverd dat een poort weigert | 0 zichtbaar | **6** |
  | shortlist / bevroren | 10 | **7** |
  | haalt de vloer ALS BESTAND | **7 van 10** | **7 van 7** |

  **De drie die uitvallen zijn precies de drie die V32 aanwees**, en niets anders beweegt:

  | kandidaat (W-M · M-T) | min \|Z\| als bestand | @ Hz | vóór → ná |
  | --- | --- | --- | --- |
  | 396,7 · 1491,4 | 2,45 | 82,5 | bevroren → **uit de shortlist** |
  | 396,7 · 1719 | 2,36 | 83,7 | bevroren → **uit de shortlist** |
  | 396,7 · 2283,5 | 2,39 | 82,1 | bevroren → **uit de shortlist** |
  | 466,5 · 1294 | 2,55 | 420,2 | bevroren → bevroren |
  | 466,5 · 1981,2 | 2,59 | 1125,3 | bevroren → bevroren |
  | 466,5 · 2283,5 | 2,58 | 1231,8 | bevroren → bevroren |
  | 548,5 · 1491,4 | 2,60 | 1032,9 | bevroren → bevroren |
  | 548,5 · 1719 | 2,57 | 132,2 | bevroren → bevroren |
  | 548,5 · 1981,2 | 2,57 | 132,2 | bevroren → bevroren |
  | 548,5 · 2283,5 | 2,59 | 1243,5 | bevroren → bevroren |

  **De zeven overlevers zijn BYTE-IDENTIEK aan hun V30-voorgangers** — nagemeten, onderdeel voor onderdeel, en het is de scherpste uitspraak die deze sessie kan doen: V32 heeft geen enkel ontwerp veranderd, het heeft er drie ingetrokken die niet gebouwd hadden mogen worden. SPL, RMS en beide fasekolommen staan in de vergelijkingstabel en zijn overal identiek (`compare-v30-v32-corpus.ts`).

  De uitzonderingslijst is daarmee van dertien namen naar dertien namen gegaan en van SOORT veranderd: **geen enkele LEVENDE netlist staat er nog in.** Tien zijn V28 (bevroren vóór de vloer een zoekdoel was) en drie zijn V30 (bevroren toen de poort nog blind was onder 200 Hz) — beide gedateerde corpora, meetobject en geen ontwerp. De lijst hoorde leeg te raken van levende netlists, en dat is gebeurd.

  **WAT DE REPARATIE ZICHTBAAR MAAKTE EN NIET OPLOST — DE 396,7 Hz-AS.** Van de vijftien kandidaten leveren er zes een netwerk dat de vloer mist, en vijf daarvan zitten op de 396,7 Hz-as: 0,01 / 1,04 / 1,16 / 1,27 / 1,38 Ω. Dat zijn exact de "vóór"-waarden van de V30-tabel, en de reden is te lezen in `gateRefusals`: *"value tune refused: M-B/\|Z\|: 2.42 Ω falls below the stated floor of 2.60 Ω"*. De poort weigert nu terecht, `tune()` valt terug op het zaad (`netOptimizer.ts:2791`, `cur = asIs(seedParts)`), en wat er wordt afgeleverd is ongetuned. **De oorzaak is dat de zoektocht niet kan mikken op wat de poort handhaaft:** de barrièreterm leest `m.zShortOhm` van de metriek op het EVALUATIERASTER (`netOptimizer.ts:2401` op `1953`), dus zij ziet de dip op 82 Hz niet, terwijl de poort hem sinds V32 wél ziet. Doelfunctie en poort kijken nu naar twee verschillende gebieden — dezelfde vorm als V30, één laag verder. De reparatie ligt voor de hand (`zShortOhm` van het veiligheidsraster laten meewegen in de barrière) en is deze sessie NIET genomen: de opdracht verbood elke wijziging aan de barrière, en zo'n wijziging verdient dezelfde behandeling als V30 en V32 — een eigen sessie met een vóór/ná-meting. **Staat als V33 open.**

  **WAT ER IN DE CODE VERANDERDE.** Nieuw: `optimizer/impedanceReference.ts`, `optimizer/gateGrid.test.ts`. Gewijzigd: `optimizer/gates.ts` (de tweede helft van de referentie, de gesplitste analyses, `whyNull` en `judged_on`), `report.ts` (rasterbouw via de gedeelde functie), `optimizer/worker.ts` (sweeps in de referentie, de mediaan van de sweep, de noten), `optimizer/v2.fixture.ts` (eigen sweeps), `casus1V2.fixture.ts` (`casus1V2Facts`), de drie scripts, `frozenNetlistGates.test.ts`, `borderFacts.test.ts`, `f4cRegression.test.ts`. **Onaangeraakt:** het ketenraster, de barrière, het gewicht, de reparatiepas, `safety`, en de v1-route — `toggleRegression.test.ts` is byte-identiek.

- V33 (**GESLOTEN** op 27-08-2026 — doel en poort lezen per constructie één getal, en een poort die de hele tune weigert levert een verwerping) — opgeworpen bij de V31/V32-sessie, 27-08-2026.

  **De aanleiding, gemeten.** Van de vijftien kandidaten leveren er zes een netwerk dat de gestelde vloer mist, en vijf daarvan zitten op de 396,7 Hz-as: 0,01 / 1,04 / 1,16 / 1,27 / 1,38 Ω. Dat zijn exact de "vóór"-waarden uit V30's tabel — dus deze kandidaten leveren wat zij leverden toen de vloer nog géén zoekdoel was.

  **Waarom.** `gateRefusals` zegt het letterlijk: *"value tune refused: M-B/|Z|: 2.42 Ω falls below the stated floor of 2.60 Ω"*. De poort weigert de waardetune, `tune()` valt terug op het zaad (`netOptimizer.ts:2791`), en wat wordt afgeleverd is ongetuned. De barrièreterm die de zoektocht naar de vloer moet duwen leest `m.zShortOhm` van de metriek op het EVALUATIERASTER — 200 Hz en hoger op deze set. Sinds V32 handhaaft de poort op de volle gemeten sweep. **Doelfunctie en poort kijken dus opnieuw naar twee verschillende gebieden, en dat is dezelfde vorm als V30, één laag verder.**

  De voor de hand liggende reparatie is `worstZOf` (die het veiligheidsraster al meeneemt en al bestaat, `netOptimizer.ts:3145`) ook de barrièreterm te laten voeden. **Bewust niet genomen:** de opdracht van deze sessie verbood elke wijziging aan de barrière, aan het gewicht en aan de reparatiepas, en zo'n wijziging verdient dezelfde behandeling als V30 en V32 — een eigen sessie met een vóór/ná-meting op hetzelfde veld met dezelfde seed, niet een correctie die onderweg meelift. Het risico dat gewogen moet worden staat al in de noot boven `BOUNDS`: de vloer als fx-term is twee keer gemeten en beide keren duur geweest, en de barrière is precies de vorm die dat moest omzeilen.

  **Wat er intussen NIET misgaat:** deze vijf worden door de poort geweigerd en komen niet in de shortlist. Er wordt dus niets onbouwbaars aangeboden — het veld is alleen kleiner dan het zou kunnen zijn. **Open.**

  ---

  **V33 — VERVOLGSESSIE, 27-08-2026: DE BARRIÈRE LEEST DE POORT HAAR EIGEN GETAL. GESLOTEN.**

  **DE INVENTARISATIE EERST**, want zij bepaalde de vorm van de ingreep en zij leverde één bevinding op die de opdracht niet voorzag. Alle regelnummers zijn die van de boom VÓÓR deze sessie (`4cb9cc6`).

  *1. Waar de barrière `zShortOhm` las.* `netOptimizer.ts:2442`, binnen `objective`, op de metriek van regel `2402` — en die draait op `optW.freq`, het GEDECIMEERDE EVALUATIERASTER (`1243`, `1256`): het ketenraster van de casus met stapgrootte `grid.length / 150`, wat op casus 1 stapgrootte 1 is en dus 96 punten van 200 Hz tot 20 kHz. `zShortOhm` zelf wordt op `1994` uit `zMinOhm` van dát raster afgeleid.

  *2. Heeft de tuner al een raster tot 20 Hz — en waarom las de barrière dat niet?* Ja, en dat is precies de tegenstelling die V32 al noteerde. `opts.safety` draagt een eigen raster (op casus 1 20,5 Hz–20 kHz, 240 punten), en `worstZOf` (`3184`) neemt het MAXIMUM van het tekort op het evaluatieraster en op dat veiligheidsraster. Wie leest `worstZOf`: de reparatie-trigger, de acceptatie van de reparatie, en het geleverde eindoordeel. Wie las hem NIET: de barrièreterm. De veiligheidsREGEL las dus wél laag en het zoekDOEL niet — één requirement, twee gebieden, en de strengste lezing zat in de regel die achteraf oordeelt.

  Waarom de barrière hem niet las is geen vergissing maar een plaats: de barrière zit BINNEN `objective`, waar het evaluatieraster het enige raster is dat toch al berekend wordt, en `worstZOf` zit in de ACCEPTATIE ná de tune. Dat was verdedigbaar zolang de barrière alleen door de reparatiepas werd gezet — één lokale hertuning vanaf een afgerond netwerk, waarna dezelfde acceptatie hem alsnog op het veiligheidsraster afrekende. V30 heeft hem een zoekterm gemaakt en die plaats niet verlegd; V33 is dat.

  *3. Wat er gebeurt als `gateViolation` binnen `tune()` een stap weigert.* Er zijn acht aanroepen van `gateOk`, en zij zijn niet gelijk. Zeven weigeren een STAP en houden `cur` vast — de basin-challenge (`2642`), de auditverwijdering (`2794`), de doelbarrière-tune (`2862`), de prune (`2977`), de escalatie (`3007`), de na-structuur-settle (`3019`) en de condensatorkrimp (`3147`). Dat is een weigering die niets weggooit: wat er stond blijft staan, de regel komt in `gateRefusals`, en er is niets aan te repareren.

  De achtste is anders. `netOptimizer.ts:2832` — `if (opts.gateViolation && !gateOk(cur.parts, 'value tune')) cur = asIs(seedParts);` — gooit de HELE waardetune weg en zet de werkstand terug op het zaad (`asIs`, `2820`, met `freeCount: 0`: er is niets getuned). De run gaat van daaraf verder, en wat er uiteindelijk uitkomt reist als een gewoon resultaat naar `worker.ts:993` (`const delivered = run(...)`), wordt daar op `1077` gemeten alsof het een ontwerp is, en bereikt `shortlist.ts:221` (`parts: c.parts`) als een RIJ — een aanbod om te bouwen. Dat er niets getuned is, is nergens in dat pad zichtbaar: `tuned` staat op 0, maar de shortlist leest dat veld niet. Dit is de vijf-van-vijftien van V33: `gateRefusals` zegt *"value tune refused: M-B/|Z|: 2.42 Ω falls below the stated floor of 2.60 Ω"*, en de rij die verschijnt draagt 0,01–1,38 Ω.

  *4. Draagt er ná V32 en ná deze sessie nog een lezer van het KETENRASTER een oordeel of een doel?* **Ja, twee families, en geen van beide is hier omgezet — de opdracht zei noemen.**

  - **De bronweerstandsprobe.** `rSourceOf` (`1084`) roept `sourceResistanceOhm(ps, { grid, driverZ, … })` aan met het KETENRASTER, en die waarde voedt vier dingen die allemaal oordelen: de harde diskwalificatie `rSourceDisqualifyOhm` (`1171`–`1175`), de structuurzet-bewaking `rsSafe` (`2881`–`2883`), de audittier van 1,0 Ω (`3410`) en het geleverde rapport (`3849`). Daarnaast is er een DOEL: `dissRatio` (`1533`) = R_source/R_e op dezelfde probe, dat via `dissW · dissRatio²` rechtstreeks in `fxOf` zit (`2166`).

    En op casus 1 is dat geen theoretisch bezwaar. `sourceProbeIndex` valt terug op "de impedantiepiek in het onderste kwart van het raster" wanneer er geen f_b gesteld is, en op deze meetset levert dat voor de woofer **index 24, 640,2 Hz** — de BOVENrand van zijn eigen zoekvenster (`stop = max(400, grid[24])`), niet een resonantie: de resonantie van deze woofer ligt onder de rasterbodem. De bewaking die daar bestaat (`inBand: best > 0`) verwerpt alleen index 0. Nagemeten deze sessie, met `sourceProbeIndex` op de casus-1-keteninvoer: woofer 640,2 Hz `inBand: true`, mid 200,0 Hz `inBand: false`, tweeter 640,2 Hz `inBand: true`. De dissipatieterm en de diskwalificatiegrens van casus 1 worden dus gewogen op een frequentie die de rasterrand aanwijst. **Opgeworpen als V34.**

  - **De relatieve impedantiebewaking in de structuurzetten.** `safe` (`2767`), `safeEsc` (`2893`) en de basin-challenge (`2663`) vergelijken `m.zShortOhm <= ref.zShortOhm + 0,1` uitsluitend op het evaluatieraster. Dat zijn veiligheidsregels, de opdracht verbood ze aan te raken, en ze zijn RELATIEF (zij vergelijken twee netwerken op hetzelfde raster) — dus zij liegen niet zoals een absolute poort dat zou doen. Genoemd, niet omgezet.

  **WAT ER GEBOUWD IS — TWEE DINGEN, EN ALLEBEI EEN VORM DIE AL BESTOND.**

  1. **De bron van de kortste-impedantie-grootheid is een KEUZE geworden, met DRIE waarden.** `zFloorBarrierSource?: 'grid' | 'safety' | 'sweep'`, default afwezig = `'grid'` = wat de barrière altijd al las. Dat is niet beleefdheid maar noodzaak: de reparatiepas op de v1-route roept diezelfde barrière aan, en die bron mocht daar niet bewegen.

     | waarde | raster | wie leest hem |
     | --- | --- | --- |
     | `'grid'` | het gedecimeerde evaluatieraster, op casus 1 96 punten vanaf 200 Hz | de default, en dus élke v1-run |
     | `'safety'` | het volle-band veiligheidsraster van de tuner (`opts.safety`), op casus 1 240 punten, 20,5 Hz–20 kHz | **de v2-route** |
     | `'sweep'` | de gemeten impedantiesweeps van de drivers, `ANALYSIS_GRID_POINTS` = 1600 punten, 10–20 317 Hz — het raster waarop de poort oordeelt | de referentiearm van deze entry |

     Alle drie gaan door **dezelfde lezer** (`systemMinImpedanceOhm` → `minImpedanceAt`), en dat is de vorm van de ingreep: het RASTER is een parameter, geen tweede implementatie. De data voor `'sweep'` reist ernaast als `zFloorBarrierImpedance` (POLISH), gevuld door de worker uit precies het `ImpedanceReference`-object waarop de poort bevroren is; `'safety'` heeft niets nodig, want de veiligheidsset is al een keuze die de kandidaat stelt. Twee sleutels en niet één, om dezelfde reden als V30 en V33 twee entries zijn: WELKE band het doel meet is een keuze, WAT er op die band staat is de meting die de run al in handen heeft. Sleuteltelling 39 → 41.

     Eén regel in `netOptimizer.ts` veranderde: `barr += AMP_FLOOR_BARRIER_WEIGHT * (barrierShortOhm(m, work) / ampFloorOhm!) ** 2`. Op `'grid'` geeft `barrierShortOhm` letterlijk `m.zShortOhm` terug — zelfde uitdrukking, zelfde volgorde, dus byte-identiek.

     **`minImpedanceAt` is de gedeelde regel.** Zij staat in `impedanceFloor.ts`, naast `meetsAmpFloor`, en zij is de énige plek waar wordt beslist wat "de kortste impedantie" is (eerste index wint, strikte `<`, geen epsilon). `epdr()` — waar de poortwaarde vandaan komt — leest hem sinds deze sessie ook. Op `'sweep'` levert dat een IDENTITEIT: `frozenNetlistGates.test.ts` assert dat de barrièregrootheid en de poortwaarde voor elke bevroren netlist met `toBe` gelijk zijn, niet met een tolerantie.

     **WAAROM DE v2-ROUTE TOCH `'safety'` STELT, EN NIET DE IDENTITEIT.** Omdat de identiteit een prijs heeft die niemand betaalt: de sweeplezing maakt van een casus-1-ketenrun elf minuten in plaats van één (gemeten, zie hieronder). `'safety'` heeft dezelfde UITGESTREKTHEID en dezelfde lezer, en verschilt alleen in resolutie — dus de vraag is niet "is het hetzelfde getal" maar "hoe ver ligt het ervandaan", en dat is een meting:

     | | waarde |
     | --- | --- |
     | vloerspeling waarmee de tuner zelf werkt (`ampFloorSlackOhm`, 2 % van 2,6 Ω) | **0,0520 Ω** |
     | grootste verschil op het LEVENDE corpus (10 kandidaten + 3 v1-baselines) | **0,0075 Ω** (KAND_V2_5) |
     | grootste verschil over het HELE casusboek, gedateerde corpora erbij | 0,0728 Ω — `V28_KAND_2` |
     | netlists waarop de twee rasters een ANDER OORDEEL over de vloer vellen | **0** |

     Het levende corpus leest dus zeven keer dichter bij de poortwaarde dan de speling die deze app al hanteert. De ene uitschieter is eerlijk en hij staat in de test: `V28_KAND_2` heeft een minimum van 0,006 Ω — een kortsluiting met een dip zo smal dat 240 punten ernaast landen — en juist daar veroordelen béíde lezingen hem. Dat laatste is de assert die er werkelijk toe doet en hij loopt over élke bevroren netlist: **de twee rasters zijn het op geen enkele netlist oneens over de vraag of de gestelde vloer gehaald wordt.** Een zoektocht die op het ene mikt, mikt daarmee nergens op een netwerk dat de poort op het andere zou weigeren.

     Beide asserts staan naast elkaar in `frozenNetlistGates.test.ts`, met de grootste afwijking in de faalboodschap: gaat het ooit mis, dan zegt de suite met hoeveel, en het antwoord is dan een dichter veiligheidsraster of de dure bron — niet een ruimere test.

     **GEEN TERUGVAL.** Een kandidaat die een bron noemt en er de data niet bij krijgt, krijgt géén stilzwijgende terugkeer naar het evaluatieraster: de term gaat inert en de run zegt het in `zFloorSourceNote`. Terugvallen zou precies de lezing herstellen die V32 introk, in de enige plek waar niemand kijkt. `barrierSource.test.ts` toetst dat zoals het gecontroleerd moet worden — het geleverde netwerk is aantoonbaar NIET het netwerk dat `'grid'` levert, want dát is wat een terugval zou opleveren en niets anders.

     **DE BRON RAAKT OOK DE REPARATIEPAS, en dat is dezelfde reparatie één pas verder.** De barrière van de reparatiepas duwde op het evaluatieraster terwijl de ACCEPTATIE van diezelfde pas op het veiligheidsraster oordeelde (`worstZOf`) — dus op een ontwerp waarvan het minimum onder de rasterbodem ligt duwde de reparatie waar niets te duwen viel en werd zij afgerekend waar wél iets zat. V32 mat vier kandidaten met `ampFloorRepair: 'failed'`, alle vier met hun minimum onder 200 Hz. Eén bron voor één term laat die twee samenvallen. Dat is geen wijziging AAN de reparatiepas: het is dezelfde ene regel die hem bereikt.

  2. **Een poort die de hele waardetune weigert levert een VERWERPING.** De V31-vorm, één regel naar buiten. `netOptimizer.ts` onthoudt de geweigerde tune, en aan het eind — ná de reparatiepas en ná de veiligheidspoort, die hun voorrang houden — levert de run een verwerping in plaats van een netwerk. De vorm is geharmoniseerd: beide wholesale-paden vullen sinds nu één veld, `refusal { by, kinds, reason, note }`, zodat de shortlist precies één soort verwerping kent en de worker één vraag stelt in plaats van twee.

     **De tweede voorwaarde is geen decoratie**, en zij is het enige waarin deze ingreep afwijkt van "weiger en klaar": de verwerping staat alleen wanneer óók het uiteindelijk GELEVERDE netwerk door de poort geweigerd wordt. Na `cur = asIs(seedParts)` gaat de run verder, en de passen die volgen — de herzaai-challenge, de driftvangst, de doelbarrière, prune, escalatie — zijn echte zoektochten die elk vóór acceptatie langs dezelfde poort gaan. Landt een van hen ergens dat de poort accepteert, dan HEEFT deze run een toelaatbaar ontwerp gevonden, en dat "geen netwerk" noemen zou een geldig antwoord weggooien. Beide takken staan als test (`wholesaleRejection.test.ts`).

     `refusal` verschijnt alleen op een run die een v2-mechanisme wapende (de poorthook of het `rejectedTuneReport`), dus elk v1-resultaatobject is onveranderd — dezelfde bewaking die `rejectedTune` sinds V31 draagt.

  ---

  **DE METING: DRIE ARMEN OP ÉÉN VELD.** Zelfde vijftien kandidaten, zelfde seed (20260827), zelfde gestelde vloer, zelfde beschermingen. Het enige verschil is waar de barrière zijn tekort leest. De "grid"-arm is geen nieuwe run maar het BEVROREN V32-corpus, want dat is precies wat die bron opleverde.

  | | `'grid'` (V32-corpus) | `'sweep'` | `'safety'` (levend) |
  | --- | --- | --- | --- |
  | veld | 15 | 15 | 15 |
  | leverde een netwerk dat een POORT weigert | **6** | **0** | **0** |
  | leverde geen netwerk (zichtbare verwerping) | 2 | 5 | 4 |
  | bevroren | 7 | 10 | 10 |
  | haalt de vloer ALS BESTAND | 7 van 7 | 10 van 10 | 10 van 10 |
  | `ampFloorRepair: 'failed'` | **6** | **0** | **0** |
  | wandkloktijd, vijftien ketenruns | ~14 min | **4 u 23 min** | **44,6 min** |
  | per kandidaat | 45–66 s | 603–2740 s | 113–237 s |

  **De scherpste rij is `ampFloorRepair`.** In de `'grid'`-arm vuurde de reparatiepas op zes kandidaten en mislukte op alle zes — en dat zijn exact de zes waarvan het minimum onder de rasterbodem lag. De pas duwde waar niets te duwen viel (haar barrière las het evaluatieraster) en werd afgerekend waar wél iets zat (haar acceptatie leest `worstZOf`, inclusief het veiligheidsraster). In beide V33-armen hoeft zij geen enkele keer te vuren: de zoektocht landt zelf op de vloer. Dat is de reparatiepas die meelift op één regel, niet een tweede ingreep.

  **En de zes onbouwbare aanbiedingen zijn nul geworden.** De 396,7 Hz-as leverde in de `'grid'`-arm vijf ongetunede zaden van 0,01–1,38 Ω; nu levert zij getunede netwerken die de vloer halen, of een verwerping met de regel erbij (*"M-B/|Z|: 2,49 Ω falls below the stated floor of 2,60 Ω"*). Geen van beide armen biedt nog iets aan dat een poort weigert.

  ---

  **`'SWEEP'` TEGEN `'SAFETY'` — EN ZIJ ZIJN NIET BYTE-IDENTIEK.** Dat was de vraag die deze twee armen moesten beantwoorden, en het antwoord is nee: van de negen kandidaten die in beide armen een netwerk leveren, levert er **geen enkele hetzelfde netwerk**. Eén kandidaat kantelt van verwerping naar ontwerp (396,7 · 2283,5), één valt uit de shortlist doordat de spreiding anders kiest (396,7 · 1981,2, die wél geleverd wordt).

  | kandidaat (W-M · M-T) | min \|Z\| sweep → safety | RMS | SPL ± | M-T fase |
  | --- | --- | --- | --- | --- |
  | 396,7 · 1719 | 2,55 → 2,56 | 1,85 → 1,76 | 3,86 → 3,67 | 29,96 → 26,31 |
  | 396,7 · 1981,2 | 2,56 → *niet bevroren* | 1,75 → — | 3,53 → — | 26,39 → — |
  | 396,7 · 2283,5 | *verworpen* → 2,56 | — → 1,75 | — → 3,42 | — → 22,41 |
  | 466,5 · 1719 | 2,61 → 2,63 | 1,91 → 1,89 | 4,00 → 3,94 | 31,66 → 31,67 |
  | 466,5 · 1981,2 | 2,60 → 2,61 | 2,00 → 1,85 | 3,75 → 3,43 | 14,81 → 32,11 |
  | 466,5 · 2283,5 | 2,59 → 2,59 | 1,88 → 1,86 | 3,39 → 3,40 | 28,87 → 26,70 |
  | 548,5 · 1294 | 2,61 → 2,61 | 1,96 → 1,93 | 4,34 → 4,30 | 33,36 → 34,37 |
  | 548,5 · 1491,4 | 2,60 → 2,58 | **1,70 → 2,25** | 3,79 → 3,96 | **16,42 → 56,16** |
  | 548,5 · 1719 | 2,60 → 2,59 | 1,70 → 1,90 | 4,05 → 4,54 | 10,46 → 6,65 |
  | 548,5 · 1981,2 | 2,60 → 2,59 | 1,82 → 1,92 | 3,97 → 4,13 | 4,18 → 5,29 |
  | 548,5 · 2283,5 | 2,59 → 2,59 | 1,79 → 1,96 | 3,88 → 3,86 | 3,75 → 5,30 |

  **HOE GEVOELIG DE ZOEKTOCHT IS VOOR DE BARRIÈREWAARDE — dat is wat deze tabel meet, en het is meer dan verwacht.** De twee lezingen verschillen op dit corpus met ten hoogste **0,0075 Ω** (gemeten, tegen een vloerspeling van 0,0520 Ω). Dat verschil verplaatst waar de simplex uitkomt: meestal met een paar honderdsten dB en een graad of twee, op 466,5 · 1981,2 met 17° M-T-fase, en op 548,5 · 1491,4 met **40° M-T-fase en 0,55 dB RMS**. Een grootheid die zeven keer kleiner is dan wat deze app zelf "niet te onderscheiden van gehaald" noemt, beslist dus over welk ontwerp er uit de doos komt.

  Dat is geen argument tegen `'safety'` en ook geen argument vóór `'sweep'`: het is een uitspraak over de ZOEKTOCHT. De vloer als barrièreterm zit met gewicht 1200 in een landschap waarin de simplex tussen basins kiest, en beide lezingen mikken op hetzelfde punt — de een preciezer dan de ander, allebei ruim binnen de tolerantie waarop geoordeeld wordt. Wat eruit komt is per kandidaat een ander lokaal optimum en per VELD nauwelijks te onderscheiden:

  | corpus (n = 10) | min \|Z\| | RMS-vlakheid | SPL ± | M-T fase |
  | --- | --- | --- | --- | --- |
  | `'sweep'` | 2,55–2,61 (med 2,60) | 1,70–2,00 (med **1,83**) | 3,39–4,34 (med 3,87) | 3,75–33,36 (med **21,41**) |
  | `'safety'` | 2,56–2,63 (med 2,59) | 1,75–2,25 (med **1,90**) | 3,40–4,54 (med 3,90) | 5,29–56,16 (med **26,50**) |
  | *ter vergelijking:* `'grid'` (n = 7) | 2,55–2,60 (med 2,58) | 1,81–2,49 (med 1,88) | 3,37–4,50 (med 4,17) | 11,15–34,01 (med 27,78) |

  De dure arm is dus een beetje beter — 0,07 dB mediane RMS en 5° mediane M-T-fase — en kost zes keer zoveel rekentijd. **Dat is de afruil, gemeten, en de v2-route neemt `'safety'`.** Wie het andere antwoord wil, stelt `zFloorBarrierSource: 'sweep'` op de kandidaat; beide corpora staan in de repository, dus de vergelijking is na te lezen zonder ook maar iets opnieuw te draaien.

  **Wat GEEN van beide armen oplost** staat er ook: `466,5 · 1491,4` wordt in allebei door `protection` verworpen, en dat is de arbitrage die V31 openliet — de afruil tussen de versterkervloer en de tweeterbescherming is nog steeds een alles-of-niets-veto. V33 heeft die weigering alleen leesbaar gemaakt, niet opgelost.

  ---

  **WAAR DE PRIJS VANDAAN KOMT.** De barrière lost het netwerk bij élke objectief-evaluatie op, op het raster van zijn bron. Nagemeten kosten per netwerkoplossing op deze casus: **0,507 ms op 96 punten, 1,257 ms op 240, 8,886 ms op 1600.** De hele runtijd van deze tuner zit in die oplossing — een ketenrun doet er ~88 000 — dus de verhouding tussen de rasters is de verhouding tussen de runtijden, en dat is precies wat de tabel hierboven laat zien. Ter controle op één kandidaat, beide uitersten: 44,0 s tegen 669,8 s bij 88 008 tegen 86 399 evaluaties.

  `'safety'` koopt de uitgestrektheid zonder de resolutie. Dat is de hele reden dat de bron drie waarden heeft in plaats van twee, en het is ook de reden dat de dure arm bewaard is als gedateerd corpus in plaats van weggegooid: een referentiemeting die je niet meer kunt naslaan is een zin die iemand ooit heeft getypt.

  **BIJVANGST, EN ZIJ IS DEZELFDE FOUT VOOR DE DERDE KEER.** `goldenClassification.test.ts` bepaalde welke bevroren netlists een klasse moeten dragen met een met de hand bijgehouden FAMILIELIJST — `KAND_V2_*` en `V28_KAND_*`. V32 vroor een tweede gedateerd corpus in (`V30_KAND_*`) en niemand liep terug: tien klasse-B-blokken hebben een oplevering lang in het referentiebestand gestaan zonder ooit op een klasse gecontroleerd te zijn. Dat is exact het gat dat dat blok bij V28 zelf sloot, één laag verder. De lijst is daarom weg: **elke netlist die het casusboek NOEMT en die geen v1-baseline is, moet een geclassificeerd blok hebben.** Een nieuw corpus doet mee door te bestaan.

  **WAT ER IN DE CODE VERANDERDE.** Nieuw: `optimizer/barrierSource.test.ts`, `scripts/compare-corpora.ts` (de opvolger van `compare-v30-v32-corpus.ts`, met beide corpora als argument — de oude had zijn "ná"-helft hard op het levende corpus staan en maakte na de eerste regeneratie stilzwijgend een ándere tabel dan die waarvoor hij geschreven was). Gewijzigd: `impedanceFloor.ts` (`minImpedanceAt` en `ampFloorSlackOhm` — de vloerspeling had twee huizen en heeft er nu één, want sinds V33 vraagt óók een test hem op), `netOptimizer.ts` (twee opties, `systemMinImpedanceOhm`, `barrierShortOhm`, `barrierGrid`, `zFloorSourceNote`, het geharmoniseerde `refusal`-veld op alle drie de wholesale-returns, en de vastgehouden geweigerde waardetune), `metrics/electrical.ts` (`epdr` leest het minimum via de gedeelde functie), `optimizer/choices.ts` (twee sleutels geclassificeerd, 39 → 41), `optimizer/candidateDeclaration.ts` (de V33-afleiding met haar P4-tegenhanger), `optimizer/worker.ts` (de reference voedt de dure bron; één detectievraag in plaats van twee; de bronnoot in de notities), `optimizer/v2.fixture.ts` (een veiligheidsset, zodat de tweewegcasus de `'safety'`-bron kan oefenen), de generator en de recorder (de gedateerde corpora worden afgeleid in plaats van opgesomd; alleen hun REDEN staat nog met de hand geregistreerd), `frozenNetlistGates.test.ts`, `wholesaleRejection.test.ts`, `choiceKeyGuard.test.ts`, `goldenClassification.test.ts`, `casus1V2Candidates.test.ts`.

  **ONAANGERAAKT:** het gewicht `AMP_FLOOR_BARRIER_WEIGHT`, de reparatiepas, `safety` en élke veiligheidsregel, het ketenraster, de poorten zelf, `crossover3Variants`, de logica van beide ketens, en de v1-route — `toggleRegression.test.ts` is byte-identiek, `workerRouteRegression.test.ts` levert zijn opgeslagen netwerk nog steeds byte voor byte (die baseline heeft geen gestelde vloer, dus daar is de barrière uit), en `f4cRegression.test.ts` reproduceert beide vormen op twee seeds.

- V34 (**GESLOTEN** op 28-08-2026 — de probe leest waar de grootheid woont, en de grens die hem oordeelde is op de v2-route ingetrokken) — opgeworpen bij de V33-sessie, 27-08-2026.

  **De aanleiding.** V33's inventarisatie stelde de vraag die de opdracht stelde — draagt er ná V32 nog een lezer van het KETENRASTER een oordeel of een doel — en het antwoord is ja. De grootste is de bronweerstand aan de laagste weg. `sourceResistanceOhm` (`partAudit.ts:541`) krijgt het ketenraster mee, en de waarde die eruit komt voedt vier oordelen en één doel:

  | wie | bestand:regel (boom `4cb9cc6`) | wat het is |
  | --- | --- | --- |
  | `rSourceDisqualifyOhm` | `netOptimizer.ts:1171`–`1175` | harde diskwalificatie — op casus 1 gewapend op 2,0 Ω |
  | `rsSafe`, structuurzetten | `netOptimizer.ts:2881`–`2883` | een zet mag de laagste weg niet over de audittier duwen |
  | audittier | `netOptimizer.ts:3410` | 1,0 Ω, het rapportoordeel per onderdeel |
  | geleverd rapport | `netOptimizer.ts:3849` | wat de ranking en de scan-tabel tonen |
  | `dissRatio` → `fxOf` | `netOptimizer.ts:1533`, `2166` | een DOEL: `dissipationWeight · (R_source/R_e)²`, op casus 1 0,05 |

  **En de meting, want dit is geen theoretisch bezwaar.** `sourceProbeIndex` (`partAudit.ts:449`) wil de probe op f_b zetten; is er geen f_b gesteld, dan neemt hij "de impedantiepiek in het onderste kwart van het raster", met `stop = max(400, grid[grid.length/4])`. Op de casus-1-keteninvoer levert dat:

  | weg | index | frequentie | `inBand` |
  | --- | --- | --- | --- |
  | woofer | 24 | **640,2 Hz** | true |
  | mid | 0 | 200,0 Hz | false |
  | tweeter | 24 | 640,2 Hz | true |

  640,2 Hz **is** `grid[24]`, oftewel de bovenrand van het zoekvenster zelf. Het is geen resonantie: de resonantie van deze woofer ligt onder de rasterbodem van 200 Hz, precies zoals de noot bij de DC-terugval in `netOptimizer.ts` al zegt (*"the low driver's impedance peak lies below the grid, which is the normal case for a woofer measured from 200 Hz"*). De bewaking die daarvoor bestaat verwerpt alleen index 0 — een maximum óp het eerste rasterpunt — en vangt de bovenrand niet.

  Dat is exact de fout die ISSUE #14 al eens repareerde, één rand verder. Toen werd er op `grid[0] = 210 Hz` geprobed, wat op die woofer de parallelresonantie van de low-pass was; de reparatie was "een bekende f_b buiten het raster is geen reden om ergens anders te meten maar om te stoppen met meten". Wat er niet bij is gekomen is dat óók de terugval zelf een rand kan aanwijzen.

  **EN DE GRENS ZELF IS EEN PROJECTGETAL ZONDER HUIS — P6, NET BUITEN ZIJN BEREIK.** De harde diskwalificatie is `2,0 Ω` en zij staat als DEFAULT op twee plekken in v1 (`designChain.ts:429`, `threeWayChain.ts:495`, plus de doc-noot op `threeWayChain.ts:96`), en een derde keer overgeschreven in de casus-1-fixture (`casus1V2.fixture.ts:135`, "de eigen standaard van de app"). De audittier ernaast is `1,0 Ω` en staat twee keer in `netOptimizer.ts` als `?? 1.0` (`1237`, `3410`). Geen van beide is uit een meting afgeleid, geen van beide draagt een motivering, en geen van beide heeft één huis. P6 verbiedt precies dit patroon — maar zijn tekst en zijn lint (`p6Lint.test.ts`) dekken `src/lib/engine2/`, en deze getallen wonen er net buiten. Dat is een scopegrens, geen vrijbrief: `ampMinLoadOhm` is langs exact dezelfde weg opgeruimd (F0: er is geen default, de ontwerper vult hem in of niemand), en `impedanceFloor.ts` bestaat omdat dezelfde vraag op drie plekken drie drempels had. Zolang de grens 2,0 Ω is en op 640,2 Hz wordt gemeten, staan er twee onafhankelijke problemen op één regel.

  **Wat er niet aan de hand is.** De aflezing is niet betekenisloos — 640 Hz ligt in de doorlaatband van de woofer en de bronweerstand die je daar meet is een echte bronweerstand. Zij is alleen niet de grootheid waar de regel over gaat: `rSourceDisqualifyOhm` en de dissipatieterm bestaan om te voorkomen dat een serieweerstand de demping bij f_b uitgeeft, en dat is een uitspraak over de RESONANTIE van de woofer. Op 640 Hz beantwoordt hij een andere vraag met hetzelfde getal — de vorm die V21 beschrijft.

  **Drie mogelijke uitkomsten, geen ervan hier gekozen.**
  1. **De probe leest de gemeten impedantiesweep**, net als elke elektrische poort sinds V32 en net als de barrière sinds V33. Dan valt f_b binnen bereik en is de vraag beantwoordbaar. Kost: `sourceResistanceOhm` en `seenImpedance` moeten een tweede raster kunnen krijgen, en dat raakt de v1-route en dus de toggle-invariant — precies waarom V33 dit niet meenam.
  2. **De terugval wordt strenger**: een piek die op een van beide RANDEN van het zoekvenster ligt telt niet als resonantie, en dan valt de probe terug op de DC-limiet (die mag veroordelen maar nooit vrijpleiten). Klein, maar het verandert de uitkomst van élke bestaande v1-run met een woofer onder de rasterbodem.
  3. **De ontwerper stelt f_b.** Het veld bestaat (`audit.fbHz`), casus 1 vult het niet, en met een gestelde f_b buiten het raster stopt de probe uit zichzelf. Dan is dit een P4-vraag en geen engine-vraag.

  En daarnaast, los van de drie: **de twee grenzen krijgen één huis en een motivering**, zoals `ampMinLoadOhm` die heeft gekregen. Dat is een kleinere ingreep dan de drie hierboven en zij hangt er niet van af.

  **Wat het zou beslechten:** één meting die er niet is — dezelfde vijftien kandidaten met de probe op de sweep naast de huidige, met `dissRatio` en de diskwalificatiegrens erbij per kandidaat. Zolang die er niet is, is elke keuze hierboven een voorkeur. **Open.** *(Die meting is bij de vervolgsessie hieronder gedaan, en zij heeft de keuze niet zozeer beslecht als wel verlegd: uitkomst 1 en de intrekking van de grens bleken dezelfde ingreep.)*

  ---

  **V34 — VERVOLGSESSIE, 28-08-2026: DE PROBE LEEST WAAR DE GROOTHEID WOONT, EN DE GRENS DIE HEM OORDEELT IS INGETROKKEN. GESLOTEN.**

  **DE INVENTARISATIE EERST**, want zij is de reden dat dit één entry is en geen twee. Alle regelnummers zijn die van de boom VÓÓR deze sessie (`52a6ca4`).

  **1. De probe, zijn raster en zijn zoekvenster.** `sourceResistanceOhm` (`partAudit.ts:541`) krijgt een raster mee en meet de reële Thevenin-weerstand die de laagste driver ziet. Wélke frequentie dat is beslist `sourceProbeIndex` (`partAudit.ts:449`): met een gestelde boxafstemming het rasterpunt dat er het dichtst bij ligt, en zonder — casus 1 vult `audit.fbHz` niet in — **de impedantiepiek over het onderste deel van het raster**, met `stop = max(400, grid[⌊n/4⌋])`. De bewaking die daarbij hoort verwierp één rand: `inBand: best > 0`.

  Nagemeten met `scripts/measure-v34-probe.ts`, op de drie rasters die deze app werkelijk in handen heeft:

  | raster | punten | uitgestrektheid | zoekvenster | waar de probe de WOOFER vindt |
  | --- | --- | --- | --- | --- |
  | ketenraster (`CASUS1_V2_GRID`) | 96 | 200–20 000 Hz | idx 0..24 (200–**640,2** Hz) | **idx 24 = 640,2 Hz — de BOVENRAND** |
  | veiligheidsraster (`safety.freqs`) | 240 | 20,5–20 000 Hz | idx 0..103 (20,5–398,2 Hz) | idx 32 = 51,5 Hz, \|Z\| 19,32 Ω |
  | poortraster (`impedanceReferenceFrom`) | 1600 | 10,1–20 317 Hz | idx 0..773 (10,1–398,7 Hz) | idx 346 = 52,3 Hz, \|Z\| 19,81 Ω |

  De 640,2 Hz van V33 reproduceert exact, en `640,2 = grid[24] = stop`: het is de bovenrand van het zoekvenster zelf. Dat het geen resonantie is, is nu ook gemeten in plaats van beredeneerd — **dit wooferpaar is bassreflex**, en zijn impedantiekromme onder 200 Hz draagt twee pieken met een dal ertussen: 11,72 Ω @ 17,0 Hz, **3,93 Ω @ ~31 Hz**, 18,90 Ω @ 50,9 Hz. Die 31 Hz is precies de poortafstemming die de ISSUE #14-noot noemt. Alle drie liggen onder de rasterbodem van 200 Hz. Wat op 640 Hz gelezen werd is de impedantie die uit de doorlaatband van de woofer omhoog loopt.

  **2. Wat er aan die aflezing hangt, en of het rapportage is of een oordeel.** Zes lezers, en vijf ervan oordelen:

  | lezer | wat het is | oordeel of rapportage |
  | --- | --- | --- |
  | `rSourceDisqualifyOhm` (`netOptimizer.ts`, `constraintViolation`) | harde diskwalificatie, en op de v2-route gewapend op 2,0 Ω | **oordeel** — zet `infeasible` op het geleverde netwerk |
  | `rsSafe`, structuurzetten (`netOptimizer.ts:3157`) | een zet mag de laagste weg niet over de audittier duwen | **oordeel** — het weigert zetten |
  | audittier `thr.rSourceOhm` (`partAudit.ts:691`) | `crossesRs` in de onderdelenaudit | **oordeel** — een onderdeel dat de tier kruist heet `earned` en wordt dus NIET verwijderd |
  | audittier in de snap (`netOptimizer.ts:3688`) | `branchDcrBudgetOhms(re, tier)` begrenst de DCR per tak | **oordeel** — het snoeit de catalogusruimte |
  | `net.after.rSourceOhm` (`netOptimizer.ts:4127`) → keten | de ranking diskwalificeert erop (`threeWayChain.ts:495`) | **oordeel** |
  | `dissRatio` → `fxOf` (`netOptimizer.ts:1791`, `2424`) | `dissipationWeight · (R_source/R_e)²` | doel, gewicht 0,05 |

  De opdracht vroeg dit expliciet voor de audittier, en het antwoord is dus: **hij draagt een oordeel, op twee plekken.** Dat betekent dat dezelfde regel geldt als voor `rSourceDisqualifyOhm`.

  **3. De twee literalen, en waar de v1-route staat.** 2,0 Ω stond op vier plekken (`designChain.ts:429` als parameterdefault, `threeWayChain.ts:495` als `?? 2.0`, de doc-noot op `threeWayChain.ts:96`, en `casus1V2.fixture.ts:135`); 1,0 Ω op vier (`partAudit.ts:88`, `netOptimizer.ts:1495` en `:3688`, `casus1V2.fixture.ts:136`), plus de twee UI-defaults in `App.tsx`. Geen van beide droeg een afleiding. **Op de v1-route mag daar niets van bewegen** — dat is de toggle-invariant, en zij is geen richtlijn — dus alles wat deze sessie doet is opt-in.

  **WAAROM DIT ÉÉN ENTRY IS EN GEEN TWEE, EN DAT IS DE VONDST VAN DE SESSIE.** De probe repareren en de grens laten staan is slechter dan geen van beide doen. Gemeten, per bevroren netlist, met de strikte randregel:

  | netlist | ketenraster | veiligheidsraster | poortraster | DC-limiet |
  | --- | --- | --- | --- | --- |
  | HUIDIG | 3,756 | **3,978** | 3,985 | 3,756 |
  | KAND_A | 4,423 | **4,585** | 4,590 | 4,423 |
  | KAND_B | 2,352 | **2,552** | 2,558 | 2,352 |

  Met de OUDE randregel leest het ketenraster diezelfde drie op **0,503 / 0,465 / 0,678 Ω** — het cijfer waarop de app tot vandaag diskwalificeerde. De gestelde grens is 2,0 Ω. Dus: op 640 Hz haalt iedereen hem ruim, op de echte piek haalt **geen van de drie v1-baselines** hem, HUIDIG — het eigen, beste, handgebouwde filter van de ontwerper — voorop. Een reparatie die alleen de probe verzet, zou het referentieontwerp van deze casus hebben weggegooid op een grens die in `manifest_en_geometrie.gestelde_eisen` niet voorkomt.

  **En de aflezing op het ketenraster is met de strikte regel exact de DC-limiet**, op elke netlist zonder uitzondering: waar de probe geweigerd wordt, is er niets gemeten. Dat is de scherpste formulering van de vondst — het getal waarop gediskwalificeerd werd was, met de strikte regel toegepast, nooit een meting van de grootheid waar de regel over gaat.

  **WAT ER IS GEBOUWD.**

  **(1) De randregel is een echte bewaking geworden, en zij is een parameter.** `ProbeEdgeRule` in `partAudit.ts`: `'first'` verwerpt alleen index 0 — de historische regel, dus de default, dus v1 byte-onaangeraakt — en `'both'` verwerpt elke rand van het zoekvenster. De regel geldt alléén voor de TERUGVAL: een gestelde boxafstemming die op een rand valt is het antwoord op een vraag die de ontwerper stelde, niet een zoekartefact, en hem weigeren zou de remedie van ISSUE #14 zelf breken. Een geweigerde landing valt terug op de serie-pad-DC-limiet, die mag veroordelen maar nooit vrijpleiten — dezelfde regel die er sinds #14 staat, nu ook aan de bovenkant.

  **(2) Het raster is een KEUZE-sleutel, in de V33-vorm.** `rSourceProbeSource`: `'grid'` (default, evaluatieraster, historische randregel) en `'safety'` (het volle-band-veiligheidsraster van de tuner, strikte randregel). Eén beslissing in de tuner (`probeOn`) wapent beide; in de code zijn het twee parameters, zodat een falende test zegt wélke van de twee bewoog. Alle vijf de lezers gaan er doorheen, óók de onderdelenaudit — die krijgt een `probe`-context naast zijn analyseraster, want zijn ΔSPL en Δfase zijn responsvragen en horen op het analyseraster, en de bronweerstand bij de boxafstemming is een impedantievraag over een frequentie dat raster meestal niet bevat.

  **TWEE WAARDEN EN NIET DRIE, EN DAT IS HET VERSCHIL MET V33.** V33 had een derde nodig (`'sweep'`) omdat de barrière moest mikken op het getal dat een POORT handhaaft, en alleen de poortreferentie ís dat getal per constructie. Niets poortent de bronweerstand, dus er is niets om identiek aan te zijn. Het verschil tussen veiligheidsraster en poortraster is dan een meting in plaats van een argument: beide vinden de wooferpiek binnen één rasterstap van elkaar (51,5 tegen 52,3 Hz), het grootste verschil over élke bevroren netlist in het casusboek is **0,0129 Ω** (bij `V28_KAND_2`, een netwerk met 0,001 Ω belasting), en op géén enkele netlist vellen zij een ander oordeel over een van beide tiers. Een derde waarde die niemand kan betalen om dat te kopen, zou decoratie zijn.

  **GEEN TERUGVAL, NADRUKKELIJK.** Een genoemde bron zonder data probet NIETS: `rSourceOhm` is null, de dissipatieterm valt weg, de diskwalificatie kan niet vuren, en `rSourceProbeNote` zegt het. Dat is dezelfde regel als V32 (een poort zonder sweep oordeelt niet) en V33 (een barrière zonder bron stuurt niet), toegepast op een meting. De test die dat vasthoudt vergelijkt niet de netwerken maar het GELEVERDE getal, want een stille terugval levert precies het rastergetal en niets anders.

  **(3) De twee grenzen zijn op de v2-route INGETROKKEN, en hebben op de v1-route één huis gekregen.** Casus 1 stelt in `gestelde_eisen` geen bronweerstandseis, dus de kandidaat draagt er geen: `rSourceDisqualifyOhm` is ABSENT met de P4-reden en de audittier staat op `null` — de audit DRAAIT (hij is een bescherming, V26 rij 33), zijn bronweerstandstier oordeelt niets.

  **En daar zat een gat dat F4d niet had gedicht.** `rSourceDisqualifyOhm` is sinds F4c een keuze-sleutel, wat betekent dat hij op de v2-route alleen vanuit de kandidaat mag wapenen. Dat was niet zo: de sleutel bereikt de tuner via `collect.choices` alléén wanneer de kandidaat hem STELT, en de keten resolvet hem daarnáást, BUITEN de tuner om (`threeWayChain.ts`'s eigen `?? 2.0`), waar `choices.ts` niet bij komt. "De ontwerper stelde niets" en "de ontwerper stelde 2,0 Ω" kwamen dus langs verschillende wegen op dezelfde plek uit. `withDeclaredSourceLimit` in de worker sluit dat: is er een verklaring, dan is die de autoriteit, en een niet-gestelde sleutel wordt een expliciete `null` op de wire. Geen verklaring ⇒ de identiteit, wat élke v1-aanroeper byte-identiek houdt. `null` en `undefined` zijn met opzet verschillende toestanden — de eerste is "de ontwerper stelde er geen", de tweede is "er is niets gezegd", en de keten geeft alleen op de tweede haar historische default.

  Voor de v1-route zelf: `DEFAULT_R_SOURCE_TIER_OHM`, `DEFAULT_R_SOURCE_DISQUALIFY_OHM` en `SOURCE_PROBE_WINDOW_TOP_HZ` staan sinds V34 in `partAudit.ts`, naast de probe waarvan zij de aflezing oordelen, elk met een motivering en met de kanttekening dat geen van beide is afgeleid. Langs dezelfde weg als `ampMinLoadOhm` bij F0 en `meetsAmpFloor` bij de vloersessie. P6 dekt `src/lib/engine2/` en deze twee wonen er net buiten — een scopegrens is geen vrijbrief.

  **DE GREP-BARE CLAIM DIE DE OPDRACHT VROEG.** Ná V34 neemt op de v2-route **geen enkele poort, geen enkele A5d.6-inversie, geen enkele doelfunctieterm en geen enkele probe een ELEKTRISCH oordeel op het ketenraster.** De poorten lezen sinds V32 de gemeten sweep, de barrière sinds V33 het veiligheidsraster met dezelfde uitgestrektheid, de doorlaatband-impedantiemediaan sinds V32 de sweep, en de bronweerstandsprobe sinds V34 het veiligheidsraster. Wat wél op het ketenraster blijft en waarom:

  | wat | waarom dat correct is |
  | --- | --- |
  | rimpel, gemiddelde afwijking, fase, kruispuntdip, tweeterbescherming, breakup-lek | RESPONSgrootheden, en een respons hééft een meetpoort: buiten het verre-veldvenster is er geen meting om over te oordelen. Dat is precies de asymmetrie die `impedanceReference.ts` bovenaan uitspreekt. Ze worden bovendien op het veiligheidsraster hérmeten door de volle-band-veiligheidspoort. |
  | `m.zShortOhm` in `safe()` / `safeEsc()` (vijf vergelijkingen; regelnummers in de boom ná deze sessie) | RELATIEF, nooit absoluut: `m.zShortOhm <= ref.zShortOhm + 0,1`, twee netwerken op hetzelfde raster. Het is een "word niet slechter"-bewaking bij een structuurzet, geen oordeel over een gestelde vloer. Élk absoluut vloeroordeel loopt via `worstZOf` / `zMinOf` / `barrierShortOhm`, en die drie nemen het veiligheidsraster mee. |
  | `metricsOn`'s eigen `zMinOhm` / `zShortOhm` als velden | grondstof, geen oordeel. Er is geen consument die ze absoluut leest zonder door een van de drie functies hierboven te gaan — nagemeten met een grep over alle veertien voorkomens. |

  Wat er dus NIET onder valt, en met opzet: de v1-route. Daar leest alles nog wat het altijd las, en dat is de toggle-invariant.

  **DE VÓÓR/NÁ-METING.** Het veld is opnieuw opgewekt met dezelfde seed (20260827), hetzelfde raster en dezelfde vijftien kandidaten; het enige verschil is deze sessie. Vijftien ketenruns, 115–224 s per stuk, **41 minuten** totaal — praktisch dezelfde prijs als V33's `'safety'`-arm, want de probe scant een raster en lost niets extra's op. Het corpus dat het vervangt staat als `V33_KAND_*` in de repository (`compare-corpora.ts v33 live` reproduceert de tabel).

  | kandidaat (W-M · M-T) | min \|Z\| vóór | min \|Z\| ná | @ Hz ná | vloer vóór → ná | SPL ± vóór → ná | RMS vóór → ná | W-M fase vóór → ná | M-T fase vóór → ná |
  |---|---|---|---|---|---|---|---|---|
  | 396.7 · 1294 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** |
  | 396.7 · 1491.4 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** |
  | 396.7 · 1719 | 2.56 | 2.56 | 80.97 | **ja** → **ja** | 3.67 → 3.67 | 1.76 → 1.76 | 16.74 → 16.74 | 26.31 → 26.31 |
  | 396.7 · 1981.2 | — | 2.57 | 1119.92 | — → **ja** | — → 3.57 | — → 1.81 | — → 17.07 | — → 29.06 |
  | 396.7 · 2283.5 | 2.56 | 2.56 | 83.31 | **ja** → **ja** | 3.42 → 3.42 | 1.75 → 1.75 | 20.51 → 20.51 | 22.41 → 22.41 |
  | 466.5 · 1294 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** |
  | 466.5 · 1491.4 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** |
  | 466.5 · 1719 | 2.63 | 2.60 | 1067.87 | **ja** → **ja** | 3.94 → 3.72 | 1.89 → 1.80 | 15.16 → 16.74 | 31.67 → 33.30 |
  | 466.5 · 1981.2 | 2.61 | 2.61 | 1163.38 | **ja** → **ja** | 3.43 → 3.36 | 1.85 → 1.85 | 16.06 → 13.34 | 32.11 → 32.09 |
  | 466.5 · 2283.5 | 2.59 | 2.58 | 1208.53 | **ja** → **ja** | 3.40 → 3.35 | 1.86 → 1.90 | 12.60 → 15.15 | 26.70 → 25.53 |
  | 548.5 · 1294 | 2.61 | 2.59 | 966.31 | **ja** → **ja** | 4.30 → 4.39 | 1.93 → 2.08 | 14.47 → 16.91 | 34.37 → 30.75 |
  | 548.5 · 1491.4 | 2.58 | **verworpen** | — | **ja** → — | 3.96 → **verworpen** | 2.25 → **verworpen** | 19.93 → **verworpen** | 56.16 → **verworpen** |
  | 548.5 · 1719 | 2.59 | 2.59 | 227.41 | **ja** → **ja** | 4.54 → 3.98 | 1.90 → 1.83 | 36.40 → 31.78 | 6.65 → 10.28 |
  | 548.5 · 1981.2 | 2.59 | 2.58 | 132.19 | **ja** → **ja** | 4.13 → 3.85 | 1.92 → 1.69 | 45.41 → 38.00 | 5.29 → 10.85 |
  | 548.5 · 2283.5 | 2.59 | 2.58 | 1072.97 | **ja** → **ja** | 3.86 → 3.86 | 1.96 → 1.88 | 45.94 → 48.22 | 5.30 → 4.68 |

  **Bevroren: 10 vóór → 10 ná; alle tien halen de vloer als bestand, vóór én ná.** Eén kandidaat valt uit de shortlist (`548,5 · 1491,4`) en één komt erin (`396,7 · 1981,2`). Vijf van de vijftien leveren geen netwerk tegen vier bij V33.

  **EN DE VERWACHTING WAS FOUT, PRECIES ZOALS V33 LEERT.** De opdracht schreef "verwacht klein of geen verschil — de probe was rapportage plus diskwalificatie, geen doel". Zeven van de negen overgenomen rijen bewegen, en drie ervan ruim buiten afrondingsruis: `548,5 · 1981,2` gaat van ±4,13 naar ±3,85 dB met RMS 1,92 → 1,69 dB en W-M-fase 45,4° → 38,0°; `548,5 · 1719` van ±4,54 naar ±3,98 dB; `466,5 · 1719` van ±3,94 naar ±3,72 dB. En `548,5 · 1491,4` levert nu **helemaal geen netwerk**: `M-B/\|Z\|` weigert zijn hele waardetune op 2,45 Ω tegen de gestelde 2,60 Ω, waar hij vóór deze sessie een netwerk van 2,58 Ω afleverde.

  **De reden dat er iets beweegt is niet de probe maar wat er aan de probe hing.** Op casus 1 doet V34 vier dingen tegelijk, en drie ervan zijn intrekkingen:

  1. ~~`dissRatio` is niet langer `null`. Op het ketenraster werd de probe geweigerd (index 0 voor de mid, de bovenrand voor de woofer) en viel de dissipatieterm dus **volledig weg**; op het veiligheidsraster meet hij wél, dus de term doet mee. Klein — het gewicht is 0,05 en de ratio ~0,04 — maar niet nul, en de doelfunctie is niet convex.~~ **ERRATUM (V36, nagemeten 28-08-2026; AANGEVULD BIJ V37, 28-08-2026).** De weigering die hier beschreven wordt is de STRIKTE randregel op het ketenraster, een combinatie die de v2-route nooit gedraaid heeft: vóór V34 stond zij op de historische regel, en de tabel drie alinea's hierboven zegt het zelf — `woofer | 24 | 640,2 Hz | inBand true`. De term viel dus **niet volledig weg**; hij mat op 640,2 Hz, met een ratio van 0,36 tot 0,76 in plaats van ~0,04. Wat V34 met deze term deed is hem **veertig keer kleiner** maken — precies 40,1× — en de reden is dat de NOEMER meeverhuisde: `re` is `Re(Z)` BIJ de probe, dus op de impedantiepiek 19,31 Ω in plaats van 3,46 Ω, tegen een gemeten R_e van 3,05 Ω. De teller werd bij V34 juister (de bronweerstand bij een echte resonantie in plaats van bij een venstergrens) en de noemer precies even veel onjuister. **V37 heeft die noemer op de v2-route gerepareerd** — de term deelt sinds dan door de opgeloste R_e, hetzelfde getal dat M-E publiceert en de Q_es-inversie gebruikt — en dáármee is punt 1 pas afgelopen. Zie V36 (de meting) en V37 (de reparatie en de vóór/ná over het hele veld).
  2. `rsSafe`, de structuurzet-bewaking, is UIT: hij leest `rSourceLimit`, en die is nu `null` ⇒ 0. Structuurzetten die vroeger geweigerd werden omdat zij de laagste weg over de 1,0 Ω-tier duwden, worden nu overwogen.
  3. `crossesRs` in de onderdelenaudit is uit, dus een onderdeel wordt niet meer `earned` door een tier die niemand stelde — het kan nu als `inert` verwijderd worden.
  4. De harde diskwalificatie op 2,0 Ω is uit.

  **Alle vier volgen uit P4 en niet uit een smaakoordeel**, en dat is het verschil met een gewichtswijziging: er is niets bijgesteld, er is een grens weggehaald die er niet hoorde te staan. Wat er NIET is veranderd: de fxOf-term zelf, `AMP_FLOOR_BARRIER_WEIGHT`, `dissipationWeight` (0,05, ongewijzigd), het ketenraster, de barrière, `safety`, de poorten, en de v1-route.

  **WAT ER OPEN BLIJFT, EN HET IS SCHERPER GEWORDEN.** V34's derde mogelijke uitkomst — *de ontwerper stelt f_b* — is niet genomen en is nu beter te beargumenteren dan bij het opwerpen. De terugval neemt de PIEK, en dit wooferpaar is bassreflex: zijn twee pieken liggen op 17 en 51 Hz met het dal — de werkelijke poortafstemming, ~31 Hz — ertussen. De probe landt dus sinds V34 op 51,5 Hz, wat een echte resonantie is en dus veel dichter bij de bedoelde grootheid dan 640 Hz, maar het is **niet f_b**. Wat `rSourceDisqualifyOhm` en de dissipatieterm willen weten is de demping BIJ de afstemming. Zolang `audit.fbHz` leeg blijft is de aflezing "de bronweerstand bij de bovenste impedantiepiek van de laagste weg", en dat hoort zo te heten. Dat is een P4-vraag (het veld bestaat) en geen enginevraag, en zij staat als **V35** open.

  Tweede open punt, kleiner: `sourceProbeIndex` neemt de terugval-piek en niet het lokale MINIMUM tussen twee pieken. Voor een gesloten kast is piek = f_c en klopt het; voor een bassreflexkast is f_b het dal. Een terugval die dat onderscheid maakt is afleidbaar uit de kromme zelf (twee pieken met een dal ertussen ⇒ bassreflex ⇒ neem het dal), en zij is deze sessie NIET gebouwd: hij verandert de uitkomst van élke bestaande run met een bassreflexwoofer en verdient dezelfde behandeling als V30, V32, V33 en V34 — een eigen sessie met een vóór/ná-meting. Ook onder V35.

  **WAT ER IN DE CODE VERANDERDE.** Nieuw: `optimizer/probeSource.test.ts`, `scripts/measure-v34-probe.ts` (de meting waarop deze entry rust — drie rasters, waar de probe landt, en de bronweerstand van élke bevroren netlist op alle drie), `scripts/freeze-live-corpus.ts` (het bevriezen van een corpus is vier keer met de hand gedaan en het zijn vijf bewerkingen die allemaal moeten landen). Gewijzigd: `partAudit.ts` (`ProbeEdgeRule`, de drie benoemde constanten, `AuditContext.probe`, `AuditThresholds.rSourceOhm` nullable, `crossesRs` en `rSourceWarn` null-bewust, `rSourceAtGridEdge` op de nieuwe regel), `netOptimizer.ts` (`rSourceProbeSource`, `probeOn`, `rSourceProbeNote`, `rSourceOf`/`rsSafe`/`metricsOn`/`runAudit` door één lezer, `rSourceLimit` met drie toestanden), `designChain.ts` en `threeWayChain.ts` (de gedeelde constanten, `null` = geen grens), `minimize.ts` en `App.tsx` (de constanten in plaats van hun eigen kopie), `optimizer/choices.ts` (41 → 42), `optimizer/candidateDeclaration.ts` (de V34-afleiding met haar P4-tegenhanger), `optimizer/worker.ts` (`withDeclaredSourceLimit`, de probenoot in de notities), `casus1V2.fixture.ts` (de twee defaults ingetrokken, de bron gesteld), de generator (`probe_raster`, `bronweerstandsgrens`, `audittier_ohm` met hun redenen), de recorder en `compare-corpora.ts` (het V33-corpus geregistreerd), `frozenNetlistGates.test.ts`, `choiceKeyGuard.test.ts`, `casus1V2Candidates.test.ts`.

  **ONAANGERAAKT:** de fxOf-term en élk gewicht, het ketenraster, de amp-vloerbarrière, `safety` en elke veiligheidsregel, de poorten zelf, `crossover3Variants`, de logica van beide ketens, en de v1-route — `toggleRegression.test.ts` is byte-identiek, `workerRouteRegression.test.ts` levert zijn opgeslagen netwerk nog steeds byte voor byte, en `f4cRegression.test.ts` reproduceert beide vormen op twee seeds.

- V36 (**GESLOTEN** op 28-08-2026 — de term leest de gestelde probe, hij is niet ingetrokken en niet dood; hij is te klein om iets te beslissen) — opgeworpen als vervolgvraag bij de V34-sessie, 28-08-2026.

  **De vraag, en het antwoord was geen van de twee die verwacht werden.** De opdracht stelde twee gedaanten: (a) de dissipatieterm leest de opgeloste probe maar is per P4 INGETROKKEN — dan botst dat met A3j, want een grijze sleutel wordt expliciet overgenomen en nooit stil op nul gezet; (b) hij leest nog de ketenraster-probe die sinds V34's strikte randregel niets meer teruggeeft — dan is dit V33 in een vierde gedaante, doel en oordeel op twee rasters. **Gemeten: geen van beide.** De term leeft, hij leest hetzelfde raster als élke andere lezer van diezelfde probe, en de reparatie die de opdracht klaarlegde was niet nodig. Wat er wél uit de meting kwam is een ander soort bevinding, en zij is scherper dan beide gedaanten.

  **WAAR HIJ LEEST.** `netOptimizer.ts:2002` — `if (dissW > 0) dissRatio = rSourceOhm / re;` — binnen het `probeOn`-blok van `metricsOn` (`1969`–`1990`). `probeOn` (`1222`) is sinds V34 de ENE plek die beslist waar de bronweerstandsprobe leest, en hij heeft vijf lezers: de harde diskwalificatie, de structuurzet-bewaking, de audittier, het geleverde rapport, en deze term. Op de v2-route staat `rSourceProbeSource: 'safety'`, dus alle vijf lezen het veiligheidsraster. Er is geen tweede implementatie en geen terugval: een genoemde bron zonder data probet niets, en dan is er geen verhouding — `dissipationTerm.test.ts` assert dat als de vijfde claim.

  **WAT DE TERM BIJDRAAGT, GEMETEN OP HET LEVENDE CORPUS.** `npx vite-node scripts/measure-v36-dissipation.ts`, seconden, geen ketenrun. De "vóór"-arm is het ketenraster met de historische randregel — precies wat de v2-route tot V34 deed; de "ná"-arm is het veiligheidsraster met de strikte regel, wat zij nu doet.

  | netlist | vóór: Hz / R_s / noemer / term | ná: Hz / R_s / noemer / term | fx (2 termen) | aandeel ná |
  | --- | --- | --- | --- | --- |
  | HUIDIG | 640,2 / 0,503 / 3,46 / 1,06e-3 | 51,5 / 3,978 / 19,31 / 2,12e-3 | 2,88 | 0,074 % |
  | KAND_A | 640,2 / 0,465 / 3,46 / 9,04e-4 | 51,5 / 4,585 / 19,31 / 2,82e-3 | 0,82 | 0,344 % |
  | KAND_B | 640,2 / 0,678 / 3,46 / 1,92e-3 | 51,5 / 2,552 / 19,31 / 8,73e-4 | 0,55 | 0,159 % |
  | KAND_V2_1 | 640,2 / 1,577 / 3,46 / 1,04e-2 | 51,5 / 1,093 / 19,31 / 1,60e-4 | 9,27 | 0,0017 % |
  | KAND_V2_6 | 640,2 / 1,903 / 3,46 / 1,51e-2 | 51,5 / 1,445 / 19,31 / 2,80e-4 | 7,85 | 0,0036 % |
  | KAND_V2_9 | 640,2 / 2,625 / 3,46 / 2,88e-2 | 51,5 / 2,573 / 19,31 / 8,88e-4 | 6,49 | 0,014 % |

  **Het grootste aandeel van de dissipatieterm in de objectiefwaarde is 0,34 % ná en 0,44 % vóór, tegen een uitdagingsdrempel van 1 %.** De tuner beslist met procentuele poorten — een uitdaging wordt aangenomen bij 1 % verbetering, een tak gesnoeid bij 10 % — dus deze term kan geen van die beslissingen omdraaien, en dat gold vóór V34 net zo goed. `fx` in de tabel is de som van de twee dominante termen van `fxOf` (`2(1−p)·rms² + 2p·(φ/15)²`, met p = 0,50 uit `phasePriority`), herrekend uit het geleverde rapport; élke term die eraan ontbreekt maakt de noemer alleen groter, dus wat er staat is de **gunstigste** lezing voor de dissipatieterm.

  **ERRATUM OP DE V34-ENTRY, en de V34-entry weerlegt zichzelf.** Punt 1 van "V34 doet vier dingen tegelijk" zegt: *"`dissRatio` is niet langer `null`. Op het ketenraster werd de probe geweigerd … en viel de dissipatieterm dus volledig weg."* Dat klopt niet. De weigering die daar beschreven wordt is de STRIKTE randregel op het ketenraster — een combinatie die op de v2-route nooit gedraaid heeft. Vóór V34 stond die route op de historische regel, en V34's eigen tabel drie alinea's eerder zegt het al: `woofer | 24 | 640,2 Hz | inBand true`. De term viel dus niet weg; hij mat op 640,2 Hz, met de waarden in de tabel hierboven. Ook de ratio "~0,04" hoort bij het veiligheidsraster en niet bij de toestand ervóór: op het ketenraster stond hij op 0,36 tot 0,76. Wat V34 met deze term deed is hem **veertig keer kleiner maken**, niet hem aanzetten.

  **WAAROM VEERTIG KEER KLEINER, EN DAT IS DE BEVINDING.** De term deelt door `re = Math.max(0.5, pZl[k].re)` — de reële impedantie van de laagste weg BIJ de probe. Vóór V34 zat die probe op 640,2 Hz, waar de woofer 3,46 Ω leest, dicht bij zijn gemeten DC-weerstand van 3,05 Ω. Sinds V34 zit hij op de impedantiePIEK, en daar is de noemer 19,31 Ω — **een factor 6,33 boven R_e, en dat kwadrateert tot 40,1**. De teller is intussen juister geworden (de bronweerstand bij een echte resonantie in plaats van bij een venstergrens); de noemer is precies even veel onjuister geworden.

  Dat de noemer R_e HOORT te zijn is geen smaakoordeel maar de reden dat de term bestaat. A3j rij 23: *"stuurt weg van serieweerstand vóór de laagste tak. De term bestaat omdat de tuner zonder niveau-anker een serie-R als goedkoopste niveauregeling gebruikt (19-08: R_s 7,15 Ω, Q_es ×3,24 won de ranking)."* De schade heet Q_es-vermenigvuldiging, en die is `1 + R_source/R_e` met R_e de DC-weerstand. De controle staat in de meting: de kolom `R_s/R_e` reproduceert **exact** de `Qes_mult`-referenties van het casusboek (HUIDIG 2,30 tegen 2,31; KAND_A 2,50; KAND_B 1,84; KAND_V2_9 1,84), terwijl de kolom die de term gebruikt daar een factor 6,33 onder zit. Met R_e als noemer zou de term op HUIDIG 8,5e-2 waard zijn tegen een fx van 2,88 — 3 %, boven de uitdagingsdrempel, en dus een term die werkelijk stuurt.

  **DIT IS DEZE SESSIE NIET GEREPAREERD**, en dat is dezelfde beslissing die V33 over V34 nam en V34 over V35: de reparatie verandert de uitkomst van élke v2-run, dus zij verdient een eigen sessie met een vóór/ná-meting over het hele veld. Zij staat als **V37** open. Wat deze sessie wél doet is het getal vastleggen: `manifest_en_geometrie.v36_dissipatie.noemer_is_R_e` staat op `false` met de reden erbij, en `frozenNetlistGates.test.ts` assert dat de noemer meetbaar boven R_e ligt — een reparatie breekt daar zichtbaar op in plaats van stil door te schuiven.

  **A3j IS NIET GESCHONDEN EN HOEFT NIET GEAMENDEERD.** Gedaante (a) zou dat wel hebben betekend. `dissipationWeight` is een GRIJZE sleutel, hij staat op 0,05 (de app-standaard, overgenomen uit v1), en hij bereikt de tuner EXPLICIET via de kandidaatverklaring — `casus1V2.fixture.ts:130`, `choices.ts:GREY_KEYS`, `choiceKeyGuard.test.ts`. Er is niets stil op nul gezet en er is dus ook geen amendement nodig. Het gewicht is deze sessie ook niet bijgesteld, en dat is een besluit: een gewicht ophogen om een verkeerd gemeten grootheid te compenseren is de fout twee keer maken. Eerst de noemer (V37), dan pas de vraag of het gewicht klopt.

  **WAT DISSIPATIE VANDAAG NOG BEWAAKT OP DE v2-ROUTE — de inventarisatie die de opdracht vroeg.**

  | mechanisme | toestand op casus 1 | waarom |
  | --- | --- | --- |
  | M-A, poort op de dissipatiefractie | **ongewapend** | casus 1 stelt geen `maxDissipationFraction`; leeg veld = geen oordeel (P4) |
  | `rSourceDisqualifyOhm`, harde diskwalificatie | **ingetrokken** | V34: niemand stelde 2,0 Ω |
  | audittier `rSourceOhm` | **`null`** | V34: niemand stelde 1,0 Ω; de audit draait, zijn tier oordeelt niets |
  | `rsSafe`, structuurzet-bewaking | **uit** | leest dezelfde tier |
  | Q_es-budget (`qesMultiplierMax`) | **ongewapend** | `v2_budgetten_gewapend` is leeg |
  | `dissRatio` in `fxOf` | **aan, ≤ 0,34 % van fx** | leeft, stuurt niets — deze entry |
  | rapportage (M-A-waarde in de poortcel, dissipatiekolom) | **aan** | een waarde zonder oordeel, precies wat P4 voorschrijft |

  **De vraag die daarachter zat is dus terecht.** Sinds V30 mág de tuner serie-R inzetten om de vloer te halen, en wat hem tegenhoudt om de vloer met weerstand te kopen is vandaag: niets dat bijt. Het veld laat allebei de uitkomsten zien en dat is het bewijsmateriaal: `KAND_V2_2/3/4` halen de vloer met **0,9 %** dissipatie en Q_es ×1,00, `KAND_V2_9` met **34,7 %** en Q_es ×1,84 — 28,7 W in één weerstand bij 100 W. De zoektocht onderscheidt die twee niet; de shortlist doet dat sinds deze oplevering wél, als kolom.

  **WAT ER GEBOUWD IS.**

  1. **De shortlist toont de watt naast de fractie.** De FRACTIE stond er al sinds F3 (de M-A-poortwaarde, inactief, met haar waarde). De WATT kon er niet staan: een fractie is per constructie schaalvrij (A4 zegt dat met zoveel woorden) en een watt heeft het gestelde versterkervermogen nodig, dat de v2-run niet meekreeg. Dus reisde `V2RunSettings.amplifierPowerW` mee — uitsluitend rapportage, geen vingerafdruk-ingrediënt — en draagt `ShortlistRow.dissipation` nu de fractie, de grootste discrete weerstand en zijn watt. **Kolom, geen criterium:** `shortlist.test.ts` assert dat een veld waarin één kandidaat 95 % verstookt een BYTE-IDENTIEKE lijst oplevert, in dezelfde volgorde, met dezelfde stempel. Parasieten tellen niet mee, om dezelfde reden als in `totalFraction`: de DCR van een spoel is geen onderdeel waar iemand een wattage voor kiest, en hem de kolom laten winnen zou een bouwer naar een niet-bestaand onderdeel wijzen.
  2. **Het corpus draagt de waarde.** `kandidaten.KAND_V2_*.grootste_R_W_bij_100W` — het veld dat de drie v1-kandidaten sinds F1 dragen en het v2-corpus niet, waardoor een ontwerp met 23 % dissipatie in het casusboek stond zonder dat ergens te lezen was dat er 17,9 W in één weerstand zit. Elf metrieken per kandidaat in plaats van tien. Plus `manifest_en_geometrie.v36_dissipatie`: per netlist de fractie, de grootste weerstand met zijn watt, `Qes_mult`, en beide armen van de doelfunctieterm — afgeleid door de recorder, nooit getypt, en door `frozenNetlistGates.test.ts` tegen de metriek zelf gehouden.
  3. **De vóór/ná-tabel heeft twee kolommen erbij.** `compare-corpora.ts` drukt dissipatie % en grootste R (W) af per kandidaat, plus het corpusgemiddelde.

  **GEEN REGENERATIE, EN DAT IS DE HELE WINST VAN EERST METEN.** De opdracht schreef regeneratie voor als de term "weer zou gaan leven". Hij leefde al; er is geen regel in de zoektocht veranderd, dus het veld is bit voor bit hetzelfde en 41 minuten ketenruns zijn niet gedraaid. De dissipatie van het BESTAANDE corpus is in plaats daarvan gemeten en vastgelegd. Wat `compare-corpora.ts v33 live` er nu bij afdrukt is de V34-tabel met de dissipatiekolom: gemiddeld **22,1 % → 19,7 %**, grootste enkele weerstand **15,1 W → 14,2 W** bij 100 W, met twee rijen die ver bewegen (`466,5 · 2283,5` 22,97 % → 34,66 % en 16,4 → 28,7 W; `466,5 · 1719` 39,03 % → 22,89 %). Dat is geen effect van de term — die werd op deze kandidaten juist veertig keer kleiner — maar van wat er bij V34 aan de probe hing, en het is precies het soort beweging dat een ongestuurde grootheid vertoont.

  **WAT ER IN DE CODE VERANDERDE.** Nieuw: `optimizer/dissipationTerm.test.ts`, `scripts/measure-v36-dissipation.ts` (de meting waarop deze entry rust — beide armen per netlist, de termbijdrage naast de objectiefwaarde, en de noemer naast R_e). Gewijzigd: `optimizer/shortlist.ts` (`DissipationColumn`, op `ShortlistInput` en `ShortlistRow`), `optimizer/worker.ts` (`V2RunSettings.amplifierPowerW`, `dissipationColumnOf`, het veld op `V2CandidateResult`), `App.tsx` (het vermogen in de scaninstellingen, de kolom in het veld, de kolom in de tabel), de recorder (`grootste_R_W_bij_100W` en het `v36_dissipatie`-blok), `compare-corpora.ts` (twee kolommen en een corpusgemiddelde), `shortlist.test.ts`, `frozenNetlistGates.test.ts`, `casus1V2Candidates.test.ts`.

  **Bijvangst, en zij verklaart een fout die deze sessie zelf maakte:** `scripts/` valt buiten `tsc -b`. De testscope in `tsconfig.test.json` is `src/**`, en er is geen scope die `scripts/` dekt — dus `casus1Filter(key, …).parts` op een `FilterInput` dat geen `parts` heeft, kwam niet als typefout terug maar als een kolom vol `null` in het referentiebestand. Gevonden doordat het blok werd nagekeken; het staat hier omdat de volgende die een script schrijft dat referentiegetallen wegschrijft, dit hoort te weten. Niet gerepareerd deze sessie: `scripts/` in de build trekken raakt vijf scripts tegelijk en hoort een eigen oplevering te zijn.

  **ONAANGERAAKT:** M-A en élke andere poort, de audittier, `dissipationWeight` en élk ander gewicht, de fxOf-term zelf, `probeOn` en de randregel, de barrière, `safety`, het ketenraster, de generator, de netlists (bit voor bit), en de v1-route — `toggleRegression.test.ts` is byte-identiek, `workerRouteRegression.test.ts` levert zijn opgeslagen netwerk nog steeds byte voor byte, en `f4cRegression.test.ts` reproduceert beide vormen op twee seeds.

- V37 (**GESLOTEN** op 28-08-2026 — de noemer van de dissipatieterm is de opgeloste R_e, en de referentie die dat controleert stond al in het casusboek) — opgeworpen bij de V36-sessie, 28-08-2026.

  **De vondst stond, en zij was al helemaal uitgeschreven.** V36 mat waar de dissipatieterm zijn probe leest, vond dat die vraag geen bevinding opleverde, en liep tegen een andere aan: de term heet `dissipationWeight · (R_source/R_e)²` en deelde niet door R_e. Hij deelde door `re = Math.max(0.5, pZl[k].re)` — de reële impedantie van de laagste weg BIJ de probe — en sinds V34 zit die probe op de impedantiePIEK van het wooferpaar. Gemeten op casus 1: **19,31 Ω tegen een met een meter gemeten R_e van 3,05 Ω, een factor 6,33 die tot 40,1 kwadrateert.** Deze sessie repareert dat op de v2-route en meet wat het kost.

  **DE INVENTARISATIE, EERST, EN ZIJ HEEFT DE VORM VAN DE REPARATIE BEPAALD.**

  1. **De teller is PER TAK en niet per systeem.** `netOptimizer.ts` roept `seenImpedance(net, [lowDrv.id], lowDrv.nodes, …)` aan: de Thévenin-weerstand gezien vanaf de klemmen van de LAAGSTE driver, met die driver uit het netwerk gehaald. Dat is exact dezelfde grootheid als `TheveninResult.rsOhm` in `metrics/electrical.ts:324` — M-E rekent hem met de twee-belastingenmethode, `netOptimizer` met een probebron, en beide beschrijven één tak. De laagste weg is `pickSlotsN(sol.drivers)`, `woofer ?? mid ?? tweeter`; op casus 1 is dat het wooferpaar. **De noemer hoort dus de R_e van DIE tak te zijn**, en niet een systeemwaarde en niet die van een andere driver.
  2. **De v1-route deelt door `Re(Z)` bij de probefrequentie, en die noemer mag niet bewegen.** Toggle-invariant: met `engineV2Enabled` uit is het gedrag byte-identiek, en de tuner is v1-code die élke bestaande aanroeper deelt. De nieuwe sleutel heeft daarom `'probe'` als default en `dissipationTerm.test.ts` assert dat afwezig en `'probe'` byte-identieke netwerken opleveren (P2).
  3. **De termbijdrage met R_e als noemer, gemeten vóór de reparatie.** `scripts/measure-v36-dissipation.ts` drukt de kolom al af. Op de drie v1-baselines, met `fx` = de twee dominante termen van `fxOf` herrekend uit het geleverde rapport: HUIDIG **0,07 % → 2,95 %**, KAND_A **0,34 % → 13,78 %**, KAND_B **0,16 % → 6,39 %**. De uitdagingsdrempel van de tuner is 1 %. De verwachting "~3 %" uit de opdracht was dus een meting vóór de reparatie en zij klopte.

  **DE CONTROLE IS DE REFERENTIE, EN DAT IS DE HELE ACCEPTATIE.** M-E rekent `Q_es_mult = (R_e + R_s)/R_e = 1 + R_s/R_e` op precies de R_e die de A5c.1-hiërarchie oploste, en `kandidaten.*.Qes_mult` staat als klasse-B-referentie in het casusboek — mét zijn parameterblok (`_M_E_parameters.R_e_ohm = 3,05 Ω`, V15). Als de dissipatieterm dezelfde grootheid meet, dan IS `1 + verhouding` die referentie. Nagemeten op alle zestig bevroren netlists:

  | noemer | reproduceert `Qes_mult` |
  | --- | --- |
  | de opgeloste R_e | ja — grootste afwijking **0,36 %**, tegen een tolerantieklasse van 5 % (`exponent_pct`) |
  | `Re(Z)` bij de probe (de piek) | nee — minstens **18 %** ernaast op élke netlist waarvan de referentie werkelijk boven 1 ligt |

  Het restje van 0,36 % is geen speling maar een bekende: M-E leest bij `f_s` op het rapportraster (52,26 Hz), de term bij de probe op het veiligheidsraster (51,54 Hz). Twee metingen van één grootheid, 0,7 Hz uit elkaar. `frozenNetlistGates.test.ts` assert beide helften — de reproductie én de tegenproef — want zonder die tweede is "hij deelt door R_e" niet te onderscheiden van "hij deelt door iets wat er toevallig op lijkt" (V23).

  **WAT ER GEBOUWD IS.**

  1. **`dissipationReferenceSource`, een KEUZE-sleutel met twee waarden.** `'probe'` = `Re(Z)` bij de probe, default, en dus is elke v1-run byte-onaangeraakt; `'re'` = de opgeloste R_e van de laagste weg. Keuze en geen polish, om de reden waarom `band` er een is: hij definieert de grootheid die een gewogen term meet. Twee zoektochten die door 3,05 en door 19,31 Ω delen zoeken een ander netwerk — 3 % van de objectiefwaarde tegen 0,07 %.
  2. **`dissipationReferenceReOhm`, polish ernaast.** De meting die de keuze noemt, aangereikt door de aanroeper die haar al in handen heeft — precies de vorm die V33 koos voor `zFloorBarrierSource` / `zFloorBarrierImpedance`. De worker leest hem uit `facts.reOhm`, hetzelfde object waaruit de M-E-inversie (`bounds.ts`, `maxSeriesResistanceFromQes`) zijn R_e haalt. **Eén R_e, één herkomst, sinds V37 drie lezers**, en dat is F4b's lek 1 in zijn eindtoestand: de ingestpas lost op, `measurementFacts` draagt over, de worker consumeert, en er is nergens een tweede wandeling door de hiërarchie.
  3. **Geen terugval, voor de derde keer en om dezelfde reden.** Een genoemde bron zonder opgeloste R_e voor de laagste weg levert **geen verhouding**: de term telt niets op en `dissipationRefNote` zegt welke invoer ontbrak, in de vorm van lek 2. Een stille terugval op de probe-aflezing zou precies het getal terugbrengen dat deze sessie intrekt, op de ene plek waar niemand kijkt (V32, V33, V34).
  4. **De kandidaat stelt hem onvoorwaardelijk, en dat is de ene afleiding in `candidateDeclaration.ts` die aan niets hangt.** V30, V33 en V34 hangen alle drie aan een andere instelling — geen vloer, geen barrière; geen barrière, geen band; geen veiligheidsset, geen breder raster. V37 hangt aan niets, omdat de vraag niet voorwaardelijk is: `dissipationWeight` is een GRIJZE sleutel (A3j), dus een v2-kandidaat stelt hem altijd expliciet en de term is altijd levend — en een levende term meet altijd iets. WELK iets volgt uit waar de term voor is, en dat staat in A3j rij 23 en A4 M-E. P4 wordt één laag lager beantwoord: of er een R_e is OPGELOST is een meetfeit en geen ontwerpersinstelling, dus de kandidaat noemt de grootheid en de TUNER meldt de afwezigheid.
  5. **De typecheck dekt `scripts/`.** De bijvangst die V36 opschreef en niet repareerde. `tsconfig.scripts.json` is een vierde project onder `tsc -b`, en hij ving meteen twee gevallen van dezelfde klasse als V36's kolom vol `null`: `let out: T | null = null` toegewezen bínnen een callback wordt door TypeScript tot `never` versmald, dus élke aflezing eruit was een fout die de build niet zag (twee scripts, 67 fouten), en `tuned` — een TELLING van de vrije componentwaarden — werd in beide scripts naar `boolean` gecast en als `true`/`false` opgeschreven. Het opgeschreven getal was toevallig al een getal; het TYPE loog. Verzamelen gebeurt nu in een array, wat de compiler wél kan volgen.

  **BIJVANGST: een gedateerd corpus wees naar het verkeerde bestand.** `freeze-live-corpus.ts` neemt het klasse-B-blok mee — dat is precies waarvoor het geschreven is — maar nam ook zijn `klasse_toelichting` verbatim over, en die noemt de LEVENDE sleutel ("Metrieken op de VASTE netlist `…netlists.KAND_V2_3`"). In een gedateerd blok wijst die zin dus naar de netlist die de eerstvolgende regeneratie overschrijft: het verkeerde bestand, onder een naam die zegt dat het het goede is. Twee corpora dragen die zin — `V33_KAND_*`, bevroren door het script bij V34, en `V34_KAND_*`, bevroren deze sessie. Het script schrijft de zin nu opnieuw met de eigen sleutel, de herkomst van de kopie en een verwijzing naar `<corpus>.reden`, en beide families zijn bijgewerkt. De handmatig bevroren corpora (V28, V30, V32, V33-sweep) hadden dit niet: hun toelichtingen zijn indertijd met de hand geschreven en noemen zichzelf.

  **WAT DE REPARATIE KOSTTE, OP HET HELE VELD.** Het levende corpus is opnieuw opgewekt op `'safety'`, en het corpus dat er stond is bevroren als `V34_KAND_*` — de "vóór"-helft, byte-identieke bestanden met hun klasse-B-blokken mee, via `scripts/freeze-live-corpus.ts`. De tabel is `npx vite-node scripts/compare-corpora.ts v34 live`, en zij is de default geworden.

  **De vóór/ná, per kandidaat.** Vijftien kandidaten in, vier zonder netwerk eruit (drie geweigerd door `M-B/|Z|`, één door de tweeterbescherming), elf geleverd, tien bevroren. Tien vóór en tien ná; alle twintig halen de gestelde vloer als bestand.

  | kandidaat (W-M · M-T) | min \|Z\| vóór | min \|Z\| ná | @ Hz ná | vloer vóór → ná | SPL ± vóór → ná | RMS vóór → ná | W-M fase vóór → ná | M-T fase vóór → ná | dissipatie % vóór → ná | grootste R (W) vóór → ná |
  |---|---|---|---|---|---|---|---|---|---|---|
  | 396.7 · 1294 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** |
  | 396.7 · 1491.4 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** |
  | 396.7 · 1719 | 2.56 | 2.56 | 80.97 | **ja** → **ja** | 3.67 → 3.67 | 1.76 → 1.76 | 16.74 → 16.74 | 26.31 → 26.31 | 0.93 → 0.93 | 0.70 → 0.70 |
  | 396.7 · 1981.2 | 2.57 | geen netlist | — | **ja** → — | 3.57 → geen netlist | 1.81 → geen netlist | 17.07 → geen netlist | 29.06 → geen netlist | 0.86 → geen netlist | 0.65 → geen netlist |
  | 396.7 · 2283.5 | 2.56 | 2.56 | 83.31 | **ja** → **ja** | 3.42 → 3.42 | 1.75 → 1.75 | 20.51 → 20.51 | 22.41 → 22.41 | 0.86 → 0.86 | 0.66 → 0.66 |
  | 466.5 · 1294 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** |
  | 466.5 · 1491.4 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** |
  | 466.5 · 1719 | 2.60 | 2.61 | 1062.80 | **ja** → **ja** | 3.72 → 3.86 | 1.80 → 1.88 | 16.74 → 14.42 | 33.30 → 31.81 | 22.89 → 35.75 | 17.63 → 29.12 |
  | 466.5 · 1981.2 | 2.61 | 2.61 | 1157.86 | **ja** → **ja** | 3.36 → 3.93 | 1.85 → 2.05 | 13.34 → 16.33 | 32.09 → 30.75 | 26.17 → 31.46 | 18.22 → 20.76 |
  | 466.5 · 2283.5 | 2.58 | 2.60 | 1202.79 | **ja** → **ja** | 3.35 → 3.25 | 1.90 → 1.80 | 15.15 → 17.33 | 25.53 → 26.47 | 34.66 → 22.80 | 28.73 → 17.98 |
  | 548.5 · 1294 | 2.59 | 2.59 | 970.92 | **ja** → **ja** | 4.39 → 4.43 | 2.08 → 2.14 | 16.91 → 14.20 | 30.75 → 33.36 | 30.28 → 33.38 | 15.21 → 14.92 |
  | 548.5 · 1491.4 | — | 3.53 | 1461.93 | — → **ja** | — → 5.47 | — → 3.83 | — → 81.39 | — → 114.03 | — → 26.27 | — → 16.38 |
  | 548.5 · 1719 | 2.59 | 2.57 | 904.03 | **ja** → **ja** | 3.98 → 4.16 | 1.83 → 1.77 | 31.78 → 29.87 | 10.28 → 8.11 | 28.89 → 20.99 | 21.70 → 14.21 |
  | 548.5 · 1981.2 | 2.58 | 2.58 | 132.19 | **ja** → **ja** | 3.85 → 3.65 | 1.69 → 1.92 | 38.00 → 42.40 | 10.85 → 19.92 | 23.14 → 22.42 | 17.86 → 17.01 |
  | 548.5 · 2283.5 | 2.58 | 2.59 | 1072.97 | **ja** → **ja** | 3.86 → 3.85 | 1.88 → 1.88 | 48.22 → 46.87 | 4.68 → 5.47 | 28.56 → 27.42 | 20.68 → 19.80 |

  **DE SCHOONSTE AFLEZING STAAT IN DE TWEE RIJEN DIE NIET BEWOGEN.** `396,7 · 1719` en `396,7 · 2283,5` zijn ONDERDEEL VOOR ONDERDEEL identiek aan hun V34-tegenhanger — alleen het naamveld verschilt, want de shortlist nummert opnieuw. Dat zijn precies de twee kandidaten waarvan de dissipatieterm NUL is: hun `Qes_mult` staat op 1,00, hun bronweerstand op 0,001 Ω. De zeven kandidaten met een term ≠ 0 zijn alle zeven bewogen. Een wijziging die alleen daar aankomt waar de term bestaat, en nergens anders, is zo scherp als een vóór/ná op een niet-convexe zoektocht kan zijn.

  **WAT DE TERM MEET, NAAST WAT DE TABEL AFDRUKT.** De dissipatiekolom hierboven is M-A: het aandeel van het versterkervermogen dat in de discrete weerstanden verdwijnt, over het HELE netwerk. Dat is niet de grootheid die de term stuurt — die is de bronweerstand die de LAAGSTE weg ziet, één tak, bij de probe. Beide horen erbij en zij bewegen niet dezelfde kant op:

  | grootheid | vóór (V34) | ná (V37) |
  | --- | --- | --- |
  | M-A dissipatie, corpusgemiddelde | 19,7 % | **22,2 %** |
  | grootste enkele weerstand, corpusgemiddelde | 14,2 W | **15,2 W** |
  | R_source van de laagste weg, gemiddelde over de negen gepaarde kandidaten | 1,157 Ω | **1,110 Ω** |
  | de dissipatieterm zelf, zelfde negen | 0,0102 | **0,0100** |

  **EN DAT IS EEN EERLIJKE UITKOMST DIE KLEINER IS DAN DE INGREEP.** De term is veertig keer groter geworden en de grootheid die hij bestraft is corpusbreed 4 % gezakt. Individuele kandidaten bewegen veel verder, en in beide richtingen: `466,5 · 2283,5` gaat van 2,573 naar 1,405 Ω (en van 34,7 % naar 22,8 % M-A), `466,5 · 1719` juist van 1,414 naar 2,784 Ω. Wat de term koopt is dus geen corpusbrede daling maar het feit dat hij voor het eerst de grootheid weegt die hij bedoelt; de zoektocht doet daar wat een niet-convexe zoektocht doet.

  **WAT ER GRATIS BIJ KWAM EN WAT ERAF GING.** `548,5 · 1491,4` levert voor het eerst sinds V33 een netwerk — bij V33 weigerde `M-B/|Z|` zijn hele waardetune op 2,45 Ω, nu komt hij op 3,53 Ω uit — en de shortlist neemt hem op grond van spreiding op. Het is geen goed ontwerp: 5,47 dB venster, 3,83 dB RMS, 114° M-T-fase. `396,7 · 1981,2` valt eruit. Zijn dissipatieterm is nul — bronweerstand 0,001 Ω, `Qes_mult` 1,00 — dus V37 kan zijn eigen tune niet verplaatst hebben; wat hem eruit duwt is de samenstelling van het veld. Byte voor byte is dat niet na te rekenen, want een kandidaat die de shortlist niet haalt wordt geen bestand: de twee rijen hierboven die wél gebleven zijn dragen die claim. Dat is de shortlist die doet wat zij hoort te doen — spreiding boven rangschikking (A5e.1) — en het is óók de reden dat het corpusgemiddelde van M-A stijgt: er komt een rij bij met 26,3 %.

  **DE KOSTEN.** Vijftien ketenruns, gemeten 115–223 s per kandidaat, **40 minuten wandkloktijd** op `'safety'`. Dezelfde orde als V34 (41 min): V37 verandert een deling en geen raster, dus de prijs van de barrière is onveranderd.

  **HET CORPUSNIVEAU IS DE MAAT, NIET DE INDIVIDUELE KANDIDAAT, en dat is geen uitvlucht maar de V33-gevoeligheid.** De doelfunctie is niet convex en de zoektocht is deterministisch maar niet stabiel onder een storing: V33 mat dat zeven van de negen overgenomen rijen bewogen bij een wijziging waarvan verwacht werd dat zij niets zou doen. Een term veertig keer groter maken beweegt de netwerken hoe dan ook. Wat je kunt vragen is of het corpus als geheel de kant op gaat die de term bedoelt.

  **DIT IS DE EERSTE GRIJZE v1-WAARDE DIE OP DE v2-ROUTE ZICHTBAAR WERK DOET.** `dissipationWeight` staat op 0,05 — de app-standaard, overgenomen uit v1, expliciet gesteld door de kandidaat en nooit stil op nul (A3j). Tot V37 kon hij niets beslissen: `frozenNetlistGates.test.ts` assert dat de term op de piekhoogte op géén enkele bevroren netlist de uitdagingsdrempel van 1 % haalde (grootste aandeel 0,57 %), en op R_e haalt hij hem wel (grootste aandeel 22,7 %). Dat is precies de rol die `AMP_FLOOR_BARRIER_WEIGHT` bij V30 kreeg en die `greyValues` in de vingerafdruk vastlegt: een constante die elders is afgeregeld en hier draagt. **Het gewicht is deze sessie NIET bijgesteld**, en die volgorde is een besluit dat V36 al nam: eerst de noemer, dán pas de vraag of het gewicht klopt. Een gewicht ophogen om een verkeerd gemeten grootheid te compenseren is de fout twee keer maken; een gewicht verlagen omdat de grootheid eindelijk klopt, zou hetzelfde zijn.

  **WAT ER IN DE CODE VERANDERDE.** Nieuw: `tsconfig.scripts.json` (het vierde project onder `tsc -b`). Gewijzigd: `netOptimizer.ts` (`dissipationReferenceSource`, `dissipationReferenceReOhm`, `dissRefSource`/`resolvedReOf`, de noemerkeuze in `metricsOn`, `seedLowModel` uit de probenoot gelicht zodat twee notities niet twee drivers kunnen noemen, `dissipationRefNote`), `optimizer/choices.ts` (twee sleutels geclassificeerd, 42 → 44), `optimizer/candidateDeclaration.ts` (de onvoorwaardelijke V37-afleiding), `optimizer/worker.ts` (de R_e-overdracht uit `facts.reOhm`, de noot in de notities, en de melding wanneer er niets is opgelost), `optimizer/dissipationTerm.test.ts` (vijf V37-claims), `frozenNetlistGates.test.ts` (de Qes-reproductie met tegenproef, en de vóór/ná van de uitdagingsdrempel), `choiceKeyGuard.test.ts`, `casus1V2Candidates.test.ts`, de generator (`dissipatie_noemer` en het gewicht met hun redenen; de twee typefouten), `measure-v30-floor-goal.ts` (dezelfde twee), de recorder (`term_op_R_e`, twee benoemde noemers, het V34-corpus geregistreerd), `compare-corpora.ts` (`v34` als corpus, en als default-vóór), `measure-v36-dissipation.ts` (de laatste tabel is nu een vóór/ná), `freeze-live-corpus.ts` (de `klasse_toelichting` van het meegenomen blok wordt herschreven), en de twintig `V33_KAND_*`/`V34_KAND_*`-blokken die de oude zin droegen.

  **ONAANGERAAKT:** `dissipationWeight` en élk ander gewicht, M-A, de audittier, élke poort, de bronweerstandsprobe en zijn bron-sleutel (V35 blijft open), de barrière, `safety`, het ketenraster, de logica van beide ketens, en de v1-route — `toggleRegression.test.ts` is byte-identiek, `workerRouteRegression.test.ts` levert zijn opgeslagen netwerk nog steeds byte voor byte, en `f4cRegression.test.ts` reproduceert beide vormen op twee seeds.

**Openstaand in deze casus:** groundplane-metingen onder het onderste kruisgebied vóór onderdelenbestelling; HD-sweep; 30°-meting tweeter voor M-G-compleetheid; verzadigings-/formaatcheck grote P-core shunt-spoel.

## Casus S1 — synthetische grondwaarheid voor de R_e-schatter (F3b, 26-08-2026)

*De eerste casus in dit boek die geen luidspreker is. A7 noemt synthetische grondwaarheid als
onderdeel van de teststrategie; tot F3b bestond dat onderdeel alleen op papier, en de oude
`estimateRe` droeg er letterlijk een TODO over: "replace with a motional-impedance fit once the
estimator is validated against a synthetic ground-truth case (A7)".*

**Waarom een verzonnen kromme naast elf gemeten bestanden.** Casus 1 kan één vraag over R_e niet
beantwoorden, en het is de enige die telt: wélk getal is goed. Het casusboek draagt twee lezingen
van dezelfde R_e (2,90 en 3,05 Ω, V16), en beide zijn aflezingen van een meter of van een sweep —
geen van beide is de waarheid, alleen een andere meting ervan. Twee schatters die het eens worden
is consensus, geen validatie: als ze dezelfde systematische fout maken, zwijgen ze samen. Een
kromme die zijn eigen R_e kent, kent hem exact.

**De kromme.** Z(ω) = R_e + jωL_e + één motionele tak, gesampled op 400 logaritmische punten:

| grootheid | waarde |
|---|---|
| R_e (bekend, per constructie) | **6,000 Ω** |
| L_e | 0,3 mH |
| motionele tak | R 30 Ω, f 40 Hz, Q 6 |
| sweepbereik | 25 Hz – 4 kHz |

De sweep begint op 25 Hz tegen een resonantie op 40 Hz — 0,68 octaaf eronder, iets krapper dan
casus 1's woofer (10,07 Hz tegen f_L = 16,5 Hz, 0,71 octaaf). Dat is opzet: dit is die woofer in
het klein, mét het antwoord erbij.

**Wat de drie schatters lezen:**

| schatter | waarde | fout |
|---|---|---|
| directe aflezing (mediaan Re(Z), laagste 2,5 %) | 7,114 Ω | **+18,6 %** |
| motionele fit, DC-term | **6,000 Ω** | < 0,05 Ω |
| gerapporteerde motionele rok op 25 Hz | 1,11 Ω | verklaart het verschil |

Directe aflezing − rok = 6,00 Ω. De schatter zegt dus niet alleen een ander getal, hij zegt
precies hoeveel van het oude getal motionele impedantie was, en dat sluit.

**Wat deze casus sluit.** V8d vroeg om "motionele fit of extrapolatie". Die is er nu, en de
acceptatie ervan rust op grondwaarheid in plaats van op overeenstemming tussen schatters — het
verschil tussen "de twee zijn het eens" en "de fit heeft gelijk". De oude adviserende
f²-extrapolatie is verdwenen; zij las op casus 1's woofer **−2,69 Ω** en was daarmee het soort
getal dat een schatter publiceert als niemand hem een geval geeft waarvan het antwoord bekend is.

**Wat deze casus verder bewijst (en dat kon casus 1 niet).** De kromme draagt een tweede,
instelbare kruin op 300 Hz. Op 4 Ω hoogte ligt hij precies tússen de twee detectiedrempels:
onzichtbaar voor de piekzoeker op de directe aflezing (1,6 × 7,114 = 11,38 Ω), zichtbaar voor de
piekzoeker op de gefitte R_e (1,6 × 6,004 = 9,61 Ω). Daarmee is de verschuivende piekset
maakbaar, en dus toetsbaar — op een gemeten set is het een toevalstreffer of hij zich voordoet.
De lus classificatie → fit → herclassificatie draait op **vaste diepte**: één herclassificatie,
vlag bij verschil, nooit een derde ronde (A5e.4 — een determinismebelofte kan niet rusten op een
iteratieteller die van de kromme afhangt). De assert die het werk doet is niet de passenteller
maar dat de fit ná de verschuiving nog stééds één tak draagt: was er een derde ronde geweest, dan
was hij opnieuw gezaaid met twee.

**Wat deze casus NIET bewijst, en dat hoort erbij.** De kromme is precies het model dat de fit
aanneemt, dus zij toetst de lus rond de fit en niet of het model een echte driver beschrijft. Die
vraag beantwoordt casus 1, op gemeten data: residu 0,013–0,030 en een woofer die op 0,004 Ω van de
meterlezing van het paar landt. De twee casussen toetsen verschillende dingen en vervangen elkaar
niet.

## A9. Startprompts
Vervangen door het separate document `OptimizerV2_startprompts.md` (25-08): Prompt A = sessie F0 (sanering), Prompt B = sessie F1 inclusief **engine-toggle** (standaard uit, byte-identieke regressie met toggle uit) en de rapporterende metriekbibliotheek. Fixtures: meetbestanden casus 1 + drie netlists + `golden_refs_casus1.json` (bevat nu ook manifest en geometrie).
