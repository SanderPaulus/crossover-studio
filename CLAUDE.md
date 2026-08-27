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
- **CLAUDE.md wordt nooit buiten de repo gekopieerd.** Er bestaat geen tweede exemplaar dat gelijk gehouden moet worden; een CLAUDE.md in een bovenliggende map is een ánder bestand met een eigen inhoud. Zie de deny-regels onder Commando's.

## Werkafspraken
- Volledige gevalideerde bestanden, nooit losse blokken. Benoemde constanten bovenaan met commentaar.
- Typecheck vóór elke oplevering; rapporteer per deliverable resultaat + testuitslag.
- Golden-reference-suite is de acceptatie-autoriteit; falen = niet af, ongeacht hoe plausibel de code oogt.

## Commando's

- `npx tsc -b` — typecheck. Draait vóór elke oplevering, zonder uitzondering.
- `npx vitest run` — volledige testsuite. **Gemeten 27-08-2026 (V30-vervolgsessie): 121 bestanden, 1305 tests, ~4,5 min
  wandkloktijd (267 s; ~21 CPU-minuten).** Alles groen houden. De telling stond tot F4b op 99/1003 — dat was de
  stand bij F3 (`61a3ea4`) en zij is drie opleveringen lang niet bijgewerkt: F3b bracht 104 bestanden, F3c 106,
  F4a 107, F4b 108, F4b2 109, F4c 112, V20 113, F4d 119, de F4d-nazorg 120, de vloersessie 120, V30 121.
  Vandaar de datum erbij: een telling zonder meetmoment is een telling die stil veroudert.
  **Waar de tijd zit (nazorg-meting):** vijf bestanden draaien echte ketenruns en zijn samen ruim elf van de
  ~22 CPU-minuten — `threeWayChain` (282 s), `candidateRoute` (111 s), `designChain` (102 s),
  `workerRouteRegression` (98 s), `casus1V2Candidates` (77 s). Elk van hen draait het minimum aantal live runs
  dat zijn claim draagt; de rest leest bestanden. Een regressie die niemand draait omdat hij traag is,
  beschermt niets.
- **De v2-kandidaatfixtures opnieuw opwekken** (alleen nodig als de generator of het veld verandert):
  `npx vite-node scripts/generate-casus1-v2-candidates.ts` — vijftien ketenruns, gemeten 37–72 s per stuk,
  ~13 min; schrijft de tien shortlist-netlists en `casus1_v2_herkomst.json`. Daarna
  `npx vite-node scripts/record-casus1-v2-references.ts` (drie seconden) voor de klasse-B-blokken én
  de vergelijkingstabel voor het casusboek. **Nagemeten bij de nazorg: twee opeenvolgende runs leveren de
  netlists byte-identiek terug, op het `savedAt`-stempel van de serialisatie na.**
- **De vloer als zoekdoel meten (V30)**: `npx vite-node scripts/measure-v30-floor-goal.ts` —
  dertig ketenruns (vijftien kandidaten × twee armen), gemeten 45–70 s per stuk, ~30 min.
  Schrijft `test-fixtures/casus1_v30_vloer_vergelijking.json` en drukt de vóór/ná-tabel af.
  Schrijft géén netlist: de interessante rijen zijn juist de kandidaten die een poort
  weigert, en die worden nooit een bestand. `V30_LIMIT=1` draait één kandidaat per arm als
  rookproef — dat is geen meting.
- `npx vitest run <pad>` — gerichte run tijdens het werk; de volle suite blijft de acceptatie.
- `npm run build` — productiebuild (draait ook de typecheck via `tsc -b`).

### Schrijfbeveiliging buiten de repo (`.claude/settings.local.json`, `permissions.deny`)
Tweemaal is `/Users/sandersomers/CLAUDE.md` — een CLAUDE.md in een BOVENLIGGENDE map, buiten de
repo — overschreven met de project-CLAUDE.md. Beide keren door dezelfde regel, als laatste regel
van dezelfde Bash-aanroep die de project-CLAUDE.md bijwerkte:

    cp CLAUDE.md /Users/sandersomers/CLAUDE.md 2>/dev/null

