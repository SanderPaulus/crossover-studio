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

Structureel afgevangen ontwerpfouten: (1) polish-fase die grenzen negeert — grenshandhaving zit in de kern; (2) optima op een naald — worst-case over de parasietband is een vaste laatste fase, met de onzekerheidsband als instelling.

## A4. Metriekregister

Formaat per metriek: *grootheid → formule → afgeleide parameters → databehoefte → rol (poort/zacht/rapportage) → status*. Een metriek komt pas in de engine als alle velden compleet zijn en er een validatiecasus in Deel B staat.

### Poorten (harde eisen, geen extra databehoefte)

**M-A · Dissipatie per weerstand.** `P_R = ∫ S(f)·|I_R(f)/E_g|²·R df`, met S(f) een programmaruis-weging (IEC 60268-1: roze met 1e-orde HP/LP op de normranden), genormeerd zodat het totaal in de luidspreker opgenomen vermogen gelijk is aan de opgave. Rapportage als **fractie van het versterkervermogen** (schaalvrij) én in watt bij door de gebruiker gekozen vermogen. Databehoefte: geen — elementstromen volgen uit de MNA-oplossing. Valkuil (gedocumenteerd in casus 1): normeren op E_g².

**M-B · EPDR.** `EPDR(f) = |Z_in|/(2·cos²φ)`; poort op het minimum over de band. Vervangt de kale |Z|-ondergrens; die blijft beschikbaar als eenvoudige modus. Databehoefte: geen.

**M-C · Spanning op driverresonantie.** `20·log10(|V_drv(f_s)| / V̄_passband)`, met f_s automatisch uit de piek(en) van het geladen impedantiebestand en V̄_passband het gemiddelde over de doorlaatband van die weg, **afgeleid uit de gevonden kruispunten** (P6). Vangt de vuistregels "kruis ≥ 2×Fs" en "−18 dB op Fs" in één berekenbare grootheid. Databehoefte: geen. Grens instelbaar per project.

### Zachte doelen

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

1. **Normalisatie en aggregatie van zachte doelen.** Metrieken hebben ongelijke eenheden (°, dB, %, λ). Besluit nodig: elke zachte metriek genormaliseerd naar een dimensieloze score (t.o.v. zijn filterloze basislijn of haalbare bereik), en presentatie als gewogen som óf als kleine Pareto-selectie van uiteenlopende kandidaten. Aanbeveling: genormaliseerde scores + top-N diverse kandidaten tonen — de afruil is van de gebruiker, niet van het gewichtsvector-gokwerk.
2. **Doelcurve-object.** Formeel projectobject (zie voicing-principe hierboven): type, parameters, evaluatiebasis (op-as / luistervenster), versiebeheer.
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
4. **Gezamenlijke waarde-optimalisatie** — kruispunten, fase én SPL in één doelfunctie, binnen poorten en grenzen. Nooit na elkaar.
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

**Openstaand in deze casus:** groundplane-metingen onder het onderste kruisgebied vóór onderdelenbestelling; HD-sweep; 30°-meting tweeter voor M-G-compleetheid; verzadigings-/formaatcheck grote P-core shunt-spoel.

## A9. Startprompts
Vervangen door het separate document `OptimizerV2_startprompts.md` (25-08): Prompt A = sessie F0 (sanering), Prompt B = sessie F1 inclusief **engine-toggle** (standaard uit, byte-identieke regressie met toggle uit) en de rapporterende metriekbibliotheek. Fixtures: meetbestanden casus 1 + drie netlists + `golden_refs_casus1.json` (bevat nu ook manifest en geometrie).
