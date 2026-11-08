# S-3 — Wat is er nodig om de simulaties over meerdere kernen te verdelen? (onderzoek, 08-11-2026)

Vraag van Sander: "uitzoeken wat er voor nodig is om de simulaties op meerdere kernen/parallel te laten doen."
Dit document is een meting en een afweging; er is niets aan de motor veranderd.

## 1. Wat er al parallel loopt

- **De scan is al een pool.** `runScanV2` (`src/lib/optimClient.ts`) zet élke kandidaat op een eigen
  v2-worker; `poolSize()` (`src/lib/pool.ts`) is `kernen − 2`, hoogstens 16. Op deze machine (18 kernen:
  6 snelle en 12 zuinige) zijn dat **16 lanes**. Een werkwachtrij: de eerstvolgende vrije lane neemt de
  volgende kandidaat.
- **Gevolg:** een verkenning van 6 kandidaten gebruikt 6 lanes en laat er 10 leeg; een vol veld van 9
  gebruikt er 9. De wandklok van een run is de **traagste kandidaat**, niet de som.
- **Binnen één kandidaat is alles sequentieel**: één worker, één draad, `handleV2Request` is synchroon.
  Dát is waar de rekenkracht ongebruikt blijft.

## 2. Wat één kandidaat kost, gemeten vandaag

Gemeten met `scripts/measure-e5c-prune-anatomy.ts` (één casus-1-ketenrun, observator op élke
simplexaanroep; het record in `test-fixtures/casus1_e5c_anatomie.json` is NIET herschreven) en
`scripts/measure-eval-cost.ts` (sinds vandaag met een arm voor de gevolgde barrière, de app-route sinds S-2).

**Per evaluatie** (casus-1-kandidaat, 143 rasterpunten, 79 onderdelen):

| route | ms per evaluatie |
| --- | ---: |
| casus-1-fixture (barrière `safety-extended-refined`, de S-2-pin) | 2,9 gemiddeld over de run (3,9 koud) |
| **de app sinds S-2** (barrière `…-tracked`) | **1,32** (koud) |
| zonder barrière (de solve plus de metrieken) | 1,05 |

**Per kandidaat** (fixture-route, kandidaat `woofer→mid 156,7 LR4 · mid→tweeter 2251,4 LR4`, 43 vrije
waarden): **621 s, 214 414 evaluaties, 107 simplexaanroepen = 99,5 % van de wandklok.** Op de app-route
is dat naar rato ongeveer **3,5 minuut**.

Zo is die kandidaat opgebouwd (een "volle tune" = fit 5880 iteraties → again → 13 blokpassen van 6 vrije
waarden → polish; elke stap start waar de vorige eindigde):

| stap | wat | s | hangt af van |
| --- | --- | ---: | --- |
| 1 | ontwerp + synthese | 0,2 | — |
| 2 | waardetune (volle tune) | 85 | 1 |
| 3 | basin-challenge (volle tune op het hergezaaide zaad) | 85 | **1 — niet van 2** |
| 4 | vroege drift-catch (volle tune) | 85 | 2+3 |
| 5 | barrièretune (0,6 budget) | 26 | 4 |
| 6 | escalatie ronde 1: 4 structuurhertunes à 26 s | 104 | 5; **onderling onafhankelijk** |
| 7 | escalatie ronde 2: 2 structuurhertunes à 27 s | 54 | 6; **onderling onafhankelijk** |
| 8 | settle na de structuurwijziging (volle tune) | 85 | 7 |
| 9 | drift check (volle tune) | 85 | 8 |

Het E-5c-record van september (1516 s op een andere kandidaat) had dezelfde vorm.

## 3. Wat zich laat verdelen zonder dat de uitkomst verandert

Een simplex is per constructie sequentieel: elke iteratie leest het resultaat van de vorige, en hij doet
gemiddeld 1,19 evaluaties per iteratie — speculatief alle mogelijke volgende punten tegelijk uitrekenen
levert dus hoogstens ~16 % per aanroep op tegen 3–4× de rekentijd en een worker-rondreis per iteratie.
Dat pad is dicht.

Wat wél kan, zonder één beslissing te verplaatsen (**speculatief**: parallel rekenen, in de oude volgorde
accepteren):

- stap 3 naast stap 2 (beide starten vanaf het zaad);
- de structuurhertunes van één escalatieronde naast elkaar (de escalatie tuned ze vandaag al allemaal en
  kiest de beste);
- de snoei-shortlist (tot 8 hertunes per ronde; vandaag sequentieel met `break` op de eerste geaccepteerde —
  parallel: alle 8, de eerste acceptabele in de oude volgorde wint).