Geen hook, geen `/init`, geen cwd-ongeluk: een bewuste "houd ze gelijk"-stap, uitgelokt doordat
beide bestanden bovenaan de context staan onder dezelfde kop. **Ze zijn niet hetzelfde bestand en
horen niet gelijk te zijn.** De deny-regels dekken twee lagen — de padregels binden Write/Edit, de
Bash-regels de vormen waarin het is misgegaan. JSON kent geen commentaar, dus de reden staat hier.

**De dekking is nagemeten, en zij is niet volledig — lees dit voordat je erop vertrouwt.**

| poging | uitkomst |
| --- | --- |
| `Write`/`Edit` op `~/CLAUDE.md` (of enig `~/*.md`) | **geweigerd** — *"File is in a directory that is denied by your permission settings"* |
| `cd <repo> && cp CLAUDE.md /Users/sandersomers/CLAUDE.md` (de historische regel) | **geweigerd** |
| `printf 'x' > /Users/sandersomers/probe.md` | **KOMT ER DOOR** |

Bash-deny-regels matchen op het begin van een (deel)commando — Claude Code splitst op `&&` en
toetst elk deel, wat verklaart waarom de `cp` binnen een `cd … && cp …` alsnog wordt gepakt. Een
patroon dat met `*` begint werkt níet; die zijn er weer uit gehaald in plaats van blijven staan,
want een regel die dekking suggereert die er niet is, is erger dan geen regel.

*Wat de regels bewust NIET zijn:* een blanket-verbod op alles buiten de repo. De repo ligt zélf
onder `/Users/sandersomers/`, en `Edit(//Users/sandersomers/*)` blokkeerde bij het uitproberen
prompt de repo mee — de eerste versie van deze regels kon haar eigen bronbestanden niet meer
bewerken. Een echt "alleen binnen de repo"-bereik vraagt de sandbox
(`sandbox.filesystem.denyWrite`, dat volgens het settings-schema met de `Edit(...)`-deny-regels
wordt samengevoegd zodra `sandbox.enabled` aanstaat), niet de permissieregels alleen. Dat is een
grotere ingreep — hij raakt élk commando in dit project — en is deze sessie niet gedaan.

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

### F4b-guards (de drie lekken op de v2/v1-grens, en P6 op App.tsx)
- `src/lib/engine2/optimizer/borderFacts.test.ts` — de drie lekken uit de audit (§4), elk door de
  ÉCHTE route: `handleV2Request` met de payload eerst door `structuredClone`, zoals `postMessage`
  hem serialiseert. **Lek 1 (V21):** de opgeloste R_e steekt over met zijn herkomsttekst, en de
  opgeleverde `qes-series-r`-grens draagt beide verbatim; zonder payload zegt de bron letterlijk dat
  er niets aankwam. De notities zijn PER DRIVER geassert — een run die de provenance per RUN meldde
  zou juist het half-opgeloste geval verbergen. **Lek 2 (V22):** een fixture waarin raster en
  geldigheid bewust verschillen (de tweeter-impedantie boven een plafond maal acht), zodat de mediane
  |Z| die de M-C-voorbound meedraagt aantoonbaar verschilt — 45,7 Ω zonder interval tegen 5,8 Ω met.
  De onderkant van de sweep blijft schoon met opzet: daar wonen de directe R_e-aflezing en de
  resonantieclassificatie. **Lek 3 (V23):** de noot verschijnt in het rapportmodel mét
  `dampingMarginDb` en niet zonder, en een assert dat de `TODO(A5e.2)` en de `gapBudgetDb: null`
  er nog steeds staan — F4b mocht het besluit niet nemen en heeft het niet genomen.
  Geen enkele Ω- of Hz-waarde staat in de asserts: alles komt uit de fixture of uit het
  referentiebestand.
- `src/lib/engine2/optimizer/determinism.test.ts` — de dekkingsassert dwong het nieuwe
  vingerafdruk-ingrediënt `facts` af (A5e.4). Een run op de opgeloste feiten en een run op de
  terugval waren tot F4b niet te onderscheiden: zelfde seed, zelfde ontwerp, zelfde vingerafdruk,
  en één van de twee deelde door het verkeerde getal. De herkomst zit ín het ingrediënt naast de
  waarde, want 2,90 Ω van een meter en 2,90 Ω uit een fit zijn dezelfde grens en een andere bewering.
