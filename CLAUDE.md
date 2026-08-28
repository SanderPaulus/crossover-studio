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

- `npx tsc -b` — typecheck. Draait vóór elke oplevering, zonder uitzondering. **Sinds V37 dekt hij ook
  `scripts/`** (`tsconfig.scripts.json`, het vierde project). Dat was er niet, en het kostte bij V36 een
  kolom vol `null` in het referentiebestand; bij het aanzetten kwamen er meteen 67 fouten uit in twee
  scripts, allemaal van twee soorten. (1) `let out: T | null = null` dat bínnen een callback wordt
  toegewezen: TypeScript versmalt zo'n variabele bij haar declaratie tot `null` en verbreedt haar nooit
  voor een toewijzing in een closure, dus na de `if (!out) throw` is zij `never` en was élke aflezing
  eruit ongezien fout. Verzamel in een ARRAY, dat kan de compiler wel volgen. (2) `tuned` naar `boolean`
  gecast terwijl het een TELLING is. Wie een script schrijft dat referentiegetallen wegschrijft, kijkt
  het geschreven blok nog steeds na — maar de typefout komt nu vooraf.
- `npx vitest run` — volledige testsuite. **Gemeten 28-08-2026 (V37-sessie): 126 bestanden, 1376 tests, ~5,5 min
  wandkloktijd (321 s).** Alles groen houden. De telling stond tot F4b op 99/1003 — dat was de
  stand bij F3 (`61a3ea4`) en zij is drie opleveringen lang niet bijgewerkt: F3b bracht 104 bestanden, F3c 106,
  F4a 107, F4b 108, F4b2 109, F4c 112, V20 113, F4d 119, de F4d-nazorg 120, de vloersessie 120, V30 121,
  V31/V32 123, V33 124 (`barrierSource.test.ts`), V34 125 (`probeSource.test.ts`),
  V36 126 (`dissipationTerm.test.ts`). **V37 voegde géén bestand toe** — zijn claims staan in
  `dissipationTerm.test.ts`, `frozenNetlistGates.test.ts`, `choiceKeyGuard.test.ts` en
  `casus1V2Candidates.test.ts`, naast de claims die zij al droegen; de telling gaat van 1369
  naar 1376 tests op hetzelfde aantal bestanden.
  Vandaar de datum erbij: een telling zonder meetmoment is een telling die stil veroudert.
  **Waar de tijd zit (nagemeten bij V37, volle parallelle run):** zeven bestanden draaien echte ketenruns en zijn
  samen het leeuwendeel van de CPU-tijd — `casus1V2Candidates` (317 s: twee live runs, de bevroren netlist én
  de verwerping), `threeWayChain` (294 s), `candidateRoute` (124 s), `designChain` (107 s),
  `workerRouteRegression` (96 s), `frozenNetlistGates` (80 s), `f4cRegression` (76 s).
  `casus1V2Candidates` is bij V33 van 105 s naar 300 s gegaan en dat is de prijs van de barrièrebron: elke live
  casus-1-run lost het netwerk nu ook op het veiligheidsraster op. Op de dure bron (`'sweep'`) zou datzelfde
  bestand ruim twintig minuten kosten — dat is waarom de v2-route `'safety'` stelt. `probeSource` (40 s) draait
  dertien korte tuner-runs op de tweewegfixture en géén ketenrun: V34's probe scant een raster en lost niets
  extra's op, dus hij kost in de suite niets meetbaars. `dissipationTerm` (9 s) draait vier korte tuner-runs op
  dezelfde fixture, om dezelfde reden. `frozenNetlistGates` is bij V36 van 62 naar 69 s gegaan zonder een enkel
  extra rapport: `FIELD` bouwde al één rapport per netlist en houdt er sinds V36 ook M-A uit vast. Bij V37 staat
  hij op 80 s, en die elf seconden zijn één ding: het V37-blok bouwt een TWEEDE `HUIDIG`-rapport, mét de
  ingevoerde DC-weerstand, omdat dát het rapport is waaruit de RUN zijn R_e oplost — en de assert die het waard
  is, is juist dat de hiërarchie zónder dat veld een ánder getal geeft. Elk van deze
  bestanden draait het minimum aantal live runs dat zijn claim draagt; de rest leest bestanden. Een regressie die niemand draait omdat hij traag is,
  beschermt niets.
