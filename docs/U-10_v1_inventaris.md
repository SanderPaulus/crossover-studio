# U-10 fase 0 — Inventaris: wat is v1, en wat bereikt de UI nog

Gemeten op HEAD `ff27882` (25-10-2026). Er is niets aan code veranderd. Wat hier staat is
inventaris. De besluiten B-4.1 tot en met B-4.4 staan onderaan en wachten op Sander.

## 0. Hoe er gemeten is, en wat de meting niet dekt

Er zijn drie bronnen gebruikt, met elk hun eigen gewicht.

1. **Een browsermeting van het werkelijke workerverkeer.** Dit is de doorslaggevende bron.
   - Opzet: de dev-server met een verse `localStorage`, Expert-modus, de tweewegdemo en
     Network → New from template · 2nd order.
   - `Worker.prototype.postMessage` is vóór elke klik omwikkeld. Daardoor is per actie
     opgenomen welke `kind` naar welk workerbestand ging.

   | actie in de UI | bericht | worker |
   | --- | --- | --- |
   | ⚙ Optimize components (niet-hybride) | `netOptimize` | **`optimWorker.ts` (v1)** |
   | ✂ Minimize network | `minimize` | **`optimWorker.ts` (v1)** |
   | Optimize — design for me (tweeweg, met Z) | `v2ChainOne` | `engine2/optimizer/worker.ts` (v2) |

   De console bleef leeg. De v2-run is na de eerste berichten geannuleerd, want er hoefde
   alleen het adres gemeten te worden.
2. **Statische bereikbaarheid vanaf de UI-ingangen** in `App.tsx`. Voor elke handler is
   nagegaan onder welke voorwaarde hij welke client-functie aanroept, met de regelnummers
   erbij. Dat is meer dan een grep: voor elke tak staat de conditie erbij.
3. **De drie bewaarde app-runs** via `scripts/replay-app-run.ts`.
   - `casus1_u3b_kale_demo_run.json --set demo`: SAME / SAME.
   - `casus1_e2_verkenning_run.json --set demo`: SAME / SAME.
   - `casus1b_e3b_verkenning_run.json --set casus1b`: SAME / DIFFERENT. Dat is precies wat
     E-3b opschreef.

   Deze replays raken alleen het veld. Ze bewijzen dat de A5d.3-afleiding op de demosets
   slaagt, en daarmee dat de terugval daar niet genomen wordt.

**Wat NIET gemeten is:**

- **Coverage.** `@vitest/coverage-*` staat niet in het project. Een dependency toevoegen voor
  één meting leek me geen fase-0-handeling. Coverage zou bovendien weinig zeggen, want
  `App.tsx` wordt in geen enkele test uitgevoerd, dus coverage meet test-bereikbaarheid en
  geen UI-bereikbaarheid. De browsermeting hierboven is daarom de vervanger.
  - Als je coverage tóch wilt als bewijs voor fase 1 (acceptatie 2), dan is
    `@vitest/coverage-v8` als devDependency jouw besluit.
- **De driewegdemo in de browser.** Daar loopt ⚙ Optimize components over dezelfde
  `runNetOptimize`-tak (`App.tsx:12743`). Er is geen driewegspecifieke tak, en dat is statisch
  nagegaan.
- **De tweeweg zonder impedanties** (`vfRounds`) en **de solo-driver** (`soloChain`). Beide
  zijn statisch gevolgd en niet in de browser geklikt.

## 1. Wat is v1, per functie

Legenda bij "bereikbaar":

- **ja**: bereikbaar met de app zoals hij nu draait (`engineV2Enabled` staat sinds U-1 altijd
  op `true`).
- **terugval**: alleen bereikbaar zonder A5d.3-venster (§3).
- **vlag uit**: alleen bereikbaar via `engineV2Enabled === false`. Dat kan niet meer vanuit de
  UI, alleen in tests of via een programmatische aanroep.
- **nee**: niet bereikbaar.

### 1a. De route eromheen (client, workers, App-handlers)