- `src/lib/engine2/p6Lint.test.ts` — **tweede scope, op `src/App.tsx`** (audit §7). Een
  frequentie-literaal op een regel die een kruispunt-pin noemt is verboden tenzij die regel
  `V1_PIN_DEFAULTS_LEGACY` noemt; het blok zelf staat onder snapshot, zodat er niets bij kan komen
  zonder dat de test breekt. Bewust smal — deze namenfamilie, niet "elke frequentie in App.tsx":
  een blanket-regel zou plotgrenzen en weergavelimieten meepakken, en een lint die wolf roept wordt
  weggehaald. Plus een structurele assert dat de v2-route de legacy-namen alleen binnen de
  `!useV2Pins`-tak leest. De lint ving meteen twee plekken die de audit niet noemde: `xoRangeValue`
  (de tweewegroute) droeg dezelfde twee literalen nog eens, en de migratiewaarden 1800/3500 stonden
  nergens in de opsomming.

### F4c-guards (keuze vs. polish op de tuner-instellingen)
- `src/lib/engine2/optimizer/choices.ts` — de indeling als DATA, niet als proza: `CHOICE_KEYS`
  (26 sinds V30, 25 bij F4c), `GREY_KEYS` (5), `POLISH_KEYS` (7). Samen exact de 38 top-level
  sleutels van `NetOptimizeOptions`. De definities staan in de nota (A3j) in algemene bewoordingen; deze
  lijsten zijn de bijlage voor deze tuner, en het casusboek V26 draagt de tabel met per sleutel
  de reden.
- `src/lib/engine2/optimizer/choiceKeyGuard.test.ts` — twee claims, beide als scan. (1) De drie
  lijsten dekken de sleutelverzameling **volledig**, gelezen uit de BRON van `netOptimizer.ts` en
  niet uit een met de hand overgetypte kopie; een sleutel die daar bijkomt valt in geen lijst en
  breekt de build in plaats van stil in de erf-categorie te vallen. (2) Binnen `engine2/` mag geen
  keuze-sleutel uit een `tuneOptions`-spread worden gelezen, en de volgorde in `run.ts` staat vast:
  polish eerst, dan de benoemde keuzes en gewichten, zodat een overgeërfde waarde nooit van een
  gestelde kan winnen.
- `src/lib/engine2/optimizer/f4cRegression.test.ts` + `test-fixtures/f4b2_v2_baseline.json` — de
  acceptatie dat F4c alleen de GRENS heeft verplaatst. **De baseline is een BESTAND**, en dat is
  het hele punt van de vorm: de eerste versie berekende hem ter plekke uit dezelfde build, en dan
  bewegen beide kanten mee — een echte gedragswijziging zou de test groen laten. Een baseline die
  wordt herberekend uit de code die zij moet bewaken, bewaakt niets. Nu leest de test de
  opgeslagen F4b2-netwerken terug, op **twee seeds**, en pint zowel de F4c-vorm als de F4b2-vorm
  aan dat bestand. Met een assert dat de twee seeds aantoonbaar verschillende netwerken opleveren
  (anders is "onveranderd op twee seeds" ook waar voor een zoektocht die zijn seed negeert), en
  met de parameters uit de fixture zelf zodat een baseline op 140 evaluaties nooit tegen een run
  op 200 wordt gelegd. Nagemeten dat hij kán falen: 0,001 dB in het bestand verschuiven zet beide
  seed-asserts op rood. De vingerafdruk beweegt wél, en de test zegt dat dat correct is —
  `choices` is een nieuw ingrediënt.