- **De v2-kandidaatfixtures opnieuw opwekken** (alleen nodig als de generator of het veld verandert):
  `npx vite-node scripts/generate-casus1-v2-candidates.ts` — vijftien ketenruns. De kosten hangen sinds
  V33 aan de BARRIÈREBRON die de kandidaat stelt, en alle drie zijn gemeten over het hele veld:
  `'grid'` ~14 min (45–66 s per kandidaat), **`'safety'` 44,6 min (113–237 s) — dit is wat de
  v2-route stelt en dus wat je krijgt**, `'sweep'` 4 u 23 min (603–2740 s). De barrière lost het
  netwerk bij élke objectief-evaluatie op op het raster van zijn bron, en dat kost 0,507 ms op
  96 punten, 1,257 ms op 240 en 8,886 ms op 1600; een ketenrun doet er ~88 000.
  **Nagemeten bij V34: 41 min (115–224 s per kandidaat)** — de bronweerstandsprobe van V34 leest
  ook op het veiligheidsraster maar SCANT er alleen (één rasterdoorloop tot 400 Hz plus één
  één-frequentie-oplossing), dus hij kost niets meetbaars. **Nagemeten bij V37: 40 min
  (115–223 s per kandidaat)** — V37 verandert een DELING en geen raster, dus de prijs is
  onveranderd. Schrijft de
  shortlist-netlists en `casus1_v2_herkomst.json`. **Bevries het levende corpus ERVÓÓR** met
  `scripts/freeze-live-corpus.ts` als je de vóór/ná wilt kunnen reproduceren. Daarna
  `npx vite-node scripts/record-casus1-v2-references.ts` (drie seconden) voor de klasse-B-blokken én
  de vergelijkingstabel voor het casusboek. **Nagemeten bij de nazorg: twee opeenvolgende runs leveren de
  netlists byte-identiek terug, op het `savedAt`-stempel van de serialisatie na.**
- **De vóór/ná-tabel tussen twee corpora**: `npx vite-node scripts/compare-corpora.ts [vóór] [ná]` —
  seconden, geen ketenrun. Corpora: `v30`, `v32`, `v33sweep`, `v33`, `v34`, `live`; default `v34 live`,
  wat de V37-tabel is. `compare-corpora.ts v30 v32` reproduceert de V32-tabel, `v32 v33` de V33-tabel,
  `v33 v34` de V34-tabel.
  Gekoppeld op KANDIDAAT (de bestandsnummers
  zijn rijnummers van verschillende shortlists en horen niet bij elkaar), beide helften gemeten door
  hetzelfde `buildReport`-pad. **Sinds V36 draagt hij twee kolommen erbij** — dissipatiefractie en
  de watt in de grootste enkele weerstand, per kandidaat en als corpusgemiddelde. Een kolom, geen
  oordeel: casus 1 stelt geen dissipatiegrens (P4). Drukt voor het LEVENDE corpus ook de verwerpingen af met wat de
  geweigerde tune had bereikt. Draai hem ná de generator en ná de recorder.
  **Hij heette tot V33 `compare-v30-v32-corpus.ts` en had zijn "ná"-helft hard op het levende corpus
  staan** — dus de eerste regeneratie erna maakte stilletjes een ándere tabel dan de tabel waarvoor hij
  geschreven was. Beide helften zijn nu een argument; dat is de hele reden voor de hernoeming.
- **Het levende corpus bevriezen VÓÓR een regeneratie**:
  `npx vite-node scripts/freeze-live-corpus.ts <id> <BESTANDSPREFIX> "<reden>"` — seconden.
  Kopieert (nooit: verplaatst) de `KAND-V2-*`-bestanden onder een gedateerde naam, zet hun
  manifestregels erbij, **neemt hun klasse-B-blokken mee**, en schrijft
  `manifest_en_geometrie.<id>_corpus` met de koppeling bestandsnaam ↔ kandidaat. Weigert een
  corpusnaam die al bestaat. Bij V34 geschreven omdat dit vier keer met de hand is gedaan (V28,
  V30, V32, V33-sweep) en het vijf losse bewerkingen zijn die allemaal moeten landen: mist de
  derde, dan faalt `goldenClassification.test.ts`; mist de vierde, dan overleeft de koppeling
  alleen in `casus1_v2_herkomst.json` en overschrijft de eerstvolgende regeneratie hem. **Eén ding
  blijft met de hand:** de `DATED_REASON`-regel in `record-casus1-v2-references.ts` — waaróm een
  corpus bewaard is valt niet af te leiden, en de recorder zegt het hardop als hij ontbreekt.
  **Sinds V37 herschrijft hij ook de `klasse_toelichting` van het meegenomen blok.** Die noemde de
  LEVENDE sleutel, dus in een gedateerd blok wees zij naar de netlist die de eerstvolgende
  regeneratie overschrijft — het verkeerde bestand, onder een naam die zegt dat het het goede is.
  `V33_KAND_*` en `V34_KAND_*` droegen die zin en zijn bijgewerkt; de met de hand bevroren corpora
  (V28, V30, V32, V33-sweep) hadden hem niet.
- **Waar de bronweerstandsprobe landt (V34)**: `npx vite-node scripts/measure-v34-probe.ts` —
  seconden, geen ketenrun. Drukt per raster (keten / veiligheid / poort) af waar de probe per
  driver landt en of elke randregel hem accepteert, en daarna de bronweerstand van élke bevroren
  netlist op alle drie plus zijn DC-limiet. Dit is het bewijsmateriaal onder casusboek V34;
  `frozenNetlistGates.test.ts` assert de claims, dit script laat de getallen zien.
