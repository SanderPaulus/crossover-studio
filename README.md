# SD Acoustics - Crossover Studio

Ontwerptool voor passieve luidspreker-crossovers, gebouwd rond één kernidee:
ontwerpen op **gemeten fase** (inclusief het echte inter-driver-tijdverschil),
waar klassieke tools zoals VituixCAD minimum-fase reconstrueren.

**▶ De app draait hier: <https://sanderpaulus.github.io/crossover-studio/app/>**
(de landing page staat op <https://sanderpaulus.github.io/crossover-studio/>)

## Voor testers

- Gebruik bij voorkeur **Chrome of Edge** — de map-export naar VituixCAD werkt
  alleen daar. Firefox/Safari werken verder ook.
- Nog geen eigen metingen bij de hand? Bij de eerste start biedt de app
  **"Explore with the demo speaker"** aan; later vind je dezelfde knop als
  **"Load KOAN demo data"** op de Project-tab. Dat is een complete echte
  meetset van een driewegluidspreker (wooferpaar, mid, tweeter — responsies,
  fase, impedanties, hoekmetingen, nabij-veld en kastmaten): dezelfde
  luidspreker waarop de engine gevalideerd is. Er is ook een tweewegdemo
  (KOAN-prototype 2023).
- De app is beschikbaar in **Engels en Nederlands** (EN/NL-schakelaar in de
  bovenbalk). De **❓ Help**-knop opent de handleiding in de gekozen taal,
  inclusief een snelstart en uitleg per tabblad.
- Je werk wordt automatisch lokaal in je browser bewaard (er gaat niets naar een
  server). Wil je een ontwerp delen of feedback geven? Gebruik **Save project**
  op de Project-tab en stuur het bestand mee.
- **Engine v2 draait elke optimalisatie, en er valt niets meer aan of uit te
  zetten** (sinds sessie U-1). Het vinkje dat de app op de oude v1-optimizer kon
  terugzetten is verdwenen; de v1-motor zelf bestaat nog onder water, maar geen
  knop in de interface leidt er nog naartoe. De eisenvelden onder **⚙ Settings**
  op de Filters-tab zijn allemaal leeg, en dat blijft de regel: een eis die je
  niet stelt wordt niet beoordeeld, en de app zegt dat ook. Een project dat je
  vóór U-1 hebt bewaard opent gewoon; wat het aan v1-instellingen draagt blijft
  er ongewijzigd in staan, en de app zegt één keer welke dat zijn.

## Wat kan het?

- **Import** van FRD/ZMA-metingen, ARTA LIMP-impedanties (`.lim`) en
  VituixCAD-projecten (`.vxp`); nabij-veldmetingen worden complex met het
  ver-veld samengevoegd. **Export** terug naar VituixCAD inclusief de
  timing-brug, ook voor drieweg.
- **Volautomatische crossover-optimizer** ("Optimize — design for me"), voor
  twee- en driewegontwerpen en voor één driver solo: van meting tot
  gesynthetiseerd, getuned passief netwerk met echte catalogus-onderdelen
  (Jantzen/Mundorf) en stuklijst met prijzen. De catalogus-snap is een keuze;
  de zoektocht zelf is continu.
- **Engine v2** (experimenteel) legt daar een laag met gestelde eisen
  overheen:
  - je stelt **eisen**, geen gewichten: versterkerbelasting (|Z|- en
    EPDR-vloer), dissipatie, aandrijving op de eigen resonantie van een
    driver (per weg), opslingering rond de reflexpiek, Q_es-vermenigvuldiging,
    een basplateau als doelcurve, het piekvermogen van de versterker met de
    X_max-marge, **bouwbaarheid** (vermogen per weerstand tegen klasse × marge
    bij een gesteld thermisch ontwerpvermogen, piekstroom per spoel) en de
    **topologie-eis op de laagste weg** (geen niveauwerk, of serieweerstand tot
    een gesteld maximum). Leeg veld = geen oordeel; er zijn geen verborgen
    standaardwaarden, het rapportpaneel toont per poort `off`, `not judged`,
    `inside` of `exceeded`, en een ingevuld veld draagt "stated by you on
    <datum>";
  - het **kruisvenster** wordt afgeleid uit de meetgeldigheid van je
    bestanden (de vensterheader van de meting, of het merge-/geldigheidsblok
    dat een NF/FF-gemerged bestand over zichzelf schrijft), met de klassieke
    fysica-vloer ernaast als tegenoordeel — de app kiest niet stilzwijgend
    één van de twee. De vloer is de strengste van meetgeldigheid, k·f_s, het
    afgeleide excursieplafond en het gestelde M-C-getal; het plafond de
    strengste van breakup, directiviteit en een gesteld plafond, met de
    bindende grens bij naam;
  - de uitkomst is een **shortlist** van kandidaten die élke gestelde eis
    halen, gesorteerd als weergave en niet als oordeel (elke kolom sorteert;
    dat verandert nooit wélke ontwerpen erop staan). De lijst heeft een lengte
    (standaard tien) en kiest bij overvloed op spreiding over topologieklassen;
    kandidaten die een beschermingsregel weigerde staan eronder mét de regel
    die ze weigerde, en leveren geen netwerk;
  - de **driverbescherming** wordt afgeleid uit versterkervermogen, X_max,
    Bl, M_ms en de gemeten resonantie; de gestelde dB-grens blijft ernaast
    staan en de strengste van de twee oordeelt;
  - elke continue spoel draagt de **DCR van haar gestelde familie**, gefit op
    de catalogus (merk, serie, draaddikte) — in de tuner per evaluatie en in
    elke poort, inversie en inventaris hetzelfde getal; de spanwijdte van het
    grootste enkele onderdeel van die familie is een zoekgrens op de laagste
    weg;
  - je kiest het **kandidatenveld**: een *verkenning* (klein veld, venster-
    centra eerst, één uitlijning per overname) of het *volledige veld*.
    Dezelfde eisen, poorten, seed en tuner — een kleiner veld, geen lossere
    zoektocht; leeg = verkenning;
  - **twee- en driewegverzoeken gaan door dezelfde deur** naar de v2-worker
    (dezelfde ketenverklaring, dezelfde poorten, dezelfde shortlist);
  - **"Export run (JSON)"** onder de run-stempel schrijft de hele run weg —
    eisen, run- en veldinstellingen, vensterinvoer, elke kandidaat en de
    shortlist — en `scripts/replay-app-run.ts` speelt hem in de repo na
    (laag 1 uit het blok alleen, laag 2 op de meetset van de repo).
- **Grafische schema-editor** met live simulatie — elke bewerking herrekent,
  of de app zegt waarom niet — plus directivity/sonogram, impedantie- en
  fasebewaking, tijddomein-analyse, bouwtolerantie-band en een
  model-versus-meting-overlay voor de gebouwde luidspreker.

## Ontwikkelen

```bash
npm install
npm run dev          # dev-server op :5173 (landing op /, app op /app/)
npx tsc -b           # typecheck, inclusief scripts/
npm run test:fast    # alles behalve de live ketenruns (~7 min; referentie 289 s op een leeg systeem)
npm test             # de volle suite (~27 min) — verplicht vóór elke commit die de zoektocht raakt
npm run test:ci      # wat GitHub Actions draait
npm run build        # productie-build in dist/
```

**Drie testlagen, met een reden.** `test:fast` is de standaard tijdens het
werk. De volle run draait daarnaast **drie live ketenruns** die een bevroren
netlist byte-voor-byte reproduceren door de échte worker-route; die zijn de
acceptatie-autoriteit, en falen daar betekent niet af, hoe plausibel de code ook
oogt. `test:ci` laat precies die byte-vergelijkingen weg, want zij zijn gebonden
aan (machine, runtime): alleen de Node-versie wisselen — 26 → 22, zelfde machine
— verplaatst het zaad al op het vijfde significante cijfer en de simplex naar een
ánder lokaal optimum (3,005 → 3,034 mH), en afronden repareert dat niet. Over
machines heen geldt dus EQUIVALENTIE BINNEN DE TOLERANTIEKLASSEN en geen
byte-gelijkheid; een corpus dat elders wordt opgewekt is een legitiem ánder
corpus. **CI bewaakt de natuurkunde op de bevroren netlists, de lokale suite
bewaakt de bytes**, en `ciLayer.test.ts` bewaakt die taakverdeling zelf.
**Draai de lagen na elkaar, nooit naast elkaar** — twee vitest-pools
vermenigvuldigen elkaars geheugengebruik in plaats van op te tellen.

**Het casus-1-corpus opnieuw opwekken** (alleen nodig als de generator of het
veld verandert): `npx vite-node scripts/generate-casus1-v2-candidates.ts`, dan
`scripts/record-casus1-v2-references.ts` voor de referentieblokken en
`scripts/compare-corpora.ts` voor de vóór/ná-tabel. De generator draait één
proces per kandidaat, `V2_JOBS` tegelijk — en **kies die naar GEHEUGEN en niet
naar kernen**: een ketenrun houdt grote rasters vast, en achttien naast elkaar
zwiept de machine het geheugen uit (gemeten: dezelfde meting kostte er twintig
keer de prijs per run). Acht tegelijk was op deze machine de goede orde.
Meettijden per sessie, de andere meetscripts en de regeneratieprocedure staan in
`CLAUDE.md`.

**De acceptatie-autoriteit is het casusboek plus de golden references.** Elke
engine-uitspraak over casus 1 staat als referentie in
`test-fixtures/golden_refs_casus1.json`, met haar tolerantieklasse en — sinds
V15 — de parameters waaronder zij gemeten is; elke wijziging die er een
verplaatst is een meting in Deel B van
`docs/CrossoverStudio_OptimizerV2_strategie_v2.md` en geen redenering.

Sinds M-1 (sep 2026) leest de v2-route de NF/FF-gemergede meetset van casus 1
(woofers vanaf 20,5 Hz, mid vanaf 60 Hz, elk bestand met een geldigheidsblok dat
de parser leest); de gepoorte sessie van 22-08-2026 blijft ernaast bestaan voor
v1 en voor de tests die de gate-vloer zelf toetsen. **De demobundel in de app is
niet die fixture maar een herbemonstering ervan** (de gepoorte set op 500
punten): goed genoeg om hetzelfde veld af te leiden, niet identiek. Wie een
resultaat wil reproduceren gebruikt de fixture — of exporteert de run uit de app
en speelt hem na met `scripts/replay-app-run.ts`.

Twee pagina's uit één Vite-build (`build.rollupOptions.input`): `index.html` is de
landing page (statisch, eigen CSS/JS in `landing/`, screenshots in `public/shots/`),
`app/index.html` is de studio. Eén deploy, gedeelde assets, geen tweede host.

Elke push naar `main` draait `test:ci` en de build en publiceert naar GitHub
Pages (zie `.github/workflows/deploy.yml`); een push die alleen documentatie
raakt slaat de deploy over.

## Voor bijdragers

Vier werkregels die dit project duur heeft geleerd; `CLAUDE.md` draagt ze
voluit, met de meting die er telkens achter zit.

- **Inventariseer vóór je wijzigt.** Een grootheid heeft één huis en meerdere
  lezers; wie er een tweede implementatie naast zet krijgt twee antwoorden op
  één vraag en merkt dat pas als zij uiteenlopen. Zoek eerst wie de bestaande
  regel al leest.
- **Metingen gaan vóór toeschrijvingen.** "Dit is vast trager / veiliger /
  beter" is geen bevinding. Elke claim in het casusboek draagt het script dat
  haar produceerde, en meerdere hypotheses van deze zomer zijn door hun eigen
  meting afgeschoten.
- **P6 — geen projectgetallen in engine-code.** Geen frequenties, geen
  componentgrenzen, geen drempels: alles komt uit projectdata of uit een
  expliciete projectinstelling. `p6Lint.test.ts` handhaaft het; de whitelist is
  eenheidsconversies en c = 343.
- **P4 — leeg is geen oordeel.** Een niet-gestelde eis wapent niets, wordt
  nergens door een default vervangen, en zegt in het rapport dat zij niets
  beoordeelt. Een grens waarvan de ontwerper gelooft dat zij gesteld is terwijl
  zij het niet is, is de gevaarlijkste toestand die deze app kan hebben.

Typecheck (`npx tsc -b`, inclusief `scripts/`) vóór elke oplevering, en rapporteer
per deliverable het resultaat plus de testuitslag.

## Documentatie

- `CLAUDE.md` — projectregels en de meetgeschiedenis van de testsuite.
- `docs/CrossoverStudio_OptimizerV2_strategie_v2.md` — de specificatie van
  engine v2 (Deel A) en het casusboek (Deel B): elke wijziging aan de engine
  is daar met een meting vastgelegd.
- `docs/audit_engineV2_optimizerV1_grens.md` — de audit van de grens tussen de
  oude en de nieuwe engine.
- `test-fixtures/golden_refs_casus1.json` — de golden references van casus 1,
  inclusief de gestelde eisen en de driverkaart.
- `test-fixtures/casus2/golden_refs_casus2.json` — die van casus 2, de
  synthetische drieweg: mét het MODEL waaruit de meetbestanden gegenereerd zijn
  (`manifest_en_geometrie.grondwaarheid`) en de tabel die élke extractie ernaast
  legt (`afgeleide_parameters.extractie_tegen_grondwaarheid`).
- `VALIDATIE.md` — meten of de simulatie klopt met een gebouwd netwerk.
- `ROADMAP.md` — wat af is en wat open staat.
- `OVERDRACHT-2026-08.md`, `Optimizer_overdracht.md` — overdrachtsdocumenten.

## Status

Testversie, actief in ontwikkeling. Engine v2 is gevalideerd op **één** echt
driewegproject met echte metingen; de tweewegroute is gemeten op één afgeleide
casus (datzelfde project zonder zijn woofers) en niet op een onafhankelijk
tweewegproject. Sinds C-2 staat daar een **synthetische** drieweg naast (casus 2):
elf bestanden uit bekende modellen, waar élke extractie een bekend antwoord heeft
om naast te leggen — 44 vergelijkingen, en de vijf die er niet uit komen zijn als
bevinding vastgelegd in plaats van weggewerkt. Dat toetst iets wat gemeten data
niet kan toetsen (vindt de schatter het GOEDE getal, niet alleen hetzelfde als een
andere schatter) en vervangt de echte tweede meetset niet: die blijft wat dit van
één ontwerp naar een regel brengt. Of het ontwerp zelf passief gebouwd wordt of hybride, is nog niet
beslist — de app is er om dát te beslissen. Feedback is welkom via de
[issues](https://github.com/SanderPaulus/crossover-studio/issues).