- `src/lib/engine2/optimizer/workerRouteRegression.test.ts` + `test-fixtures/f4b2_v2_worker_baseline.json`
  — dezelfde acceptatie op de route die de app **wél** neemt: `handleV2Request` → `runThreeWayChain`,
  payload door `structuredClone`. De eerste fixture pint `runV2Optimization`, en dat pad roept
  niemand in de app aan (erratum audit §2.2). Beide vormen staan in het bestand: **inherited**
  (geen v2-hook, zuivere overerving uit de keten) en **stated** (de hook zoals hij nu is);
  poorten en budgetten leeg zodat het énige verschil F4c's herstellen is. Byte-identiek, op geen
  enkele sleutel afwijking. Bijvangst die is vastgelegd: op deze route bereikt de **seed de
  zoektocht niet** (de keten draait één keer; de gejitterde start zit in `run.ts`), dus de dekking
  hangt aan één kandidaat en niet aan twee seeds. Eén live ketenrun per suite (~68 s) — dat is de
  zoektocht zelf, niet het raster of de onderdelenaudit; beide zijn nagemeten. Nagemeten dat hij
  kán falen: 0,001 in het bestand verschuiven zet drie van de vier asserts op rood.
- **De compiler is de derde guard.** `run.ts`'s `tuneOptions` is versmald tot de polish-helft, en
  bij F4c stopten twee bestaande tests meteen met compileren omdat zij `phasePriority` en `staged`
  daardoorheen gaven. Dat is de vangst waarvoor de scheiding bestaat.

### F4d-guards (kandidaatgeneratie in v2)
- `src/lib/engine2/predesign/flankOrder.test.ts` — A5d.3's orde-afleiding op handberekeningen:
  frequenties zó gekozen dat de octaafafstanden hele getallen zijn, zodat "verzwakking gedeeld
  door 6 dB per octaaf per orde" met de hand na te rekenen is. De onthoudings-gevallen wegen
  even zwaar: geen gestelde M-C-grens ⇒ regel (ii) níet gewapend (P4), en niets gewapend ⇒
  **elke bouwbare orde is een eigen kandidaat** — niet orde 1, niet orde 4, en vooral geen
  gemiddelde. Plus: twee flanken die verschillende orden eisen leveren de hoogste op mét de
  melding dat de uitlijningsbibliotheek symmetrisch is (A5d.3(iv) kan niet uitgedrukt worden),
  en 2 — het gemiddelde van 1 en 3 — komt nergens voor.
- `src/lib/engine2/predesign/candidates.test.ts` — de vier regels van de generator, elk als
  claim: spreiding gelijkmatig in OCTAVEN (de hertz-stappen groeien, wat een lineaire spreiding
  met een log-naam zou betrappen), het aantal afgeleid uit venster­breedte ÷
  `WINDOW_SMOOTHING_OCTAVES`, meerdere orden = meerdere KANDIDATEN met unieke labels, en niets
  buiten het venster — ook niet onder een budget, ook niet wanneer de slechtste lobing-zone de
  band in tweeën heeft gesneden. Plus: het venster wordt **per orde** opnieuw afgeleid (k·f_s
  beweegt mee), en het budget dunt posities en **nooit** orden.
- `src/lib/engine2/predesign/casus1Field.test.ts` — **de acceptatie die audit §6.2 vroeg.**
  De pre-start-raming meldt **0 van 9** buiten het venster op de casus-1-fixtures, mét de
  tegenproef dat dezelfde schatter de v1-vensterkruispunten nog steeds als 4-van-4-buiten telt.
  Verder: het veld is **klasse A** — dezelfde negen kandidaten komen uit rapporten die op alle
  drie de bevroren netlists gebouwd zijn — en het vergelijkingsblok rangschikt niets (rijvolgorde
  is de gegeven volgorde, ook omgedraaid).
- `src/lib/engine2/optimizer/candidateRoute.test.ts` — de kandidaat door de ÉCHTE route
  (`handleV2Request` → `runThreeWayChain`, payload door `structuredClone`). Vier claims: de noot
  *"still inherited from the v1 chain"* kan op een payload mét kandidaat niet meer verschijnen;
  de verklaring BEREIKT de tuner (een kandidaat die een andere oordeelband stelt levert
  aantoonbaar een ander netwerk — een kanaal zonder effect rapporteert niets, zie V23); twee
  runs op één seed byte-identiek (beide vers, want uit een cache zou dat een object met zichzelf
  vergelijken); en de seed bereikt de zoektocht níet, wat sinds F4d een **besluit** is, met de
  tegenproef dat een andere KANDIDAAT hem wél bereikt.