- **Wat de dissipatieterm bijdraagt (V36/V37)**: `npx vite-node scripts/measure-v36-dissipation.ts` —
  seconden, geen ketenrun. Drukt per bevroren netlist beide armen van de bronweerstandsprobe af
  (ketenraster met de historische randregel = de v2-route tot V34; veiligheidsraster met de
  strikte regel = waar de TELLER sinds V34 gelezen wordt), met R_source, de noemer, de verhouding
  en de termwaarde die eruit volgt — naast de objectiefwaarde waarin die term wordt opgeteld, en
  naast M-A (dissipatiefractie en de watt in de grootste enkele weerstand). **De laatste tabel is
  sinds V37 de vóór/ná van de NOEMER**: `term nu` is wat een v1-run leest (`Re(Z)` bij de probe,
  de default), `term op R_e` is wat de v2-route optelt, en de kolom `M-E` is de controle — want
  `1 + R_source/R_e` hoort per definitie de `Qes_mult`-referentie te zijn. Dit is het
  bewijsmateriaal onder casusboek V36 en V37; `frozenNetlistGates.test.ts` en
  `dissipationTerm.test.ts` asserteren de claims.
- **Het gat naar HUIDIG ontleed (V38)** — vier scripts en één gedeelde meetbank, en de bank
  is het punt: `scripts/v38-bench.ts` stelt de tuner-opties, de gemeten vector en de
  netlist-loader één keer vast, zodat de wattenval van de ablatie en de rest van de
  transplantatie in dezelfde eenheden staan. Twee scripts die elk hun eigen opties samenstellen
  leveren twee tabellen die niet mogen worden afgetrokken, en de aftrekking IS de vraag.
  `scripts/v38-groups.ts` ontleedt een partslijst in componentgroepen (pool / val / gedempte val /
  Zobel / shunt-shelf / niveauwerk) uit de netlist-graaf, meet wat elke groep in zijn eigen tak
  doet door het netwerk twee keer op te lossen, en ableert een groep zoals de snoeipas van de
  tuner dat doet — serie `shorted`, shunt `open`, nooit uit de lijst gooien.
  - `npx vite-node scripts/measure-v38-topology.ts` — seconden. De diff-tabel: de gemeten
    aanleidingen per driver uit de opnamepas, HUIDIG ontleed, dezelfde ontleding over het levende
    corpus, en per niet-kern-groep de dichtstbijzijnde gemeten aanleiding met de octaafafstand
    erbij. Een groep waarvan de aanleiding een halve octaaf verderop ligt KRIJGT dat als antwoord.
  - `npx vite-node scripts/measure-v38-corrections.ts` — minuten, geen tune. Ontwerp- en
    synthesestap voor élke kandidaat onder beide correctiebeleiden. Meet de lean-drempel.
  - `npx vite-node scripts/measure-v38-ablation.ts` — negen waardetunes, ~13 min per stuk,
    ruim twee uur. Vier controle-armen (geen kooi / A5d.3-venster / HUIDIG's eigen overname ±2 % /
    dezelfde maar met `errorSmoothOct: 0`) en dan de cumulatieve ablatie. Schrijft
    `test-fixtures/casus1_v38_ablatie.json`, mét de geleverde netlist per arm, zodat een latere
    kolom nooit een tweede tune kost.
  - `npx vite-node scripts/measure-v38-transplant.ts` — vier waardetunes. HUIDIG's topologie met
    waarden uit een warm en drie koude zaden.
  - `V38_EQ=<n> npx vite-node scripts/measure-v38-corrections-tuned.ts` — vier waardetunes per
    EQ-budget. Draai hem met `V38_EQ=0` (wat de v2-route stelt) en `V38_EQ=2` (wat de app stelt).
  `V38_LIMIT=n` doet er n als rookproef; dat is geen meting. **De bank is niet de v2-route**, en
  dat verschil is gemeten in plaats van geschat: hij draait zonder `staged` (die snoeit en
  escaleert ONDERDELEN, wat elke ablatie zinloos maakt) en zonder `branchTargets` (die komt uit
  de ontwerpstap, die hier niet draait). **De topologie ligt daarmee nog niet vast**: de
  onderdelenaudit blijft gewapend en verwijdert componenten — op twee van de vier
  transplantatie-armen een vierde-orde-pool uit de tweetertak. Daarom schrijft elk script de
  geleverde netlist mee: wat de audit weghaalde is dan per arm na te meten in plaats van
  onzichtbaar in een Δ te zitten. Op de kandidaat waar beide gemeten zijn levert de bank
  3,22 dB waar de volle route 1,76 dB levert. Arm-tegen-arm is dus de meting; het absolute
  niveau is dat van de bank en niet van het corpus.
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

### V31/V32-guards (de verwerping, en waar een elektrische poort meet)
- `src/lib/engine2/optimizer/impedanceReference.ts` — **één regel voor twee lezers.** De
  band waarop élke elektrische grootheid gemeten wordt (M-A, M-B/EPDR, M-B/|Z|, M-C, plus
  de hoogdoorlaatbeschermings-afleiding) komt hier vandaan, en zowel `report.ts` als de
  poortreferentie roept hem aan. Tot V32 bouwde het rapport dit raster zelf en oordeelde de
  worker op het KETENRASTER — twee oordelen over één eis, en het strengste werd niet
  afgedrukt. De uitgestrektheid is de UNIE van de driversweeps (de doorsnede is op casus 1
  200 Hz en dat is de blindheid zelf, van de andere kant benaderd); elke tak die buiten zijn
  eigen sweep gelezen wordt staat in `heldFlat` én in `notes`.
