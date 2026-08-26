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
- `npx vitest run` — volledige testsuite (99 bestanden, 1003 tests, ~4,5 min). Alles groen houden.
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

### F2b-guards (tweede worker, scanknop)
- `src/lib/engine2/toggleRegression.test.ts` — de allowlist telt sinds F2b drie entries; de derde
  (`optimClient.ts`) draagt haar besluit en reden in het commentaar. Een blijvende assert erbij:
  **`optimWorker.ts` importeert nog steeds niets uit `engine2/`** — de vloer onder dat besluit.
- `src/lib/engine2/optimizer/workerRoute.test.ts` — determinisme dóór de échte route: het verzoek
  gaat via `handleV2Request` (de hele workerbody op drie regels `self.onmessage` na) met de payload
  eerst door `structuredClone`, precies zoals `postMessage` hem serialiseert. Twee passages met
  dezelfde seed zijn byte-identiek.
- `src/lib/engine2/optimizer/runStatus.test.ts` — A5e.4: het statusveld zit ín de vingerafdruk, dus
  een afgebroken run kan nooit gelijk uitvallen aan een voltooide; en een afgebroken run draagt
  altijd een reden.
- `src/lib/engine2/optimizer/gateCell.test.ts` — de poortkolom als regel: een rij die níet uit een
  v2-run komt leest `absent`, nooit een vinkje, en de cel vergelijkt zelf nooit een waarde met een
  grens.

### F3-guards (eisen, shortlist, ladder)
- `src/lib/engine2/optimizer/noWeights.test.ts` — **A5e.1 als test.** Scant de satisficing-vlakte
  (`requirements/`, `shortlist.ts`, `relaxation.ts`, `diversity.ts`) op woorden die een gewogen
  aggregatie benoemen — `weight`, `priorit`, `importance`, `penalt`, `objective` — in CODE, niet in
  commentaar of strings, want het besluit zelf moet met naam en toenaam besproken kunnen worden.
  Zonder woordgrenzen, want een gewichtsvector arriveert vaker als `phaseWeight` dan als `weight`.
  De v1-ranking (`rankChain3Results`) is bewust buiten het lint en draagt daar zelf een
  verwijzende notitie over.
- `src/lib/engine2/requirements/response.test.ts` — het smaakprincipe: smalle **piek** krijgt een
  kolom, smalle **dip** wordt vergeven. De detector eist een lokaal maximum van zowel het residu
  als de respons — zonder die tweede eis leest een dip als twéé pieken op zijn schouders, precies
  de asymmetrie omgekeerd.
- `src/lib/engine2/optimizer/relaxation.test.ts` — de ladder verruimt alleen falende
  smaak-eisen, in zichtbare stappen, met etiket; en drie asserts dat een beschermingsgrens
  onbereikbaar is (type, sleutelverzameling, en een ladder die er graag bij zou willen).
- `src/lib/engine2/optimizer/diversity.test.ts` — de twee canonieke definities van "verschillend":
  klasse-sleutel (orde per flank, polariteit erin) en genormaliseerde componentafstand, elk apart
  testbaar zodat een fout zegt wélke definitie fout is.
- `src/lib/engine2/optimizer/shortlist.test.ts` — het toelaatbaar gebied, de spreiding, en de
  **tweetraps-stempel**: dezelfde eisen op dezelfde run zijn byte-identiek, andere eisen geven
  dezelfde run-vingerafdruk en een ander shortlist-stempel.
- `src/lib/engine2/optimizer/casus1Shortlist.test.ts` — de F3-golden refs op casus 1
  (RMS-vlakheid en vensterwaarde per kandidaat) mét vastgelegde parameters, plus de shortlist op
  het casusboekveld.

### F3b-guards (vensters in de dialoog, paneel-eerlijkheid, motionele Re)

> **Bewuste keuze, geen vergissing:** het A5a-meetformulier (akoestisch centrum,
> rotatiesymmetrie, gemeten R_e, handmatige venstertijden) staat áchter de v2-toggle, ook al
> zijn het meetfeiten en geen engine-instellingen. Reden: de toggle-invariant eist dat de app
> met de vlag uit byte-identiek is, en een formulier dat rendert is dat niet. Niets buiten
> engine2 leest deze velden vandaag, dus het gaten kost niets. Ze verhuizen naar de hoofdlaag
> op de dag dat v2 de standaard wordt — tot dan is ze eruit halen een regressie van de
> toggle-garantie, en `toggleRegression.test.ts` faalt erop. Volledige motivering staat bij de
> invariant zelf, in `engine2/facade.ts`.
- `src/lib/engine2/predesign/xoRangeAdvice.test.ts` — de scandialoog als pure functies.
  Overname vult **exact** de vensterranden (en met typbare getallen: `(396,7+549,7)/2` is
  `473.20000000000005` in binaire drijvende komma, en een veld dat zichzelf daarmee vult
  zegt tegen de ontwerper dat de app stuk is). Waarschuwing binnen/deels/geheel-buiten,
  leeg én onbeschikbaar venster, en de raming die **kandidaten** telt in plaats van
  mislukkingen. Plus de regressie op de randafdruk: een plafond van 549,6 Hz afgedrukt als
  "550" naast een bereik dat op 550 eindigt levert een zin op die zichzelf tegenspreekt.
