# Prompt D — Sessie F3: eisenvelden, toelaatbaar gebied, top-10 en relaxatie-ladder

*Voor Claude Code (Opus 5, /effort xhigh), verse sessie na de F2b-merge en groene CI. Dit is de
sessie waarin de engine voor het eerst zelf ontwerpen aandraagt.*

## Genomen besluiten (25/26-08, bekrachtigd door het draaien van deze sessie)

Als eerste deliverable gedateerd vastleggen in de nota §A5e, met doorwerking in A3/A6a stap 4.

### A5e.1 — Aggregatie = satisficing, geen gewichten

- De gebruiker stelt **eisen** (acceptatiegrenzen op de uitkomst): SPL-venster in ±dB t.o.v. de
  doelcurve, maximale fase-trackingfout, en de bestaande impedantie-/EPDR-vloer. Leeg veld = geen
  eis (P4).
- De engine zoekt het **toelaatbare gebied**: alles wat aan alle actieve eisen én poorten voldoet is
  een winnaar. Er bestaat **geen gewogen somscore en geen gewichtsvector** — nergens, ook niet
  intern als "hulpmiddel". Eisen zijn acceptatie-eisen op de uitkomst, geen straftermen in de
  zoektocht (P3 blijft onverkort).
- De uitkomst is een **gediversifieerde shortlist** (standaard 10, instelbaar): eerst gespreid over
  topologie-klassen (orde per flank), daarbinnen op afstand in genormaliseerde componentruimte —
  tien wezenlijk verschillende ontwerpen, geen tien klonen.
- **Sortering is presentatie, geen oordeel:** standaard gesorteerd op RMS-vlakheid t.o.v. de
  doelcurve; elke metriekkolom is hersorteerbaar; de selectie is aan de mens.
- **Venster poort, gemiddelde rangschikt:** de ±dB-eis is peak-to-peak op de 1/6-octaaf-gegladde
  systeemrespons; de sorteersleutel is RMS-afwijking van de doelcurve. Fase-eis = de bestaande
  trackingmetriek (gemiddelde |Δφ| per kruisgebied, geclipt op geldigheid, dekking gerapporteerd).
- **Outliers asymmetrisch:** smalle features vallen door de gladding buiten het venster-oordeel en
  gaan naar de rimpelscan; smalle **pieken** worden per kandidaat gerapporteerd als kolom (grootste
  piek: +dB @ f, met Q), smalle **dips** worden vergeven (psychoakoestisch gemotiveerd; in de nota
  vastleggen als smaakprincipe met die motivering). Géén extra drempelveld.
- **Relaxatie-ladder:** levert de zoektocht geen (of minder dan N) winnaars, dan verruimt de engine
  in zichtbare stappen **uitsluitend de falende smaak-eis(en)** (SPL-venster, fase) tot N kandidaten
  passen; de uitkomst draagt een etiket ("voldoet aan ±2,25 dB — gestelde eis was ±1,5").
  **Beschermingsgrenzen (Z/EPDR, dissipatie, V@fs) worden nooit gerelaxeerd.** Is een eis
  principieel onhaalbaar (bijv. Z-eis boven de door het drivercomplement gezette vloer), dan meldt
  de pre-design-diagnose dat vóór de zoektocht, met het haalbare getal erbij.

### A5e.2 — Doelcurve-object, minimaal

- Referentie voor dag één: **vlak**. Het object kent een type-veld; `tilt` en `behoud-huidig` zijn
  gedeclareerd maar niet geïmplementeerd (TODO, geen gedrag).
- De doelcurve hangt aan het **ontwerp**, niet aan het project: twee voicings van dezelfde speaker
  moeten naast elkaar kunnen bestaan en vergeleken worden.

## Context