- `src/lib/engine2/optimizer/gateGrid.test.ts` — de vier claims van V32 op een synthetische
  tweeweg met een gebouwde dip ONDER de responsbodem. De vierde draagt de andere drie: de
  dip moet het OORDEEL verplaatsen, want anders zijn "hij meet op de sweep" en "hij meet nog
  steeds op het raster maar rapporteert een andere band" niet te onderscheiden (V23). Plus:
  geen sweep ⇒ geen waarde, geen terugval, en de reden noemt de ontbrekende invoer; één
  ontbrekende tak is even diskwalificerend als geen enkele, want een systeemimpedantie is
  geen grootheid per driver.
- `src/lib/engine2/frozenNetlistGates.test.ts` — **de tegenspraak zelf, op élke bevroren
  netlist.** Poortoordeel (`freezeGateReference` + `evaluateGates`, precies zoals de worker
  hem bouwt) tegen bestandsmeting (`buildReport`): dezelfde min |Z|, hetzelfde verdict,
  dezelfde `judged_on`-zin. Geen ketenrun — wat de zoektocht bindt is de evaluator, niet de
  veertig seconden tunen ertussen. Met de premisse eronder geassert (het ketenraster begint
  écht boven de sweepbodem), zodat "ze zijn het eens" niet waar kan zijn omdat ze hetzelfde
  raster kregen. En **de ene zachte plek van V32 is gemeten in plaats van beredeneerd**: de
  tweetersweep begint op 200 Hz en wordt daaronder vlak gehouden, dus élk oordeel op 82 Hz
  rust deels op extrapolatie. De test vermenigvuldigt dat geëxtrapoleerde gebied met tien en
  met een tiende — een factor honderd — en eist dat het systeemminimum niet beweegt. Doet het
  dat ooit wel, dan is het antwoord een tweetersweep die lager reikt, geen ruimere test.
- `src/lib/engine2/optimizer/wholesaleRejection.test.ts` — V31 op de shortlist: een kandidaat
  wiens tune in zijn geheel geweigerd is, wordt geen rij ook al draagt hij de beste RMS van
  het veld; hij verschijnt als VERWERPING met de regel die hem weigerde; wat gepubliceerd
  wordt bevat geen enkel onderdeel van het zaad; de **relaxatieladder raakt hem niet**
  (veiligheid is een bescherming, geen smaak — A5e.1); en met niets haalbaars biedt de
  diagnose het zaad niet aan als beste bijna-misser. Plus P2: een veld zonder verwerpingen
  levert byte-identieke rijen, dus het mechanisme kost niets.
- `src/lib/engine2/casus1V2Candidates.test.ts` — de dure helft van V31: de casus-1-kandidaat
  die de veiligheidspoort werkelijk laat vuren, live door `handleV2Request`. Hij serialiseert
  het HELE resultaat en zoekt naar een onderdelenlijst in plaats van het veld te controleren
  waar er één hoort te staan — en dat was nodig: de eerste run vond het zaad terug in
  `net.parts`, de TWEEDE kopie van dezelfde lijst. Plus **de wezenloze-bestanden-wacht**: elk
  `KAND-V2-*`-bestand op schijf moet door het manifest genoemd worden. Dat gat ging bij V32
  echt open — het veld kromp van tien naar zeven, de recorder snoeide de manifestregels, en
  drie BESTANDEN bleven staan onder een naam die zegt dat ze levend zijn. Niets faalde.
- `src/lib/engine2/optimizer/choiceKeyGuard.test.ts` — `rejectedTuneReport` staat in
  POLISH en mag nooit naar CHOICE migreren: het verandert geen enkel besluit, het maakt
  alleen leesbaar wat een poort weggooide. De sleuteltelling ging van 38 naar 39.
- `src/lib/engine2/optimizer/f4cRegression.test.ts` — **gesplitst bij V32, en de sterkere
  helft is heel gebleven.** `runs` in `f4b2_v2_baseline.json` pint nog steeds het
  NETWERK — byte-identiek aan F4b2, op twee seeds, nagemeten. `verdicts_sinds_V32` pint
  ernaast de poortoordelen, die wél bewogen omdat V32 verplaatste wáár zij meten. Het hele
  bestand hergenereren zou de claim "F4c en V32 veranderden geen netwerk" hebben weggegooid
  om een rapportwijziging te accommoderen. Plus een assert dat de oordelen op de gemeten
  sweep vallen en niet op het fixture-raster — zonder die assert blijft het blok
  reproduceren ook als de referentie stilletjes terugvalt.
- `src/lib/engine2/optimizer/borderFacts.test.ts` — V22's lek-2-claim staat, op de bron die
  hem altijd al toekwam: de doorlaatband-impedantiemediaan wordt sinds V32 van de gemeten
  SWEEP gelezen (zoals `report.ts` al deed) en niet van het ketenraster. Het interval knipt
  nog steeds wat er GELEZEN wordt; alleen de meting waarvan het een mediaan is, is veranderd.