| functie / export | bestand | bereikbaar | aanroeper (UI) | gedeelde motor? | voorstel |
| --- | --- | --- | --- | --- | --- |
| `runChainScan` | `optimClient.ts:310` | **vlag uit** | `App.tsx:11565`, alleen ná `if (useV2) {… return;}` | nee | weg |
| `runChain3Scan` | `optimClient.ts:433` | **vlag uit** | `App.tsx:10037`: `if (!useV2 \|\| !v2ScanSettings)`. `v2ScanSettings` is niet-null zodra `useV2` geldt | nee | weg |
| worker-taken `chainOne`, `chain3One` | `optimWorker.ts:174/181` | **vlag uit** | alleen via de twee functies hierboven | nee (zij roepen `runDesignChain`/`runThreeWayChain` aan, en die blijven) | weg |
| `runNetOptimizeTask` → `netOptimize` | `optimClient.ts:817`, `optimWorker.ts:191` | **JA, gemeten** | `runNetOptimize` (`App.tsx:12743`, knop `:23263`) voor elke niet-hybride tune, plus het automatische `pendingNetTune` na Build (`:12609`) | de taak niet, `optimizeNetworkValues` wel | **eerst naar v2 (B-4.1)** |
| `runMinimizeTask` → `minimize` | `optimClient.ts:807`, `optimWorker.ts:201` | **JA, gemeten** | `runMinimize` (`App.tsx:12270`, knop `:23277`) | de taak niet, `minimizeNetwork` (`minimize.ts`) wel | **eerst naar v2 (B-4.1)** |
| `runVfRoundsTask` → `vfRounds` | `optimClient.ts:792`, `optimWorker.ts:188` | **ja** (statisch) | `runVfOptimize` op de tweeweg **zonder gemeten impedanties** (`App.tsx:11687 e.v.`), daarna `runSynthesis` en `pendingNetTune`, dus óók `netOptimize` | de taak niet, `optimizeVirtualFilters` wel | eerst naar v2 of weigeren (B-4.2) |
| `runSoloChainTask` → `soloChain` | `optimClient.ts:800`, `optimWorker.ts:209` | **ja** (statisch) | `runVfOptimize` met `soloDriver` (`App.tsx:10434`) | de taak niet, `runSoloChain` wel | eerst naar v2 of weigeren (B-4.2) |
| `runChainScanV2`, `runChain3ScanV2`, `runTuneNetlistV2` | `optimClient.ts` | ja | de v2-routes | — | blijven |
| `selectEngine`, `ENGINE_V1_ONLY`, `EngineSelection`, `EngineId` | `engine2/facade.ts` | `selectEngine(true)` ja; `false` vlag uit | `App.tsx:4109` (`engineSelection`, **31 lezers**) | nee | weg in fase 3 (zie §4 voor `runV2Optimization`) |
| `engineV2Enabled` / `setEngineV2Enabled` | `App.tsx` | constant `true` | **37 lezers** in `App.tsx`, waarvan 2 `!engineV2Enabled`-takken | nee | weg in fase 3 |
| `guidedStages(false)` + de v1-guided-wandeling | `v2Guided.ts:171`, `App.tsx` | vlag uit | `App.tsx:15930/18088/18091/24295` | nee | weg in fase 3 |
| `rankChain3Results` | `threeWayChain.ts:1133` (**v1-only functie in een gedeeld bestand**) | **ja**, zie hieronder | `App.tsx:9868` (axes-terugval), `:10215` (élke driewegrun) | nee | blijft tot §1b is beslist |
| `rankChainResults` | `designChain.ts:822` (idem) | **ja** | `App.tsx:11448` (élke tweeweg-v2-run), `:11598` (vlag uit) | nee | blijft tot §1b is beslist |
| `crossoverVariants`, `crossover3Variants`, `runAxes` | `App.tsx` / libs | **terugval** | de v2-routes als `v2Generated === null` (§3) | nee | weg na B-4.2 |
| `physWin3` (de v1-fysicavensters, leest `v1Thresholds`) | `App.tsx:7506` | **terugval** + v1-tabel | `lowWin3`/`highWin3` in `crossover3Variants` (`:9376`) | nee | weg na B-4.2 |

### 1b. Een tweede v1-lezing die op élke v2-run nog rekent

Op elke v2-run berekenen `rankChain3Results` (drieweg, `App.tsx:10215`) en `rankChainResults`
(tweeweg, `:11448`) een v1-ranglijst. Die ranglijst gebruikt het verborgen `bomCapEur` en
`xoWindowOk`, dat uit de verborgen `v1Thresholds` komt. Ze heeft drie lezers:

- De **scan-tabel**. Die is sinds B-2 verborgen (`v1ReadingShown() === false`).
- De **`xoWinNote`** ("a delivered crossing sits outside its physics window"). Deze waarschuwing
  komt in de Working-noot terecht en leest dus nog altijd de verborgen v1-drempels. Dat is een
  bevinding.
- Op de drieweg: **`ranked[0]` wordt geladen** als er geen shortlist is (`App.tsx:10224`, de
  `else`-tak van `selection`).
  - Een shortlist ontbreekt alleen als de run geen stempel droeg. U-6b noemde dat
    "via de UI niet te reproduceren".
  - Het pad bestaat wél. Het is dezelfde v1-kroning die UI-1 voor de rij-route verbood.

Mijn voorstel: de ranglijst valt mee met de terugval (B-4.2), en daarmee ook de `xoWinNote`.
In het geval zonder stempel laadt de app niets en zegt ze waarom. Dat is de UI-1-regel,
doorgetrokken.

## 2. Wat de v1-worker nog doet — de belangrijkste vraag