- `src/lib/engine2/optimizer/choiceKeyGuard.test.ts` — uitgebreid met de F4d-helft: *stated ∪
  absent ∪ delegated* is **exact** de keuze-sleutelverzameling, met een gat-detectie die is
  nagemeten (een sleutel weghalen wordt gezien, een sleutel dubbel filen ook). Een niet-ingevulde
  ontwerpersinstelling wordt een ABSENT-verklaring met de P4-reden, niet een ontbrekende sleutel.
- `src/lib/engine2/predesign/floorComparison.test.ts` — audit §6.3 als test: beide vloeren met
  hun herkomst in één zin, wélke de kandidaten stuurde, en geen enkel veld dat een winnaar
  aanwijst. Plus de waarschuwing die alleen verschijnt wanneer de tegen-vloer werkelijk een deel
  van dít veld zou weigeren.
- `src/lib/engine2/optimizer/noWeights.test.ts` — de scope is uitgebreid naar `predesign/
  candidates.ts`, `flankOrder.ts` en `candidateField.ts`. Kiezen wélke kandidaten bestaan is
  dezelfde beslissing als kiezen tussen hun uitkomsten, één stap eerder.

### Vloersessie-guards (gestelde versterkervloer, V29/V30)
- `src/lib/engine2/frozenNetlistGates.test.ts` — sinds casus 1 een versterkervloer STELT
  (`manifest_en_geometrie.gestelde_eisen`) is `M-B/|Z|` op deze casus gewapend en is dit
  bestand falsifieerbaar geworden. De vloer wordt uit het referentiebestand GELEZEN, nooit
  hier geschreven: het is een projectgetal met één huis (P6). De dragende assert is
  **"élke bevroren netlist haalt de vloer, óf staat met naam en reden in
  `v2_herkomst.vloeruitzonderingen`"** — een lijst die boekhouding is en geen vrijstelling,
  en die hoort leeg te raken. Nagemeten dat hij kán falen: één naam weghalen terwijl de
  netlist de vloer nog steeds mist, zet hem op rood met de sleutel in de melding. Plus de
  tegenproef dat de drie v1-baselines de vloer wél halen en niet alleen binnen de
  meettolerantie — zonder die assert is "iedereen staat op de lijst" niet te onderscheiden
  van een vloer die niets kan halen.
- `src/lib/engine2/goldenClassification.test.ts` — de KAND_V2-paden worden nu AFGELEID uit
  `manifest_en_geometrie.netlists` in plaats van uitgeschreven. De uitgeschreven lijst zei
  één tot en met negen; het V28-veld leverde er tien, en `KAND_V2_10` heeft een hele
  oplevering lang zonder klassecontrole in het bestand gestaan — de volledigheidstest bewaakt
  alleen TOP-LEVEL sleutels en deze zit onder `kandidaten`. De bron is bewust een ánder blok
  dan het gecontroleerde, en het aantal wordt tegen de manifestlijst geassert, zodat een lege
  of gekrompen verzameling faalt in plaats van stil te slagen.

### F4d-nazorg-guards (V28-opschorting, poorten op de bevroren netlists)
- `src/lib/engine2/predesign/candidates.test.ts` — het blok dat tot de nazorg *"de slechtste
  lobing-zone is CUT OUT"* asserteerde, asserteert nu de **opschorting** (V28) en haar
  zichtbaarheid: de band is heel, de zone reist mee met bron en met `applied: false`, en er
  landt aantoonbaar een positie in het oude gat. Die tegenproef draagt het hele blok — met de
  uitsnijding weg zijn "de band is heel" en "de band is gesneden" alleen te onderscheiden als
  er werkelijk iets in het gat staat. Plus: geen c-t-c gesteld ⇒ géén zone ⇒ géén melding,
  want een afwezige zone is geen lege uitspraak.