**Kritieke pad voor deze kandidaat:** 85 + 85 + 26 + 26 + 27 + 85 + 85 = **419 s tegen 621 s: −32 %**,
met hoogstens 4 lanes tegelijk. Op de app-route: van ~3,5 naar ~2,4 minuut per kandidaat. De vijf volle
tunes (425 s) blijven een ketting; daar zit de rest.

Meer winst vraagt een ánder algoritme (regeneratie van elk corpus): de 13 blokpassen als batch tegen
dezelfde basis in plaats van na elkaar (−~20 s per volle tune), of een parallelle multistart. Of minder
volle tunes per kandidaat — dat is een vraag over de trapmethode, niet over kernen.

## 4. Wat er technisch voor nodig is (voor §3)

1. **Sub-workers vanuit `worker.ts`.** Geneste workers worden door browsers en door Vite gebundeld; de
   tune-opties moeten over `postMessage` kunnen. Twee velden zijn vandaag closures: `gateViolation` (sluit
   over de bevroren `GateReference`, `v2.gates`, `ratingsFor` — allemaal data, dus herbouwbaar in de
   sub-worker) en `onStage` (instrumentatie, mag wegvallen).
2. **De tuner blijft synchroon, of wordt asynchroon.** Synchroon blijven betekent blokkeren op de
   sub-workers met `SharedArrayBuffer` + `Atomics.wait` (toegestaan in een worker). Dat vereist
   `crossOriginIsolated`, dus COOP/COEP-headers — GitHub Pages zet die niet; de bekende uitweg is een
   service worker die ze toevoegt (`coi-serviceworker`), met een extra herlaadbeurt bij de eerste start.
   Asynchroon maken raakt `optimizeNetworkValues` → `runCandidate` → `handleV2Request` (bewust synchroon) →
   de ketens, de scripts en élke test die de tuner direct aanroept.
3. **Byte-identiek houden, drie plekken.** (a) De evaluatietelling staat in de byte-baselines: tel alleen de
   evaluaties die de sequentiële weg ook gedaan zou hebben (tot en met de geaccepteerde tak, in volgorde).
   (b) De gevolgde barrière (S-2) heeft een run-scoped trackstate; een sub-worker moet die meekrijgen en de
   staat van de geaccepteerde tak teruggeven, anders leest hij een andere barrière. (c) Het hertune-memo
   (`repeatedTune: 'reuse'`) is run-scoped; een tak zonder memo rekent hooguit dubbel, de uitkomst blijft
   gelijk.
4. **Bewijs:** `toggleRegression`, `f4cRegression`, `workerRouteRegression` én de vier live ketenruns
   moeten byte-identiek blijven; dat is de volle run, verplicht.
5. **Kanttekening Apple Silicon:** met ≤ 6 kandidaten lopen de lanes op de snelle kernen; speculatieve takken
   komen op de zuinige terecht en zijn dan ~2× trager, dus de −32 % krimpt als de hoofdtak op zo'n tak wacht.

Omvang: een eigen sessie of twee, met de volle run als acceptatie. Geen dagwerk.

## 5. Wat goedkoper is

- **Lege lanes vullen met informatie.** Bij ≤ 16 kandidaten kosten de gespiegelde polariteitsarmen
  (`polarityArms: 'both'`, H-4/H-5) **geen wandklok**: de verkenning van 6 wordt 12 op 16 lanes. H-5 koos
  `textbook` als standaard om de CPU-tijd te halveren; op deze machine is dat verschil er in de wandklok niet.
- **De prijs per evaluatie.** De app zit op 1,32 ms, waarvan 1,05 ms de solve plus de metrieken is. Dat
  schaalt over élke stap, ook de sequentiële: een WASM/SIMD-solver of een goedkopere barrièrelezing haalt
  daar meer dan de 32 % van §3, zonder architectuurwijziging. De fixture-route (generatoren, tests) betaalt
  nog 2,9 ms door de S-2-pin; de eerstvolgende regeneratie brengt haar naar 1,3.
- **Minder volle tunes per kandidaat** (vijf nu) — een algoritmische vraag met regeneratie.

## 6. Advies

Niet beginnen met §4. Een driewegverkenning in de app is al zes kandidaten naast elkaar en duurt ongeveer
één kandidaat lang; §4 maakt die kandidaat ~30 % korter tegen een hoge prijs in architectuur en bewijslast.
Eerst §5: de prijs per evaluatie (werkt overal, ook op één kern), en de lege lanes gebruiken waar dat gratis
is. §4 wordt interessant als één losse tune (⚙ op de Network-tab) of een run met weinig kandidaten de
dagelijkse ergernis is.