### V33-guards (waar de barrière mikt; een geweigerde tune is een verwerping)
- `src/lib/impedanceFloor.ts` — `minImpedanceAt` is sinds V33 de ÉNIGE plek waar wordt beslist
  wat "de kortste impedantie" is (eerste index wint, strikte `<`, geen epsilon). `epdr()` leest
  hem — dus de M-B/|Z|-poortwaarde — en de amp-vloerbarrière leest hem via
  `systemMinImpedanceOhm` in `netOptimizer.ts`. Eén functie, drie rasters: het RASTER is een
  parameter (`zFloorBarrierSource`: `'grid'` = default en v1, `'safety'` = de v2-route,
  `'sweep'` = het poortraster zelf). `ampFloorSlackOhm` staat er sinds V33 naast, om dezelfde
  reden: de tuner rekende de vloerspeling zelf uit en een test vraagt hem nu óók op.
- `src/lib/engine2/optimizer/barrierSource.test.ts` — de vijf claims op de tweeweg-fixture.
  Sleutel **afwezig** en `'grid'` leveren byte-identieke netwerken (P2); een bron die genoemd is
  maar zijn data niet krijgt levert aantoonbaar NIET het netwerk dat `'grid'` levert — want dat
  is precies hoe een stille terugval eruitziet en niets anders; en `'safety'` én `'sweep'`
  bereiken allebei de zoektocht. De vloer is 5 % boven het geleverde minimum, en dat getal is
  zelf een vondst: op 50 % weigert de volle-band veiligheidspoort de hele tune en komt in élke
  arm het zaad terug, wat elke vergelijking leegmaakt.
- `src/lib/engine2/frozenNetlistGates.test.ts` — drie V33-blokken. (1) Op het POORTRASTER is de
  barrièregrootheid `toBe`-gelijk aan de M-B/|Z|-waarde, geen tolerantie — twee implementaties
  die tot drie decimalen overeenkomen is precies de toestand die V32 aantrof. (2) Diezelfde
  netlist op het KETENRASTER wijkt aantoonbaar af, anders is "hij leest het poortraster" niet te
  onderscheiden van "hij leest willekeurig welk raster". (3) **De rechtvaardiging van
  `'safety'`, als meting:** het veiligheidsraster ligt BINNEN de uitgestrektheid van het
  poortraster, het verschil tussen beide lezingen is op het levende corpus kleiner dan
  `ampFloorSlackOhm` (gemeten 0,0075 Ω tegen een speling van 0,0520 Ω), en — de assert die er
  werkelijk toe doet — op élke bevroren netlist vellen de twee rasters hetzelfde oordeel over de
  gestelde vloer. De grootste afwijking reist mee in de faalboodschap.
- `src/lib/engine2/optimizer/wholesaleRejection.test.ts` — de tweede helft, op de tuner zelf. Een
  poorthook die alles weigert levert `refusal.by = 'active-gate'`, `kinds: ['gate']`, het ZAAD met
  `tuned: 0`, en de geweigerde tune als rapportage. Plus de tak die de ingreep behoedzaam maakt:
  een hook die alléén het zaad accepteert weigert wél de waardetune maar niet wat er geleverd
  wordt, en dan is er GEEN verwerping — de passen ná de waardetune zijn echte zoektochten en een
  toelaatbaar antwoord daaruit mag niet weggegooid worden. En P2: zonder poorthook is het
  resultaatobject onveranderd, wat élke v1-run is.
- `src/lib/engine2/optimizer/choiceKeyGuard.test.ts` — de twee nieuwe sleutels, en de scheiding
  ertussen is de claim: `zFloorBarrierSource` is CHOICE (welke band het doel meet) en
  `zFloorBarrierImpedance` is POLISH (de meting die de run al in handen heeft, het
  `gateViolation`-argument). Een migratie in beide richtingen breekt de build. Sleuteltelling
  39 → 41. Plus: een gewapende barrière verklaart zijn bron (`'safety'`), een ongewapende
  verklaart hem ABSENT met de P4-reden, en de bron beweegt de vingerafdruk.
- `src/lib/engine2/goldenClassification.test.ts` — de FAMILIELIJST is weg, en dat is een V33-
  bijvangst: zij noemde `KAND_V2_*` en `V28_KAND_*`, V32 vroor `V30_KAND_*` in, en tien
  klasse-B-blokken hebben een oplevering lang zonder klassecontrole in het bestand gestaan. De
  regel is nu structureel — élke netlist die het casusboek noemt en die geen v1-baseline is moet
  een geclassificeerd blok hebben. `record-casus1-v2-references.ts` en `compare-corpora.ts`
  leiden hun corpuslijst om dezelfde reden af; alleen de REDEN van een gedateerd corpus staat
  nog met de hand geregistreerd, want die is niet af te leiden.