- `src/lib/engine2/predesign/casus1Field.test.ts` — de casus-1-helft: drie posities op W-M en
  **vijf** op M-T (0,82 octaaf venster in plaats van 0,33 octaaf aanbevolen band), 15 in plaats
  van 9 kandidaten, en de raming die **0 van 15 buiten het VENSTER** meldt maar niet meer nul
  buiten de AANBEVELING. Dat laatste is bewust vastgelegd als gewenst gedrag: een opschorting
  die ook de raming stil zou zetten, laat nergens zien dat veld en aanbeveling uit elkaar zijn
  gelopen.
- `src/lib/engine2/frozenNetlistGates.test.ts` — **de poorten op élke bevroren netlist in
  `manifest_en_geometrie.netlists`**, dus ook de vijftien KAND-V2's; de lijst wordt uit het
  referentiebestand gelezen zodat een nieuwe netlist meedoet door daar te bestaan. Twee helften,
  en het bestand zegt zelf waarom er twee nodig zijn: casus 1 stelt géén enkele grens, dus
  "een bevroren netlist die een poort niet haalt" is op deze casus onfalsifieerbaar (P4 —
  afwezig is geen poort die altijd slaagt). De staande helft assert daarom dat elke poort een
  WAARDE oplevert en zich als `absent` meldt; de tweede helft bewapent elke poort met een
  **gemeten waarde uit het veld zelf** (de ongunstigste lezing) en toont dat het uiterste aan
  de andere kant faalt. Geen enkel drempelgetal in het bestand.
- `src/lib/engine2/casus1V2Candidates.test.ts` — uitgebreid met de meetopstelling als assert
  (controle 2): `synthMode`, de gewapende poorten en budgetten mét hun P4-reden, en de
  beschermingen die V27's eerste opstelling wegliet (`safety`, `staged`, `audit`,
  `rSourceDisqualifyOhm`). De veldgrootte wordt niet meer geteld maar **vergeleken** —
  manifest, bestanden op schijf en de boekhouding van de generator moeten het eens zijn,
  zodat een legitieme regeneratie geen testwijziging vraagt.

### V30-guards (de gestelde vloer als zoekdoel)
- `src/lib/engine2/optimizer/floorAsGoal.test.ts` — de vier claims van V30 op de
  tweeweg-fixture. Sleutel **afwezig** en sleutel **`false`** leveren byte-identieke
  netwerken (P2: een mechanisme dat er alleen maar ís mag niets kosten); **gewapend
  zónder gestelde vloer is inert** (P4 — een barrière zonder vloer heeft geen afstand om
  tekort van te zijn); en **gewapend mét vloer levert aantoonbaar een ánder netwerk**,
  want zonder die tegenproef zijn de eerste twee even waar voor een optie die nergens op
  aangesloten is (V23). De vloer wordt uit de gelevérde min |Z| van de fixture afgeleid en
  nooit ingetypt. Plus een bronscan die de vierde claim hard maakt: de corridor-annulering
  en het overslaan van de blok-coördinaatverfijning hangen aan `zFloorRepairPass` en niet
  aan `zFloorBarrier` — tot V30 waren die twee dezelfde bit, en "de vloer is een zoekdoel"
  zou anders stilzwijgend óók "de corridor telt niet meer en de diepe polish vervalt"
  hebben betekend.
- `src/lib/engine2/optimizer/choiceKeyGuard.test.ts` — twee V30-blokken erbij: een gestelde
  vloer wapent de barrière, géén vloer laat hem ABSENT (nooit `false` — dat zou zeggen dat
  iemand besloot dat de vloer niet mag sturen), een expliciete waarde wint van de afleiding
  zodat de vóór/ná-meting een run is die je kunt vrágen; en de **grijze waarde**
  (`AMP_FLOOR_BARRIER_WEIGHT`, overgenomen uit v1) staat mét haar herkomst in de
  vingerafdruk, alleen wanneer de keuze die haar leest ook echt gesteld is.
- `src/lib/noAppWideFloor.test.ts` — ongewijzigd, en hij heeft gewerkt: de eerste naam voor
  de barrièreconstante droeg de stam van de verwijderde app-brede vloer, en daarna ving hij
  het commentaar dat die vangst uitlegde. Vandaar `AMP_FLOOR_BARRIER_WEIGHT`.