- `src/lib/engine2/optimizer/gateTolerance.test.ts` — P4's derde helft: een poort die
  alléén binnen de meettolerantie slaagt (3,17 Ω tegen 3,20 Ω) zegt dat, en de zin noemt de
  tolerantie een **conventie** en geen eigenschap van de versterker. Geschreven tegen de
  ene vergelijkingsregel, niet tegen de |Z|-poort: `withinToleranceOnly` hoort bij élke
  poort waarvan de acceptatie van de kale vergelijking afwijkt.
- `src/lib/engine2/manualWindowAndLobing.test.ts` — (g) M-F-eind reproduceert de
  casus-1-referentie (−3,9 dB @ ~3,5 kHz) mét de akoestische centra en staat **uit met
  reden** zonder; het coplanaire degeneraat wordt geweigerd in `verticalLobing` zelf, want
  een aanroeper die de controle vergat zou het vleiende 0,0 dB publiceren. (h) De
  handmatige venstertijd: vloer verschijnt, ankerblok herrekent, vlag verdwijnt — en de
  test legt vast dat een **header altijd wint** (A5b.1(i) mag niet door een invoerveld
  versoepeld worden). Het ankerblok-geval is de echte inversie: zonder vloer schuift het
  anker van mid naar woofer terwijl `anchorSwitchWarning` zwijgt, en dat is precies waarom
  de kanttekening op het blok zelf moest.
- `src/lib/engine2/ingest/reResolution.test.ts` — **A5e.4 als test.** De lus
  classificatie → fit → herclassificatie draait op VASTE DIEPTE: één herclassificatiepas,
  nooit twee. Een synthetische kromme met een kruin die precies tússen de twee
  detectiedrempels ligt (onzichtbaar voor de pas die de fit zaait, zichtbaar voor de pas
  erna) toont de vlag — en de diepte-assert die telt is dat de fit dan nog stééds één tak
  draagt: hij is niet opnieuw gezaaid. De passenteller wordt bij de aanroep opgehoogd, niet
  achteraf beweerd (V17). Diezelfde kromme is de ground truth die de oude `TODO(V8d)`
  vroeg: R_e = 6,000 bekend, directe aflezing 7,114, fit 6,000.
- `src/components/xoWindowAnnotation.test.tsx` — de **runtime**-helft van test (a): de
  annotatie gerenderd met `renderToStaticMarkup` (geen DOM-library, geen nieuwe
  dependency). Toggle uit ⇒ de uitvoer is de lege string en bevat nul annotatie-elementen;
  plus de tegenproef dat dezelfde query wél raak is mét vensters, want een assert op "geen
  treffers" is niets waard tot hij heeft laten zien dat hij kán treffen.
- `src/lib/engine2/toggleRegression.test.ts` — de structurele helft: de F3b-oppervlakken
  hangen alle drie aan `v2Windows` / `engineSelection.reporting`, en `App.tsx` spelt de
  annotatieklasse nergens zelf — dus de runtime-assert hierboven dekt élk pad dat hem kan
  tekenen. Testbestanden zijn sinds F3b vrijgesteld van de importscan (een test zit niet in
  de bundel; wat er wél in zit is de zaak van `browserSafe.test.ts`), met een assert erbij
  dat die vrijstelling de app niet heeft opgeslokt.
- `src/lib/engine2/goldenCasus1.test.ts` — de R_e-hiërarchie (gebruikers-DC > fit >
  directe aflezing) mét de doorwerking, én de **gemeten fit-kwaliteit als referentie**:
  residu en bandgevoeligheid per driver, op de vastgelegde fitband, in een eigen
  tolerantieklasse met motivering (`fit_kwaliteit_pct`). Een deterministische solver hoort
  die getallen terug te geven; een wijziging die ze verschuift moet zichtbaar falen in
  plaats van stil te schuiven. Verder: de verliesindicator beweegt mee, want R_e wordt in
  de **pas** opgelost en niet bij de metriek die hem leest. De derived-parameter-asserts
  draaien nu op een rapport zónder ingevoerde DC — anders assert je het doorgeven.
- `src/lib/engine2/versionAndCapability.test.ts` — de eerste **productie**-oefening van
  A5e.5: een échte afleiding gecachet onder de pre-F3b-vingerafdruk vervalt, en wat ervoor
  in de plaats komt is een ánder getal. Een bump die hetzelfde getal onder een nieuw etiket
  teruggeeft bewijst niets.

De vloer is sinds F0 uitsluitend het getal dat de ONTWERPER invult (`ampMinLoadOhm`, geen default):
leeg veld = geen oordeel. Eén regel, één plek: `meetsAmpFloor` in `src/lib/impedanceFloor.ts`.
Wie een vloer nodig heeft roept die aan en verzint geen eigen drempel.