### V34-guards (waar de bronweerstandsprobe leest, en welke grens hem oordeelt)
- `src/lib/partAudit.ts` — **de twee grenzen hebben sinds V34 één huis elk, met een motivering.**
  `DEFAULT_R_SOURCE_TIER_OHM` (1,0 Ω, de klasseverliestier) stond hier én twee keer in
  `netOptimizer.ts` als `?? 1.0`; `DEFAULT_R_SOURCE_DISQUALIFY_OHM` (2,0 Ω) stond als
  parameterdefault in `designChain.ts`, als `?? 2.0` in `threeWayChain.ts`, in een doc-noot
  ernaast, en een vierde keer in de casus-1-fixture. Dezelfde vorm als `impedanceFloor.ts`, en
  dezelfde weg als `ampMinLoadOhm` bij F0. `SOURCE_PROBE_WINDOW_TOP_HZ` (400) hoort erbij: het is
  de bovenkant van het zoekvenster waarvan V34 ontdekte dat de probe erop landde.
- `src/lib/engine2/optimizer/probeSource.test.ts` — de claims van V34 op de tweeweg-fixture, en
  de twee helften zijn **apart** testbaar met opzet. De RANDREGEL: een piek op de bovenrand wordt
  door `'both'` geweigerd en door `'first'` geaccepteerd, de ONDERrand door beide (V34 voegt een
  rand toe, hij haalt er geen weg), een GESTELDE boxafstemming op een rand blijft geldig (de regel
  gaat over de terugval), en de default is de historische. Het RASTER: absent en `'grid'` zijn
  byte-identiek (P2); een bron zonder data probet NIETS en levert `rSourceOhm: null` in plaats van
  het rastergetal — precies wat een stille terugval wél zou leveren; en het bereikt het OORDEEL,
  in de scherpst mogelijke vorm: één zaad, één grens (afgeleid uit de twee lezingen, nooit
  ingetypt), en de run komt op het ene raster haalbaar en op het andere INFEASIBLE terug. Plus de
  zoektocht zelf, met het dissipatiegewicht opgehoogd — bij de 0,05 van de app is die term op dit
  zaad ~1e-6 waard en beweegt hij niets, en dat is gemeten in plaats van aangenomen.
- `src/lib/engine2/frozenNetlistGates.test.ts` — twee V34-blokken op het echte corpus. (1) Op het
  KETENRASTER weigert de strikte regel de landing en valt élke netlist terug op de serie-pad-
  DC-limiet — `toBe`-gelijk aan `seriesPathResistanceOhm`, want dát is de vondst: het getal
  waarmee de diskwalificatie vergeleek was nooit een meting van waar de regel over gaat. Op het
  VEILIGHEIDSRASTER vindt de probe een echte binnenpiek onder 200 Hz. (2) De rechtvaardiging van
  `'safety'`, als meting: het veiligheidsraster en het poortraster vinden de piek binnen één
  rasterstap van elkaar (51,5 tegen 52,3 Hz) en vellen op élke bevroren netlist hetzelfde oordeel
  over béide tiers. Grootste verschil 0,0129 Ω, en dat getal reist mee in de faalboodschap.
- `src/lib/engine2/optimizer/choiceKeyGuard.test.ts` — `rSourceProbeSource` is CHOICE en mag nooit
  naar POLISH of GREY migreren: hij bepaalt bij wélke frequentie een harde grens vergeleken wordt,
  en op casus 1 bepaalt dát of de eigen referentiefilter van de ontwerper wordt weggegooid.
  Sleuteltelling 41 → 42. Plus de V34-verklaring: een kandidaat mét veiligheidsset probet erop, een
  zonder verklaart ABSENT met de P4-reden, een expliciete bron wint van de afleiding, en de bron
  beweegt de vingerafdruk. En `withDeclaredSourceLimit`: **een niet-gestelde
  `rSourceDisqualifyOhm` wordt op de wire een expliciete `null`** — zonder die stap resolvet de
  keten hem BUITEN de tuner om, waar `choices.ts` niet bij komt, en produceerde "de ontwerper
  stelde niets" hetzelfde als "de ontwerper stelde 2,0 Ω". Geen verklaring ⇒ de identiteit, wat
  élke v1-aanroeper byte-identiek houdt.
- `src/lib/engine2/casus1V2Candidates.test.ts` — de meetopstelling zegt sinds V34 óók welke grens
  er NIET gesteld is en waarom (`bronweerstandsgrens: null` met de P4-reden), dat de audittier
  `null` is (de audit draait, zijn tier oordeelt niets), en op welk raster de probe leest. Een
  afwezige grens die alleen door afwezigheid zichtbaar is, leest als een vergissing.

### V36-guards (waar de dissipatieterm leest, en wat dissipatie nog bewaakt)
- `src/lib/engine2/optimizer/dissipationTerm.test.ts` — de vijf claims op de tweewegfixture, en
  de derde draagt de andere. `dissipationWeight` staat in GREY (A3j: een grijze sleutel wordt
  expliciet overgenomen, nooit stil op nul gezet); de v2-route levert een dissipatieverhouding af,
  dus de term is NIET ingetrokken; het ketenraster weigert op deze fixture wél en het
  veiligheidsraster niet, dus "hij leest de gestelde bron" is te onderscheiden van "hij leest wat
  dan ook" (V23); de verhouding IS `R_source/Re(Z)` op dát raster, exact tot negen decimalen, met
  beide grootheden nagerekend op het geleverde netwerk; en een genoemde bron zonder data probet
  niets in plaats van terug te vallen. Plus de V37-bevinding als feit over de code van vandaag:
  de noemer is de PIEKHOOGTE, met de factor afgeleid uit de kromme zelf.