### F4b2-guard (het vierde gat: de LF-bult-inversie)
- `src/lib/engine2/optimizer/lfBumpBorder.test.ts` — de vierde A5d.6-inversie, die op de
  workerroute nooit invoer had (V23-bijvangst, dood sinds F2). Vijf asserts op de inversie zelf:
  rapport-invoer en payload-invoer leveren een byte-identieke grens; die grens IS de klasse-A-
  referentie `maxL_bij_Rs0_5_budget2_5dB_mH` binnen haar tolerantieklasse (assert op de METRIEK,
  niet op de millihenry); en **het ketenraster levert aantoonbaar 1 048 576 mH op** — de meting
  die bepaalde dat de impedantiesweep moest oversteken, in de suite en niet alleen in het
  casusboek. Drie asserts door de échte route met `structuredClone`: met beide krommen wordt de
  grens bereikt, zonder niet, en met alléén het nabije veld nog steeds niet.
  `pathROhm` verschilt tussen de routes met opzet (het rapport heeft geen netwerk), dus de
  vergelijking voedt beide kanten het parameterblok van de referentie in plaats van wat elke
  route zelf produceert.
- `src/lib/engine2/optimizer/determinism.test.ts` — het `facts`-ingrediënt is bij F4b2 gegroeid
  van twee feiten naar vijf (R_e, A5b.1-geldigheid, resonantie, nabij veld, sweep) zónder van
  naam te veranderen, en de dekkingsassert kijkt naar NAMEN. Er staat daarom een tweede assert
  naast: elk van de vijf moet de sleutel apart doen bewegen, met een telling erbij zodat een
  zesde feit niet ongetest kan meeliften.

### V20-guards (lobing bij een weg met N bronnen)
- `src/lib/engine2/metrics/lobing.ts` — **de vier λ-fracties, en geen keuze ertussen.** Voor lobing
  tussen twee wegen bestaat geen enkele afstand die een weg met N bronnen samenvat, dus de metriek
  rapporteert er vier (dichtstbij / amplitudegewogen zwaartepunt / verste — alle drie *tussen* de
  wegen — plus de grootste scheiding *binnen* een weg) en rangschikt er geen. De niet-monotone
  zonescore van F1 is vervallen: hij scoorde precies de ene λ die niet te kiezen is. **Blijvend
  verbod:** geen poort, geen budget, geen shortlist-criterium op een fractie. De autoriteit is de
  verticale synthese (`verticalLobing`), en die is bij V20 niet aangeraakt.
- `src/lib/engine2/metrics/lobingLambda.test.ts` — de handberekening op een kruispunt waar λ = 1000 mm
  (zodat elke afstand in mm zich rechtstreeks als fractie laat lezen), de N-agnostische proef op vijf
  bronnen, en de **nieuwe-meting-test die de vondst draagt**: één woofer 100 mm omlaag verschuift
  `nearest` met 0, `centroid` met 50 en `farthest` met 100 mm — drie verschillende bewegingen die één
  λ alle drie op één had teruggebracht. Met de tegenproef ernaast (de héle weg verschuiven beweegt de
  drie gelijk en laat binnen-de-weg staan), want zonder die tegenproef bewijst het patroon niets.
  Plus: de zin over de synthese wordt door de BRONTELLING opgewekt en niet door een wegnaam — de
  test collabeert de array en eist dat de zin verdwijnt.
- `src/lib/engine2/goldenCasus1.test.ts` — de vier fracties per kruispunt per netlist als klasse-B-
  referenties, met een assert dat de drie tussen-de-wegen-fracties op het wooferpaar **geordend en
  ongelijk** zijn (0,274 / 0,419 / 0,563 λ op HUIDIG). De hernoemde `lobing_wm_binnen_weg_lambda`
  draagt de waarde van de oude `lobing_wm_lambda` ongewijzigd — de fout zat in de naam, niet in het
  getal, en een rename die de waarde verschuift zou dat verhullen.
