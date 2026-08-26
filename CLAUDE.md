# Crossover Studio — projectregels (elke sessie van kracht)

## Autoriteit
- Specificatie: `docs/CrossoverStudio_OptimizerV2_strategie_v2.md` (Deel A). Bij twijfel wint de nota.
- Startprompts: `docs/OptimizerV2_startprompts.md`. Golden refs: `test-fixtures/golden_refs_casus1.json`.
- `docs/prototype/` is referentie, geen voorbeeldcode: `ingest.py` bevat bekende fouten (V8a–e).

## Harde regels (altijd)
- **P6:** geen letterlijke frequenties, componentgrenzen of andere projectgetallen in engine-/metriekcode. Alles afgeleid uit projectdata of expliciete projectinstelling. Whitelist: eenheidsconversies, c=343.
- **Toggle-invariant:** met `engineV2Enabled` uit is app-gedrag byte-identiek. Elke wijziging die dit raakt vereist de toggle-regressietest.
- **Schatter-versionering:** elke extractor exporteert een versiestring; gedragswijziging = versiebump = cache-invalidatie.
- **A5e-besluiten** (aggregatie, doelcurve, catalogus-schema, determinisme-beleid) zijn geparkeerd: niet eigenmachtig invullen, TODO met verwijzing.
- N-weg-agnostisch: nergens een aanname van drie wegen.

## Werkafspraken
- Volledige gevalideerde bestanden, nooit losse blokken. Benoemde constanten bovenaan met commentaar.
- Typecheck vóór elke oplevering; rapporteer per deliverable resultaat + testuitslag.
- Golden-reference-suite is de acceptatie-autoriteit; falen = niet af, ongeacht hoe plausibel de code oogt.

## Commando's

- `npx tsc -b` — typecheck. Draait vóór elke oplevering, zonder uitzondering.
- `npx vitest run` — volledige testsuite (89 bestanden, 928 tests, ~4,5 min). Alles groen houden.
- `npx vitest run <pad>` — gerichte run tijdens het werk; de volle suite blijft de acceptatie.
- `npm run build` — productiebuild (draait ook de typecheck via `tsc -b`).

### Guards in de suite
- `src/lib/noAppWideFloor.test.ts` — bewaakt dat de verwijderde app-brede versterkervloer niet
  terugkeert: scant heel `src/` op de identifier en faalt bij één treffer. De identifier wordt op
  runtime samengesteld, zodat de guard zichzelf niet matcht. Een tweede test controleert dat de
  walker de boom echt afloopt — een stille lege scan zou anders eeuwig groen blijven.

- `src/lib/engine2/p6Lint.test.ts` — P6 als test, niet als reviewregel: elk numeriek
  literal ≥ 20 in `src/lib/engine2/` moet in `constants.ts` staan (met een `@p6`-tag uit
  een gesloten set) of een `P6-OK`-markering op zijn regel dragen. Plus: geen constante
  met `_HZ` in de naam mag als `unit` of `rule` getagd zijn.
- `src/lib/engine2/toggleRegression.test.ts` — bewijst de toggle-invariant drie kanten op:
  een referentie-optimalisatierun byte-identiek met en zonder de v2-modules geladen, geen
  enkele import van `engine2/` buiten de UI-instappunten, en `undefined` = `false` in de vlag.
- `src/lib/engine2/goldenCasus1.test.ts` — de acceptatie-autoriteit (casus 1). Alle referenties
  reproduceren; `KNOWN_DEVIATIONS` is leeg en die lengte wordt geassert, zodat een nieuwe
  afwijking een bewuste daad is en niet iets wat erin sluipt. Tolerantieklassen komen uit het
  referentiebestand, niet uit de test — een tolerantie hoort bij de referentie, en een test die
  zijn eigen meedraagt kan er ongemerkt eentje oprekken.
- `src/lib/browserSafe.test.ts` — kent nu ook `*.fixture.ts` (test-only loaders die van
  schijf lezen) als uitzondering, met een tweede test die pint dat niets uit de bundel er
  een importeert.

### F2-guards (poorten, grenzen, determinisme)
- `src/lib/engine2/optimizer/determinism.test.ts` — A5e.4: twee runs met dezelfde seed
  byte-identiek, een andere seed bereikt aantoonbaar de zoektocht (niet alleen de
  vingerafdruk), en de vingerafdruk beweegt mee met **elke** component waaruit hij bestaat.
  Die laatste loopt de componentenlijst af in plaats van er drie te prikken, plus een
  dekkingsassert zodat een nieuwe component niet ongetest kan meeliften.
- `src/lib/engine2/optimizer/gateEnforcement.test.ts` — de twee acceptatieregressies van F2.
  V2-pathologie (fasedoel via serie-R die naar de wand drift) en geen-ontwijking (élke
  opgeleverde kandidaat, niet alleen de winnaar). Beide asserteren óók dat de **ongepoorte**
  run het gedrag wél vertoont — een poortregressie op een casus die zich altijd gedraagt
  bewijst niets. Plus P2: een gewapende maar ruime poort levert een byte-identiek netwerk op,
  wat uitsluit dat een poort als strafterm meedoet.
- `src/lib/engine2/optimizer/gates.test.ts` — afwezig = uit én zichtbaar, de EPDR-vloer en de
  |Z|-vloer als twee onafhankelijke grenzen door één regel (de |Z|-vergelijking blijft van
  `meetsAmpFloor`), en "hoogdoorlaatbeschermd" afgeleid uit de takoverdracht in plaats van uit
  een lijst wegnamen.
- `src/lib/engine2/optimizer/boundInversions.test.ts` — de `grens_inversies`-referenties van
  casus 1, nu gewone asserts. De bult-inversie assert op de **metriek** (de bult bij de
  genoteerde L is het budget, binnen de dB-klasse) in plaats van op de millihenry: een
  geïnverteerde grens erft de tolerantie van de metriek die zij inverteert.
- `src/lib/engine2/gateReport.test.ts` — P4's zichtbare helft: elke poort staat in het rapport,
  inactief mét waarde en met "no limit set", en de poortwaarde ís de metriekwaarde (geen tweede
  berekening ernaast).

De vloer is sinds F0 uitsluitend het getal dat de ONTWERPER invult (`ampMinLoadOhm`, geen default):
leeg veld = geen oordeel. Eén regel, één plek: `meetsAmpFloor` in `src/lib/impedanceFloor.ts`.
Wie een vloer nodig heeft roept die aan en verzint geen eigen drempel.