Lees nota §A5e (parkeerlijst), A3/A6a (pijplijn stap 4), A4 (metrieken — de "zachte doelen" worden
onder dit besluit rapportage- en sorteerkolommen; werk die framing bij), F2-poortcode
(`engine2/optimizer/{gates,bounds,run}.ts`) en de F2b-worker-route. Inventariseer eerst hoe de
v2-zoektocht kandidaten genereert en waar diversiteit/selectie kan aangrijpen; rapporteer vóór je
wijzigt.

## Deliverable 1 — Besluiten vastleggen

A5e.1 en A5e.2 gedateerd in de nota, met de doorwerkingen: A4-framing (eisen/kolommen i.p.v.
gewichten), A6a stap 4 (gezamenlijke optimalisatie → toelaatbaar gebied + shortlist), en het
smaakprincipe pieken-rapporteren/dips-vergeven met motivering.

## Deliverable 2 — Doelcurve-object en eisenvelden

Ontwerp-niveau doelcurve (type `flat`), drie eisenvelden in de Engine-groep (SPL-venster ±dB, max
fase-trackingfout °, Z/EPDR bestaand), leeg = geen eis, ghost-suggesties alleen in UI-tekst.
Evaluatie: venster op 1/6-okt-gegladde som t.o.v. doelcurve; RMS-vlakheid als aparte gerapporteerde
grootheid.

## Deliverable 3 — Toelaatbaar-gebied-zoektocht + shortlist

De v2-run levert N gediversifieerde winnaars (topologie-klasse eerst, dan genormaliseerde
componentafstand; definieer beide canoniek en test ze los). Shortlist-tabel: alle metriekkolommen
(RMS, venster, fase per kruisgebied, min|Z|, min EPDR, dissipatie, V@fs, grootste smalle piek,
seed/vingerafdruk), hersorteerbaar, sortering verandert niets aan de inhoud. Determinisme: zelfde
invoer+seed ⇒ dezelfde N in dezelfde volgorde, byte-identiek.

## Deliverable 4 — Relaxatie-ladder en diagnose

Zichtbare stappen, alleen falende smaak-dimensies, etiket op de uitkomst, beschermingsgrenzen
uitgesloten per constructie (test: een ladder die een Z-vloer zou aanraken is een bug, geen
feature). Bij leeg gebied: best-gemiste-rapportage per eis ("fase gemist met 2,1°; venster en Z
gehaald") en de pre-design-diagnose voor principieel onhaalbare eisen (Z-vloer uit het
drivercomplement, venster-onhaalbaarheid uit de kruisvenster-analyse waar afleidbaar).

## Tests

- **(a) Casus 1:** met eisen op casusboek-niveau (venster ±2,0 dB, fase ≤ 5°, Z ≥ 3,2) levert de
  zoektocht ≥1 winnaar en bevat de shortlist minstens twee topologie-klassen als beide bestaan;
  poortstatus per rij.
- **(b) Ladder:** onhaalbaar venster (±0,1 dB) ⇒ zichtbare relaxatie met etiket, geen aangeraakte
  beschermingsgrens.
- **(c) Geen-gewichten-lint:** assert dat de objective-code geen gewogen som over
  metriek-categorieën bevat (structurele test op de zoekfunctie-signatuur/constanten, analoog aan de
  P6-lint).
- **(d) Asymmetrie:** fixture met smalle piek vs smalle dip ⇒ piek in de kolom, dip niet.
- **(e)** Toggle-uit byte-regressie ongewijzigd; volledige suite groen.
- **(f) Golden refs:** nieuwe referentiewaarden (RMS-vlakheid en vensterwaarde van KAND-B op casus
  1) mét vastgelegde parameters conform de V15-procesregel.

## Buiten scope

Catalogus-schema en snapping (A5e.3/F4 — TODO), tilt/behoud-huidig-doelcurves (gedeclareerd, geen
gedrag), topologievoorstellen (F6), elke wijziging aan het v1-pad, herweging van poorten.
N-weg-agnostisch.

Werkafspraken zoals altijd: inventarisatie eerst, volledige bestanden, typecheck vóór oplevering,
rapport per deliverable, commit-vraag aan het eind.