- `src/lib/engine2/goldenClassification.test.ts` — de V15-parameters volgen mee: alle vier de
  afstanden staan in `kandidaten._M_F_interim_parameters` en worden tegen de engine gehouden. Plus de
  **kruiscontrole**: de dichtstbijzijnde-afstand die uit de z-offsets volgt (261,3 mm) ís de
  paarafstand die het casusboek los noteert (261). Bound op de afronding van het casusboek (0,5 mm)
  en niet op een tolerantieklasse — een procentband zou hier afstanden doorlaten die echt verschillen.

### F4a-guard (waar een referentie een functie van is)
- `src/lib/engine2/goldenClassification.test.ts` — de classificatie als test. Elke referentie in
  `golden_refs_casus1.json` draagt sinds F4a een `klasse` (A/B/C) en een `afhankelijkheid`
  (`meting`, `meting+netlist`, `meting+zoektocht`), en de test faalt op een blok zonder klasse,
  op een klasse die niet bij haar afhankelijkheid past, op een klasse C buiten `v1_baseline`, en
  op een bronbestand dat een `v1_baseline`-waarde leest. Waarom het bestaat: v2 begrenst vandaag
  alleen waarden en de kandidaten komen uit de v1-zoektocht — een referentie die een eigenschap
  van die zoektocht vastlegt gaat rood zodra v2 eigen kandidaten genereert. Casus 1 heeft er
  geen (de drie kandidaten zijn BESTANDEN, geen runuitkomsten), en dat is bij F4a nagemeten
  in plaats van aangenomen: dezelfde referentie op alle drie de netlists reproduceren scheidt
  klasse A van klasse B. De tweede helft van de test doet het werk dat blijft kosten — de negen
  parameterblokken die F4a heeft toegevoegd worden vergeleken met wat de engine werkelijk
  gebruikte (scanraster, trendbreedte, fitband, c-t-c, R_e), want een parameterblok dat nergens
  tegen de engine wordt gehouden is decoratie, en decoratie is waar V15 over ging.
  Zie casusboek V19 en `.claude/skills/casus-toevoegen/SKILL.md`.

### De casus-1-fixtures die een SCRIPT opwekt (F4d)
`test-fixtures/casus1/KAND-V2-*.adsfilter.json` zijn de negen v2-kandidaten, bevroren als bestanden
op precies dezelfde voet als de drie v1-kandidaten — want F4a stelde vast dat casus 1 géén klasse-C-
referenties heeft, en "laat de suite de scan draaien en assert op wat eruit komt" zou de eerste maken.
Twee scripts, twee kosten:
- `npx vite-node scripts/generate-casus1-v2-candidates.ts` — negen ketenruns, gemeten 45–72 s per
  kandidaat, ~10 min totaal. Schrijft de netlists en `test-fixtures/casus1_v2_herkomst.json`.
- `npx vite-node scripts/record-casus1-v2-references.ts` — leest die bestanden en schrijft de
  klasse-B-blokken in de golden refs. Drie seconden, dus vrij om opnieuw te draaien.
De acceptatie zit in `casus1V2Candidates.test.ts`: de metrieken reproduceren op alle bevroren bestanden,
en **één** kandidaat wordt live door de échte route heen gereproduceerd (~41 s).

**Sinds V30 zijn het er TWEE corpora, en dat is opzet.** `KAND_V2_1..10` is het levende corpus, opgewekt
met de gestelde vloer als ZOEKDOEL. `V28_KAND_1..10` is het gedateerde corpus dat het verving —
byte-identieke bestanden onder een andere naam, met hun klasse-B-blokken mee, bewaard als de
"vóór"-helft van de V30-vergelijking. Wie een script schrijft dat het levende corpus opruimt gebruikt
`^KAND_V2_\d+$` en nooit `startsWith('KAND_V2')`: die tweede slikt het gedateerde corpus mee en gooit
het bewijsmateriaal weg. `record-casus1-v2-references.ts` en `goldenClassification.test.ts` dragen die
regel allebei expliciet.

De vloer is sinds F0 uitsluitend het getal dat de ONTWERPER invult (`ampMinLoadOhm`, geen default):
leeg veld = geen oordeel. Eén regel, één plek: `meetsAmpFloor` in `src/lib/impedanceFloor.ts`.
Wie een vloer nodig heeft roept die aan en verzint geen eigen drempel.