- `src/lib/engine2/frozenNetlistGates.test.ts` — vier V36-blokken op het echte corpus, en zij
  kosten NIETS extra: `FIELD` bouwt al één rapport per netlist en houdt sinds V36 ook M-A vast.
  Het blok `manifest_en_geometrie.v36_dissipatie` dekt élke bevroren netlist (een gekrompen lijst
  faalt), elke opgeschreven dissipatie en watt reproduceert uit de metriek zelf — met `null` aan
  BEIDE kanten als geldige uitkomst, want `V28_KAND_1` heeft geen enkele discrete weerstand — de
  noemer van de doelfunctieterm ligt meetbaar boven de gemeten R_e (V37 breekt hier zichtbaar op),
  en de grootste termwaarde op het hele casusboek blijft onder de uitdagingsdrempel van 1 %.
- `src/lib/engine2/optimizer/shortlist.test.ts` — de kolom als kolom. Doorgegeven zoals `gates`
  wordt doorgegeven; `null` en nooit 0 op een kandidaat die er geen draagt (een 0 leest als
  "gemeten, en het is nul"); en de dragende claim: een veld waarin de EERSTE kandidaat 95 %
  verstookt levert een byte-identieke lijst op — zelfde rijen, zelfde volgorde, zelfde stempel.
  A5e.1 als meting in plaats van als belofte.
- `src/lib/engine2/casus1V2Candidates.test.ts` — `grootste_R_W_bij_100W` reproduceert per
  kandidaat, in de watt-tolerantieklasse die de drie v1-kandidaten al gebruikten. Elf metrieken
  per kandidaat in plaats van tien.

### V37-guards (waardoor de dissipatieterm deelt, en `scripts/` in de typecheck)
- `src/lib/engine2/optimizer/dissipationTerm.test.ts` — vijf V37-claims naast de vijf van V36,
  en de tweede draagt de rest. Afwezig en `'probe'` zijn byte-identieke netwerken (P2: de
  default is de historische aflezing, dus elke v1-run is onaangeraakt); `'re'` BEREIKT de
  zoektocht — er komt aantoonbaar een ander netwerk uit, want zonder die tegenproef zijn de
  andere claims even waar voor een sleutel die nergens op aangesloten is (V23); de verhouding
  IS `R_source/R_e` tot negen decimalen, met de TELLER nagerekend als V34's aflezing en de
  noemer als de meegegeven R_e; een gestelde `'re'` zonder R_e voor de laagste weg levert GEEN
  verhouding en meldt welke invoer ontbrak, in twee gedaanten (geen kaart, en een kaart die de
  verkeerde weg noemt) mét de tegenproef dat de juiste weg er wél een levert; en zonder probe is
  er ook op `'re'` geen verhouding — de noemer is een tweede vraag en geen vervanging van de
  eerste. Het gewicht staat in de tweede claim hoger dan de 0,05 van de app, en dat is gemeten:
  bij 0,05 verplaatst de term op die fixture niets, en een test die dán groen wordt bewijst dat
  het niemand opvalt.
- `src/lib/engine2/frozenNetlistGates.test.ts` — **de referentie is de definitie.** M-E rekent
  `Q_es_mult = 1 + R_s/R_e` op precies de opgeloste R_e, en `kandidaten.*.Qes_mult` staat als
  klasse-B-referentie in het casusboek. Dus: `1 + verhouding` reproduceert die referentie op
  élke bevroren netlist binnen `exponent_pct` (gemeten grootste afwijking 0,36 % tegen een
  klasse van 5 %), en de PIEKHOOGTE doet dat aantoonbaar niet — minstens 18 % ernaast op élke
  netlist waarvan de referentie werkelijk boven 1 ligt, met een teller die zegt hoeveel er
  meededen zodat een corpus zonder serieweerstand niet stil groen blijft. Plus: de opgeloste
  R_e, de fixture-constante en `_M_E_parameters.R_e_ohm` zijn hetzelfde getal (één R_e, één
  herkomst, drie lezers), en de vóór/ná van de uitdagingsdrempel — op de piek haalde de term op
  géén enkele netlist de 1 % (grootste aandeel 0,57 %), op R_e haalt hij hem wel (22,7 %), en
  het verschil tussen die twee is het KWADRAAT van de factor tussen de noemers, afgeleid uit de
  opgeschreven noemers zelf.