`optimWorker.ts` bedient zes taken. Twee daarvan zijn dood en vier leven nog.

| taak | aanroeper | draait met v2-poorten / budgetten / verklaring? | wat hij leest dat verborgen of v1 is |
| --- | --- | --- | --- |
| `chainOne`, `chain3One` | v1-scans | n.v.t. (vlag uit) | — |
| **`netOptimize`** | ⚙ Optimize components (niet-hybride, twee- én drieweg) en de automatische tune na Build | **NEE.** `buildNetOptOpts` (`App.tsx:12674`) kent geen `gateViolation`, geen budget en geen kandidaatverklaring. Alleen `ampMinLoadOhm` (de vloerbarrière) en de v1-audittier `rSourceLimitOhm` reizen mee | **`errorSmoothOct`** (verborgen, `niets` sinds U-9), `phaseMetric`, `evalBand` als band, `xoRange`/`xoRangePairs` uit de v1-pinvelden, `stagedOn`, `catalogSnap` |
| **`minimize`** | ✂ Minimize network | **NEE**, dezelfde `buildNetOptOpts` | idem |
| **`vfRounds`** | Optimize op een tweeweg zónder impedanties | **NEE**, virtuele filters zonder netwerk en zonder poorten | `errorSmoothOct` (`App.tsx:10672`), `phasePriority` |
| **`soloChain`** | Optimize met één driver | **NEE** | evalBand, solo-instellingen |

**De bevinding van deze sessie: U-9 markeerde "Error smoothing" als `niets`, en dat is op vier
levende routes onwaar.**

- Op de v2-routes klopt het wel. Daar overschrijft de verklaring de waarde met
  `SEARCH_SMOOTHING_OCTAVES` (= 0, V38-fix).
- Maar `netOptimize`, `minimize`, `vfRounds` en de tune na Build lezen de verborgen state
  rechtstreeks.
- Gevolg: een gebruiker die vóór U-9 1/6 octaaf koos, tunet daar nog steeds op 1/6. Hij ziet
  het veld niet meer en kan het niet terugzetten.
- V38-fix mat dat deze sleutel tot 2,45 dB geleverde rimpel verplaatst.

**Wat het niet-hybride ⚙ Optimize-pad nu concreet is:** een waardetune met de v1-opties, zónder
één gestelde eis als poort. Ook `phaseTrackingMax`, M-C, M-D, de bouwbaarheid en de flank worden
niet gecontroleerd, en `rejectedParts`/V31 bestaat er niet.

- De gebruiker ziet daarna wel de oordelen van het v2-paneel over het resultaat, maar niets heeft
  die oordelen tijdens de tune afgedwongen.
- Een resultaat dat een poort mist, wordt dus gewoon in de Working-tab geschreven.

## 3. De terugval: wanneer, en wat ze leest

Een run neemt de terugval als `v2FieldRequest === null`. Dat gebeurt precies wanneer
`engineV2Report?.report?.predesign.windowInputs` leeg is (`App.tsx:9415`, `:10869`).
`report.ts:1484` pusht voor elk aangrenzend paar onvoorwaardelijk een vensterinvoer. De terugval
treedt daarom alleen op als **het rapport zelf `null` is**:

1. `buildV2Report` vangt een exceptie (`App.tsx:4818`, `report: null, error`). Dat kan een
   schatter of resample zijn die gooit. De Setup-bereik-guard uit september was zo'n geval;
   inmiddels is die gerepareerd.
2. Er zijn minder dan twee takken met een respons (`App.tsx:4609`). Maar dan start de run ook
   niet, want `!woofer || !tweeter || !result` keert eerder terug (`:10584`).
3. `engineSelection.reporting` staat uit. Dat gebeurt alleen met de vlag uit.

**Gemeten op de demosets:** de terugval wordt niet genomen. Beide demo-replays leiden het veld
tot op het laatste cijfer af. Op de casus-fixtures geldt hetzelfde: alle vier leiden hun veld af,
dat is hun hele acceptatie.

De terugval is dus **een foutpad en geen invoertoestand**. Er bestaat geen "ontbrekende invoer"
waarmee een gebruiker er gewoon in belandt. Hij komt er alleen in als de v2-rapportage over zijn
project crasht.

**Wat de run dan leest** (allemaal verborgen sinds U-9/B-2):

