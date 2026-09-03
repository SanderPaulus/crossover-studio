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
- **Engine v2 is experimenteel en staat standaard uit.** Aanzetten kan onder
  **⚙ Settings** op de Filters-tab ("Engine v2 (experimental) — metrics + hard
  gates"). Met de schakelaar uit gedraagt de app zich exact zoals altijd; met
  de schakelaar aan verschijnen de eisenvelden, en die zijn allemaal leeg:
  een eis die je niet stelt wordt niet beoordeeld, en de app zegt dat ook.

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
    driver, opslingering rond de reflexpiek, Q_es-vermenigvuldiging, een
    basplateau als doelcurve, en het piekvermogen van de versterker met de
    X_max-marge. Leeg veld = geen oordeel; er zijn geen verborgen
    standaardwaarden, en het rapportpaneel toont per poort `off`,
    `not judged` of `inside`;
  - het **kruisvenster** wordt afgeleid uit de meetgeldigheid van je
    bestanden (de vensterheader van de meting), met de klassieke
    fysica-vloer ernaast als tegenoordeel — de app kiest niet stilzwijgend
    één van de twee;
  - de uitkomst is een **shortlist** van kandidaten die élke gestelde eis
    halen, gesorteerd als weergave en niet als oordeel; kandidaten die een
    beschermingsregel weigerde staan eronder mét de regel die ze weigerde,
    en leveren geen netwerk;
  - de **driverbescherming** wordt afgeleid uit versterkervermogen, X_max,
    Bl, M_ms en de gemeten resonantie; de gestelde dB-grens blijft ernaast
    staan en de strengste van de twee oordeelt.
- **Grafische schema-editor** met live simulatie — elke bewerking herrekent,
  of de app zegt waarom niet — plus directivity/sonogram, impedantie- en
  fasebewaking, tijddomein-analyse, bouwtolerantie-band en een
  model-versus-meting-overlay voor de gebouwde luidspreker.

## Ontwikkelen

```bash
npm install
npm run dev          # dev-server op :5173 (landing op /, app op /app/)
npx tsc -b           # typecheck, inclusief scripts/
npm run test:fast    # alles behalve de twee live ketenruns (~5 min)
npm test             # de volle suite (~20 min) — verplicht vóór elke commit die de zoektocht raakt
npm run test:ci      # wat GitHub Actions draait
npm run build        # productie-build in dist/
```

Drie testlagen, met een reden. `test:fast` is de standaard tijdens het werk.
De volle run draait daarnaast twee live ketenruns op casus 1 die het levende
kandidatencorpus byte-voor-byte reproduceren; die zijn de acceptatie-autoriteit.
`test:ci` laat precies die byte-vergelijkingen weg, want zij zijn gebonden aan
machine en runtime (alleen de Node-versie wisselen verplaatst een zoektocht al
naar een ander lokaal optimum) — CI bewaakt de natuurkunde op de bevroren
netlists, de lokale suite bewaakt de bytes. Draai de lagen na elkaar, nooit
naast elkaar. Details, meettijden en de regeneratiescripts voor het
casus-1-corpus staan in `CLAUDE.md`.

Twee pagina's uit één Vite-build (`build.rollupOptions.input`): `index.html` is de
landing page (statisch, eigen CSS/JS in `landing/`, screenshots in `public/shots/`),
`app/index.html` is de studio. Eén deploy, gedeelde assets, geen tweede host.

Elke push naar `main` draait `test:ci` en de build en publiceert naar GitHub
Pages (zie `.github/workflows/deploy.yml`); een push die alleen documentatie
raakt slaat de deploy over.

## Documentatie

- `CLAUDE.md` — projectregels en de meetgeschiedenis van de testsuite.
- `docs/CrossoverStudio_OptimizerV2_strategie_v2.md` — de specificatie van
  engine v2 (Deel A) en het casusboek (Deel B): elke wijziging aan de engine
  is daar met een meting vastgelegd.
- `docs/audit_engineV2_optimizerV1_grens.md` — de audit van de grens tussen de
  oude en de nieuwe engine.
- `test-fixtures/golden_refs_casus1.json` — de golden references van casus 1,
  inclusief de gestelde eisen en de driverkaart.
- `VALIDATIE.md` — meten of de simulatie klopt met een gebouwd netwerk.
- `ROADMAP.md` — wat af is en wat open staat.
- `OVERDRACHT-2026-08.md`, `Optimizer_overdracht.md` — overdrachtsdocumenten.

## Status

Testversie, actief in ontwikkeling. Engine v2 is gevalideerd op één echt
driewegproject met echte metingen; of dat ontwerp passief gebouwd wordt of
hybride, is nog niet beslist — de app is er om dát te beslissen. Feedback is
welkom via de [issues](https://github.com/SanderPaulus/crossover-studio/issues).
