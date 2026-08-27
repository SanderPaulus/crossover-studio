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

**M-F · Verticale lobing.** Twee niveaus.
*F-interim (alleen geometrie):* c-t-c-afstand per aangrenzend driverpaar in golflengtes bij het gevonden kruispunt, gescoord **niet-monotoon**: gunstig bij kleine afstand, ongunstigst rond de halve golflengte, opnieuw gunstig rond één tot anderhalve golflengte (verzoening van de twee strijdige vakregels; zie Deel B, validatie V5).
*F-eind (berekend):* synthetiseer het verticale gedrag uit per-driver-metingen, filterspanningen en z-offsets: `P(θ,f) = Σ_i P_i(f)·H_i(f)·e^{+jk·z_i·sinθ}`; rapporteer afwijking t.o.v. as over een instelbaar hoekvenster en de diepste dip in het kruisgebied. Databehoefte: interim — afstanden; eind — z-offsets (akoestische centra) + per-driver-metingen op één as. Beperking documenteren: puntbron-benadering per driver; eigen verticale bundeling van drivers/waveguides zit er niet in.

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
| M-F interim W-M / M-T | 0,29λ / 0,84λ | 0,36λ / 0,92λ | 0,36λ / 0,94λ |
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
  - **M-F-interim** (`_M_F_interim_parameters`). λ = d·f/c, en wélke d stond nergens. Het onderste paar gebruikt niet de 261 mm tussen wooferpaar en mid maar de **275,8 mm ARRAY-afstand binnen de wooferweg** — het paar is één weg met twee bronnen, en de bronscheiding die de lobe maakt zit binnen die weg. Op HUIDIG is dat 0,289 tegen 0,274 λ: buiten de λ-klasse van 4 %, dus een andere grootheid en geen afronding.

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
| `kandidaten.*.lobing_wm_lambda` / `.lobing_mt_lambda` (6) | B | gCT:464-467 | **herdefinieerd** | Wélke c-t-c stond nergens, en het onderste paar gebruikt de array-afstand en niet de paarafstand. |
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

- V20 (OPEN — welke afstand geldt voor lobing tussen een weg met N bronnen en de aangrenzende weg?) — opgeworpen bij F4a, **niet beantwoord**, en bewust als open vraag vastgelegd in plaats van als bevinding.

  **De vraag.** M-F-interim rekent λ = d·f/c op het kruispunt. Voor het paar wooferarray → mid gebruikt de engine vandaag de **array-afstand** (275,8 mm, de afstand tussen de twee woofers onderling) en niet de **paarafstand** (261 mm, tussen het akoestisch centrum van het paar en dat van de mid). Op HUIDIG scheelt dat 0,289 tegen 0,274 λ — buiten de λ-tolerantieklasse van 4 %, dus twee verschillende grootheden en geen afronding.

  **Wat er vóór elk van beide te zeggen valt, en waarom dat het lastig maakt.** De array-afstand beschrijft de bronscheiding *binnen* de lage weg; die maakt een lobe die er ook is als er geen tweede weg bestond. De paarafstand beschrijft de scheiding *tussen* de twee wegen op de plek waar zij elkaar overnemen, en dat is het verschijnsel waar M-F over gaat. Beide zijn echt en ze zitten in dezelfde frequentieband. Casus 1 kan de vraag niet beslechten: 0,289 en 0,274 vallen allebei in de gunstige zone, dus de ontwerpbeslissing gaat er niet van kantelen — precies waarom het een open vraag mag blijven en geen noodgreep hoeft.

  **Wat F4a wél heeft vastgelegd.** Dát de engine de array-afstand gebruikt staat sinds F4a in het referentiebestand (`kandidaten._M_F_interim_parameters.d_woofer_mid_mm`, met de herkomst erbij), zodat de keuze niet langer alleen in de code bestaat. De vraag welke van de twee JUIST is, is daarmee niet beantwoord — zij is alleen zichtbaar gemaakt.

  **Wat haar zou beslechten.** Een verticale meting over het kruisgebied van een weg met twee bronnen waarvan de array-afstand en de paarafstand ver genoeg uiteen liggen om de twee voorspellingen te scheiden, en waarvan de gemeten dip zegt welke van beide de lobe verklaart. Op deze meetset bestaat die scheiding niet. **Openstaand.**

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