- `src/lib/engine2/optimizer/choiceKeyGuard.test.ts` — het derde paar, met dezelfde scheiding
  als V33 en V34: `dissipationReferenceSource` is CHOICE (welke grootheid een gewogen term
  meet) en `dissipationReferenceReOhm` is POLISH (de opgeloste R_e die de run al in handen
  heeft). Migratie in beide richtingen breekt de build; de tweede mag nooit CHOICE worden, want
  een kandidaat die zijn eigen R_e meebrengt is een tweede mening over de A5c.1-hiërarchie.
  Sleuteltelling 42 → 44. Plus de V37-verklaring, en zij is de ENE onvoorwaardelijke afleiding
  in `candidateDeclaration.ts`: `full()` en `bare()` stellen allebei `'re'`, de kandidaat draagt
  géén R_e (P4 wordt één laag lager beantwoord), een expliciete `'probe'` wint, en de bron
  beweegt de vingerafdruk.
- **`tsconfig.scripts.json` — de typecheck is de guard.** `scripts/` viel tot V37 buiten
  `tsc -b`; zie de aantekening bij het commando hierboven voor de twee foutklassen die er
  meteen uit kwamen.

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
  klasse-B-blokken in de golden refs. Drie seconden, dus vrij om opnieuw te draaien. Sinds V36
  elf metrieken per kandidaat (`grootste_R_W_bij_100W` erbij) plus het afgeleide blok
  `manifest_en_geometrie.v36_dissipatie`.

**`scripts/` valt buiten `tsc -b`** — `tsconfig.test.json` dekt `src/**` en geen enkele scope dekt
`scripts/`. Bij V36 kostte dat een kolom vol `null` in het referentiebestand: `casus1Filter(...).parts`
op een `FilterInput` dat geen `parts` heeft kwam niet als typefout terug. Wie een script schrijft dat
referentiegetallen wegschrijft, kijkt het geschreven blok na vóór de commit.
De acceptatie zit in `casus1V2Candidates.test.ts`: de metrieken reproduceren op alle bevroren bestanden,
en **één** kandidaat wordt live door de échte route heen gereproduceerd — nagemeten bij V37: 158 s, plus 158 s voor de verwerping ernaast. De ~41 s die hier tot V37 stond dateert van vóór V33: sinds de barrière het veiligheidsraster leest kost élke live casus-1-run het viervoudige.

**Sinds V37 zijn het er ZEVEN corpora, en dat is opzet.** `KAND_V2_*` is het levende corpus.
`V28_KAND_*` is bevroren vóór de vloer een ZOEKDOEL was (V30); `V30_KAND_*` toen de poort nog blind
was onder de verre-veldbodem (V32); `V32_KAND_*` toen de BARRIÈRE nog het evaluatieraster las terwijl
de poort de sweep handhaafde (V33); `V33_SWEEP_KAND_*` is V33's dure referentiearm, met de barrière
op het poortraster zelf; `V33_KAND_*` is bevroren toen de BRONWEERSTANDSPROBE nog op de bovenrand van
zijn eigen zoekvenster landde en de v2-route nog een 2,0 Ω-grens droeg die niemand gesteld had (V34);
`V34_KAND_*` toen de DISSIPATIETERM nog door de piekhoogte deelde in plaats van door de opgeloste
R_e — 19,31 Ω tegen 3,05 Ω, en dat kwadrateert tot 40,1 (V37).
Alle zes de gedateerde corpora zijn byte-identieke bestanden onder een andere naam, met hun
klasse-B-blokken mee, bewaard als de "vóór"-helften van hun vergelijkingen. Wie
een script schrijft dat het levende corpus opruimt gebruikt `^KAND_V2_\d+$` en nooit
`startsWith('KAND_V2')`: die tweede slikt de gedateerde corpora mee en gooit het bewijsmateriaal weg.
`record-casus1-v2-references.ts` en `casus1V2Candidates.test.ts` dragen die regel expliciet;
`goldenClassification.test.ts` is er sinds V33 vanaf — daar geldt de structurele regel dat élke
genoemde netlist die geen v1-baseline is een geclassificeerd blok moet hebben, omdat de
familielijst die er stond bij V32 vergeten is. De koppeling bestandsnaam ↔ kandidaat staat in
`manifest_en_geometrie.v30_corpus`, `.v32_corpus`, `.v33_sweep_corpus`, `.v33_corpus` en
`.v34_corpus`, want zij
stond alleen in `casus1_v2_herkomst.json` en dat bestand wordt door de volgende regeneratie
overschreven. **Bevriezen doe je sinds V34 met `scripts/freeze-live-corpus.ts`** en niet met de
hand: het zijn vijf bewerkingen die allemaal moeten landen.

**Zeven van de tien V30-netlists zijn byte-identiek overgenomen in het V32-corpus** — nagemeten,
onderdeel voor onderdeel. V32 heeft geen enkel ontwerp veranderd; het heeft er drie ingetrokken die de
vloer misten op een gebied waar de oude poort niet keek. Wat V33 met datzelfde corpus deed staat in
de V33-entry en in `compare-corpora.ts v32 v33`; wat V34 ermee deed in de V34-entry en in
`compare-corpora.ts v33 live`.

De vloer is sinds F0 uitsluitend het getal dat de ONTWERPER invult (`ampMinLoadOhm`, geen default):
leeg veld = geen oordeel. Eén regel, één plek: `meetsAmpFloor` in `src/lib/impedanceFloor.ts`.
Wie een vloer nodig heeft roept die aan en verzint geen eigen drempel.