| route | wat er draait | verborgen knoppen die beslissen |
| --- | --- | --- |
| drieweg | `crossover3Variants` met `lowWin3`/`highWin3` uit `physWin3`, plus `scan3Mode === 'axes'` (de default) → `runAxes`, de v1-as-voor-as-scan. Alles nog wél door `runChain3ScanV2`, zonder kandidaat, dus de ketensettings worden **geërfd** (`structureLow/High` uit `hpLpPref`) | `v1Thresholds` (kaTier, ctcK, breakupHarmonic, …), `scan3Mode`, `hpLpPref`/`hpLpPrefLow`, `scanSteps3`, de v1-pins |
| tweeweg | `crossoverVariants(userXo ?? saneFree, scanSteps2)`, door `runChainScanV2`, zonder kandidaat → geërfd | `hpLpPref`, `scanSteps2`, de v1-pins |
| beide | de v1-ranglijst, en op de drieweg zonder stempel `ranked[0]` geladen | `bomCapEur`, `v1Thresholds` |

De run zegt hardop dat hij de terugval neemt (`setV2RunNotes`: "That is a fallback, not a v2
field"). Wat er dan draait, is wel stil op v1-knoppen gestuurd die niemand meer kan zien.

**Een pin-test op een fixture zonder venster (fase 1)** moet daarom een rapport laten
*mislukken*. "Een fixture zonder geldigheid" volstaat niet: zonder geldigheid weigert v1 de run
al vóórdat hij begint (`refuseIfUnverified`, P-1).

- Voorstel: de beslissing "veld of weigering" uit `runVfOptimize` lichten naar een zuivere
  functie, de `selectFromShortlist`-vorm (UI-1).
- Die functie toetsen met `report: null` en met `windowInputs: []`.
- Daarnaast een bronscan dat beide routes haar aanroepen en dat `crossover3Variants` /
  `crossoverVariants` er niet meer staan.

## 4. De tests die aan v1 hangen

| testbestand | claim | bewaakt | voorstel |
| --- | --- | --- | --- |
| `engine2/toggleRegression.test.ts` | referentierun byte-identiek met en zonder engine2 geladen | **gedeelde motor** (de run gaat rechtstreeks naar `optimizeNetworkValues` en leest geen vlag) | blijft, wordt de nieuwe invariant (B-4.4) |
| | importgrens: niets buiten de UI-ingangen importeert `engine2/` | gedeelde motor vrij van engine2 | blijft letterlijk |
| | de v1-worker importeert niets uit engine2 | idem, voor de worker | blijft zolang de v1-worker bestaat; vervalt met hem als B-4.1(a) hem leegmaakt |
| | F3b/F3c: annotatie, aanbevolen band, gladdingsregel en pre-start hangen aan `v2Windows`/`engineSelection.reporting` | dat de v2-oppervlakken achter de vlag staan | **vervalt met de vlag** (bronscans op een guard die verdwijnt) |
| | `absent, false and off are the same selection` | `selectEngine` | vervalt met de vlag |
| `engine2/optimizer/determinism.test.ts` | "the facade is a GUARD: the v2 path refuses on a v1 selection" | de `selection`-parameter van `runV2Optimization` | vervalt, en `runV2Optimization` verliest zijn `selection`-veld. Dat raakt `worker.ts:2847` en de payload. De rest van het bestand blijft |
| `engine2/optimizer/f4cRegression.test.ts`, `gateEnforcement.test.ts` | gebruiken `selectEngine(true)` alleen om `runV2Optimization` te mogen aanroepen | tuner en poorten (blijven) | **verhuist van ingang**: dezelfde claims zonder `selection`. De byte-baseline is onaangeraakt |
| `engine2/optimizer/workerRouteRegression.test.ts` | inherited/stated door `handleV2Request` | de v2-worker en de tuner | blijft ongewijzigd (gebruikt geen vlag) |
| `optimClient.stop.test.ts` (3 claims) | stop-en-bewaar / hard cancel op de pool | de **pooldiscipline**, die `runScanV2` deelt | **verhuist** naar `runChain3ScanV2` (in de V15-vorm) |
| `optimClient.ampFloor.test.ts` (3 claims) | de ⚠Z-badge en de ranking door één regel | dezelfde `meetsAmpFloor`-glyphregel, die `runScanV2` óók gebruikt | **verhuist** naar `runChainScanV2`. De claim "badge en ranking" verliest zijn ranking-helft als de v1-ranglijst valt |
| `engine2/optimizer/selection.test.ts`, `polarityFold.test.ts`, `u9Fase2.test.ts` | bronscans die noemen dat `runChainScan` / `ranked[0]` niet op de v2-tak staan | dat v1 de v2-uitkomst niet kroont | aanpassen (V15-vorm): de claim wordt sterker, de genoemde functie bestaat niet meer |
| `threeWayChain.test.ts`, `designChain.test.ts`, `xoWindow.test.ts`, `noWeights.test.ts` | `rankChain3Results`/`rankChainResults` | de v1-ranking zelf | vervalt met de ranglijst; `noWeights` noemt de uitzondering bij naam en verliest die |
| `v1Carryover.test.ts` (16) | melding bij oude projecten, plus de bronscan "v1-motor is nog bereikbaar in code" | de oude-projectmelding (**blijft** in een of andere vorm, B-4.3) en een claim die U-10 bewust omdraait | de tweede helft vervalt **expres**; de eerste helft volgt B-4.3 |
| `v2Guided.test.ts`, `u9Fase3.test.tsx`, `v2Settings.test.ts`, `v2ActiveSide.test.ts`, `v2InputPlacement.test.ts`, `v2InputRegister.test.ts`, `hybridNetwork.test.ts`, `e5Repairs.test.ts` | bronscans die `engineV2Enabled &&` als guard noemen | dat iets achter de vlag staat | mechanisch aanpassen: de guard verdwijnt en de claim gaat over het veld zelf |
| `vfOptimizer.test.ts`, `h1Step0.test.ts`, `h4PolarityArms.test.ts` | `optimizeVirtualFilters` | gedeelde motor | blijven |
| `f4cRegression` / `workerRouteRegression` (bytes) | — | de tuner | **blijven onaangeraakt**, en zijn de acceptatie |

## 5. Het projectbestand

| veld | waar | v1-only? | wat een oud project ermee doet |
| --- | --- | --- | --- |
| `engineV2Enabled` | `project.ts:256` | ja | wordt gelezen en bij laden altijd op `true` gezet (U-1). Bij opslaan wordt `true` geschreven |
| `hpLpPref`, `hpLpPrefLow` | `project.ts:142-143` | ja (alleen de terugval) | verliesvrij hersteld en weer opgeslagen; de U-1-melding noemt ze |
| `kaTier`, `ctcK`, `breakupHarmonic` | `project.ts:172/174/242` | ja (`physWin3` → terugval + `xoWinNote`) | idem. **`ctcK` heeft twee startwaarden** (`'auto'` in `useState`, `'0.5'` in `applyProject`), en de melding noemt hem daarom niet (U-9) |
| `excursionSpl` | `project.ts:247` | ja (v1-excursievloer, `niets`) | idem |
| `errorSmoothOct`, `scan3Mode`, `bomCapEur` | **`localStorage`**, niet in het project | `errorSmoothOct` is **niet** v1-only (§2); de andere twee alleen terugval/v1-ranglijst | overleven per browser en niet per project |
| `phasePriority`, `phaseMetric`, `evalBand`, `stagedOn`, `catalogSnap`, de pins | project | **nee**: de tuner en de v2-routes lezen ze | blijven |

Een project van vóór U-1 opent nu zonder fout en krijgt de U-1-melding. Een project van vóór U-9
opent ook, want U-9 voegde alleen `fieldStatedAt` toe en dat veld is optioneel. Dat is gemeten in
U-1 en U-9 fase 3, maar niet opnieuw gedraaid in deze sessie.

## 6. Voorstel per regel, samengevat

- **Weg (fase 3):**
  - `runChainScan`, `runChain3Scan`, de workertaken `chainOne`/`chain3One`;
  - de vlag (`engineV2Enabled`, `selectEngine`, `ENGINE_V1_ONLY`, 37 + 31 lezers);
  - de v1-guided-wandeling;
  - na B-4.2: de terugval (`crossoverVariants`/`crossover3Variants` op de v2-routes, `runAxes`,
    `physWin3`, de v1-ranglijsten, `xoWinNote`, `ranked[0]`);
  - na B-4.3: de verborgen v1-velden.
- **Blijft als gedeelde motor:** `runDesignChain`, `runThreeWayChain`, `optimizeNetworkValues`,
  `minimizeNetwork`, `optimizeVirtualFilters`, `runSoloChain`, `synthesize`, de audit.
  `rankChain3Results`/`rankChainResults` gaan wél weg, als functie en niet als bestand.
- **Moet eerst naar v2 (fase 1):** `netOptimize` en `minimize` (B-4.1). `vfRounds` en
  `soloChain` (B-4.2, uitbreiding hieronder). `errorSmoothOct` mag pas weg als geen enkele route
  hem nog leest.
- **Test verhuist:** `optimClient.stop`, `optimClient.ampFloor`, de `selection`-afhankelijke
  claims in `f4cRegression`/`gateEnforcement`/`determinism`, en de bronscans uit §4.

## 7. De besluiten (B-4) — voorgelegd aan Sander

### B-4.1 — ⚙ Optimize components (niet-hybride) en ✂ Minimize network

**(a) Naar de v2-worker zoals H-3 het voor de hybride deed.**

Wat het concreet kost:

- **Tweeweg:** bijna niets nieuws.
  - `v2TuneNetlist` + `assembledTuneOptions` + `twoWayChainSettings` bestaan al.
    `runNetOptimizeHybrid` is de vorm, maar dan zonder actieve zijde.
  - Dat is één extra aanroeper op een bestaande route.
- **Drieweg:** er bestaat geen `v2TuneNetlist3`.
  - De optie-assemblage van de drieweg-tune zit nog ín `runThreeWayChain`. H-3 lichtte alleen
    die van `designChain.ts`.
  - Er moet dus een `assembledTuneOptions3` uit `threeWayChain.ts` gelicht worden. Dat is een
    wijziging aan gedeelde motor, en dan is **de volle run verplicht**, met de vier live
    ketenruns byte-identiek.
  - Daarnaast komt er een nieuwe worker-kind bij.
- **Minimize:** er is nog geen v2-tegenhanger.
  - Nodig is een worker-kind dat `minimizeNetwork` aanroept met de v2-feiten, de poorten
    (`gateViolation`) en de verklaring.
  - `minimizeNetwork` geeft zijn opties door aan `optimizeNetworkValues`, dus de poorthook komt
    mee. Wel moet nagegaan worden of élke verwijderpas hem raadpleegt. Dat is niet gemeten.
- **Schatting:** de grootste post van fase 1. Eén sessie, waarvan ongeveer de helft de
  drieweg-extractie met de volle run is.

Wat het verandert aan een tune die de gebruiker nu doet:

1. Elke gestelde eis wordt een poort of budget. Een tune die vandaag in Working landt kan
   onder (a) **geweigerd** worden. Dan blijft het netwerk staan en noemt de noot de regel
   (V31). Een tune die vandaag landt en morgen geweigerd wordt, is een bevinding en geen
   regressie.
2. **De zoekgladding wordt 0 in plaats van de verborgen `errorSmoothOct`.** Dat is waarschijnlijk
   de grootste numerieke verschuiving voor bestaande gebruikers (V38-fix: tot 2,45 dB rimpel).
3. De band, de M-K-toelating en de doelcurve worden die van de v2-verklaring, met de v2-band.
   Met dezelfde zaadonderdelen kan er dus een ander netwerk uitkomen.

**(b) Alternatief:** de twee taken op de v1-worker laten, maar met de v2-poorten erop
(`gateViolation` via de payload, de v2-zoekgladding gesteld).

- Goedkoper, want de drieweg-extractie valt weg.
- Maar je houdt twee optie-assemblages voor "tune deze tekening". De H-3-les was juist dat twee
  literals van één object een scan en een knop hetzelfde ontwerp verschillend laten tunen.
- Ook mag de v1-worker volgens F2b niets uit engine2 importeren, en de poortevaluator is
  engine2.

**Mijn advies: (a).**

### B-4.2 — De terugval

**Mijn advies: weigeren met reden.**

Het is een foutpad (§3), geen invoertoestand. Een "gedefinieerd v2-veld" zou een verzonnen
venster zijn. Dat is precies P4: welke grenzen zou het hebben? De enige eerlijke bron is het
rapport dat net faalde.

Concreet: geen rapport → de run start niet. De melding is "Geen kruisvenster afleidbaar: het
v2-rapport faalde (<foutmelding>)", gevolgd door de bestaande foutregel van het paneel.

**Uitbreiding die ik je erbij voorleg:**

- `vfRounds` (tweeweg zonder impedanties) en `soloChain` (één driver) zijn **geen terugval
  maar eigen routes**. Ze draaien op v1 omdat v2 daar geen route heeft.
- Tweeweg zonder Z: v2 kent een netwerk alleen met impedanties. Dat volgt uit A5c/M-B: zonder
  sweep geen poort.
- Solo: v2 heeft geen solo-route.
- De opties zijn:
  1. **(i)** beide óók weigeren, met de reden "v2 ontwerpt alleen met gemeten impedanties" en
     "v2 kent geen solo-ontwerp";
  2. **(ii)** ze laten staan als bewust v1 en dat zeggen, waarmee U-10 niet volledig is;
  3. **(iii)** ze naar v2 brengen. Dat is nieuw werk en hoort in een eigen sessie.
- Mijn advies: **(i)**. Een ontwerp zonder impedantie is een filtercurve en geen netwerk, en de
  app kan dat zeggen.

### B-4.3 — Oude projecten

**Mijn advies: lezen en meedragen, verliesvrij zoals nu,** met de bestaande U-1-melding.

- Het kost niets.
- Het houdt een project dat iemand terug wil openen in een oude build heel.
- Laten vallen bij opslaan is onomkeerbaar voor een bestand dat iemand anders bezit.

Wat wél verdwijnt, is de state en de UI. De velden worden een doorgeefluik in `project.ts`
(onbekende sleutels bewaren). Ze hebben geen lezer meer, zelfs niet de terugval.

### B-4.4 — De toggle-invariant, de nieuwe vorm

Voorstel voor de harde regel in CLAUDE.md, ter vervanging van de huidige toggle-invariant:

> **Motorgrens-invariant (U-10):** de gedeelde motor — de ketens (`designChain.ts`,
> `threeWayChain.ts`), de tuner (`netOptimizer.ts`), `vfOptimizer.ts`, `minimize.ts`, de
> synthese en de audit — importeert niets uit `engine2/`, en een referentierun ervan is
> byte-identiek met en zonder `engine2/` in de modulegraaf. Alleen de UI-ingangen
> (`App.tsx`, `EngineV2Panel.tsx`, `XoWindowAnnotation.tsx`, `optimClient.ts`) importeren
> engine2. Engine2 mag de motor *aanroepen* en *sturen via gestelde opties*, nooit stil
> veranderen. Elke wijziging die dit raakt vereist `toggleRegression.test.ts`.
> **Twee benoemde v1-routes blijven, en zijn de enige:** de tweeweg zónder impedanties
> (`vfRounds`, virtuele filters) en het solo-ontwerp (`soloChain`, plus de v1-tune en
> -minimalisatie van een solonetwerk). Zij en de v1-code die zij nodig hebben worden niet
> verwijderd. Elk zegt bij elke run zichtbaar wat zij is, en geen van beide leest het verborgen
> "Error smoothing".

In de test, in de V15-vorm:

- De claims "byte-identiek met en zonder engine2" en "importgrens" blijven letterlijk.
- "De v1-worker importeert niets" blijft zolang de worker bestaat.
- De F3b/F3c-flagclaims en "absent = false = off" vervallen met naam.
- De test houdt zijn bestandsnaam, tenzij je hem wilt hernoemen (bijvoorbeeld
  `engineBoundary.test.ts`).

## 8. Besluiten van Sander (25-10-2026)

- **B-4.1: (a).** ⚙ Optimize components (niet-hybride, twee- én drieweg) en ✂ Minimize gaan
  naar de v2-worker, met poorten, budgetten en verklaring. Een tune die daardoor geweigerd wordt,
  is een bevinding.
- **B-4.2: weigeren met reden.** Zonder v2-rapport start de run niet, en de foutmelding wordt
  genoemd.
- **B-4.2-uitbreiding: (i)** — **gecorrigeerd door Sander, 25-10-2026, tijdens fase 1.** Er
  wordt niet geweigerd. Beide routes zijn benoemde uitzonderingen (zie §9).
- **B-4.3 en B-4.4: akkoord.** De v1-velden worden verliesvrij meegedragen zonder lezer. De
  toggle-invariant wordt de motorgrens-invariant uit §7, en `toggleRegression.test.ts` houdt
  zijn naam.

## 9. De twee benoemde uitzonderingen (Sanders correctie op B-4.2, 25-10-2026)

| route | wat blijft | wat de run zichtbaar zegt | "Error smoothing" | v2-versie |
| --- | --- | --- | --- | --- |
| tweeweg zónder impedanties | `vfRounds` (v1-worker), `optimizeVirtualFilters`, `runSynthesis` | "Zonder impedantiemetingen: alleen virtuele filters. Elektrische eisen (vloer, EPDR, dissipatie) zijn niet beoordeeld." | `SEARCH_SMOOTHING_OCTAVES` (v2-waarde) | **open punt**, latere sessie |
| solo (één driver) | `soloChain` (v1-worker), plus de v1-taken `netOptimize`/`minimize` voor een solonetwerk | "Solo-ontwerp: één driver, geen overname — de v2-eisen per overname zijn hier niet van toepassing" | `SEARCH_SMOOTHING_OCTAVES` op de solo-tune en -minimalisatie; `soloChain` zelf las de knop nooit | komt er niet: één driver heeft geen overname |

**Keuze bij "Error smoothing": de v2-waarde, en het veld niet terug.**

- Sinds V38-fix stuurt elke v2-route op de ongegladde kromme (`SEARCH_SMOOTHING_OCTAVES` = 0). De
  gegladde zoekmaat las een stille geest over de bandrand en is gemeten als de verkeerde vraag.
- Het veld op één route terug tonen zou één knop op twee manieren laten betekenen, afhankelijk van
  of er impedanties geladen zijn. Dat is precies het "zelfde veld, ander effect" dat U-9 per route
  wegwerkte.
- De prijs is reëel: wie vóór U-9 een andere gladding koos, krijgt op deze twee routes nu een
  ander resultaat. Dat is de bedoeling: de knop was onzichtbaar.

`soloChain` zelf geeft geen gladding door aan zijn tuner, en draaide dus al op de tunerdefault.
Hij is niet aangeraakt ("de route blijft zoals hij is").

## 10. Fase 1 — wat er gebouwd is (25-10-2026)

**De terugval weigert.** `src/lib/v2RouteRefusal.ts` is een zuivere beslissing:

- Een rapport dat niet gebouwd kon worden wordt `no-report`, met zijn eigen foutmelding.
- Een rapport zonder vensterinvoer wordt `no-window`.
- De twee benoemde uitzonderingen geven `null`.

`runVfOptimize` vraagt de regel vóórdat er iets wordt opgewekt of naar een worker gaat.
`crossoverVariants`/`crossover3Variants` en `runAxes` zijn daarmee onbereikbaar op een v2-run.
Ze staan er nog, want verwijderen is fase 3.

Gepind op een echt rapport: casus 1b met één weg weggehaald is een eenweg-rapport zonder
vensterinvoer, en dat wordt geweigerd (`v2RouteRefusal.test.ts`).

**⚙ Optimize components en ✂ Minimize network lopen op de v2-worker, op elke route behalve solo.**

- **Tweeweg (hybride of niet):** `runNetOptimizeV2(pass)`. Dit is de H-3-functie, gegeneraliseerd:
  zonder actieve zijde is `activeSide` overal afwezig, en dat is de identiteit.
- **Drieweg:** `runNetOptimizeV2_3(pass)` met de nieuwe worker-kind `v2TuneNetlist3`.
- **Minimaliseren:** een `minimize`-veld op beide payloads. `minimizeNetwork` krijgt dezelfde
  geassembleerde opties als de tune, dus de poorthook zit in elke hertune. Daarna leest het
  geminimaliseerde netwerk één iteratie, zonder snap, en `runCandidate` oordeelt erover. Een
  minimalisatie die een poort mist, wordt in zijn geheel geweigerd (V31).

**Geen derde kopie.** Vijf extracties, alle vijf verbatim:

| geëxtraheerd | uit | lezers |
| --- | --- | --- |
| `assembledTuneOptions3` | `threeWayChain.ts` (gedeelde motor) | de keten en `v2TuneNetlist3` |
| `threeWayNetworkFacts` | de `v2Chain3One`-case | beide driewegroutes |
| `threeWayMeasurements` | idem | idem |
| `measureRejectedThreeWay` | idem | idem |
| `threeWayChainSettings`, `threeWayChainBranches` | de driewegscan in `App.tsx` | de scan en de getekende-netwerktune |

**Wat er voor een getekend netwerk anders is dan voor een scankandidaat:**

- Geen kooi, geen vensterbodem en geen kruispunten in de netwerkfeiten, net als op de
  tweeweg-getekende route.
- `xoFloorPairs` wordt expliciet leeggemaakt. Het driewegliteral draagt de v1-fysicavloer, die
  alleen ooit voor de eigen vloer van een kandidaat instond.

**Browsercontrole** (dev-server, verse `localStorage`, het workerverkeer gemeten met een
`postMessage`-probe):

| actie | vóór U-10 | ná fase 1 | uitkomst |
| --- | --- | --- | --- |
| tweeweg-demo, ⚙ Optimize | `netOptimize` (v1) | `v2TuneNetlist` (v2) | geleverd: 4 onderdelen, 10 095 sims, piek 3,11 → 3,16 dB, fase 117,1 → 21,7°, elke gewapende poort binnen |
| tweeweg-demo, ✂ Minimize | `minimize` (v1) | `v2TuneNetlist` (v2) | rapport aangeboden: BOM €36 → €18, piek 2,37 dB, fase 14,0° |
| driewegdemo, ⚙ Optimize | `netOptimize` (v1) | `v2TuneNetlist3` (v2) | geleverd: 8 onderdelen, 16 900 sims, piek 6,21 → 3,22 dB, fase 123,9 → 27,5° |
| driewegdemo, ✂ Minimize | `minimize` (v1) | `v2TuneNetlist3` (v2) | rapport aangeboden: BOM €52 → €33 |
| tweeweg zónder Z, Optimize | `vfRounds` | `vfRounds` (uitzondering) | Sanders zin staat er |
| solo, Optimize — flatten driver | `soloChain` | `soloChain` (uitzondering) | Sanders zin staat er |
| solo, ⚙ Optimize | `netOptimize` | `netOptimize` (uitzondering) | route bevestigd; de tune zelf is niet afgewacht |

**Een bevinding, geen regressie.** Op hetzelfde sjabloonzaad las de v1-tune
"piek 3,22 → 2,51 dB". De v2-tune leest "3,11 → 3,16 dB". Het zijn twee verschillende maten:

- de v2-band begint op f_p van de laagste weg (E-5) en niet op 300 Hz;
- de zoektocht is ongegladd (V38-fix) in plaats van 1/12 octaaf.

De piek op de bredere, ongegladde band is dus niet dezelfde grootheid. Wat de v2-tune wél
garandeert, is dat elke gewapende poort binnen is. De v1-tune kende geen poort.

**Wat fase 1 niet heeft gedaan:**

- Niets verwijderd.
- De solo-tune niet tot het einde in de browser afgewacht.
- De Nederlandse weergave van de twee zinnen alleen in de test gepind, niet in de browser bekeken.
- Een v2-versie van de virtuele-filterroute: dat blijft een **open punt**.
