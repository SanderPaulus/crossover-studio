# Startprompt U-10 — De v1-motor uitfaseren

*Eén Claude Code-sessie in vier fasen, met twee stoppunten voor Sander (aanbevolen: Opus, /effort xhigh). Na U-9 is in de UI niets v1-alleen meer zichtbaar. U-10 haalt weg wat eronder nog staat, maar pas nadat twee dingen geregeld zijn: (a) v2 doet in de terugval zelf iets, en (b) de toggle-invariant heeft een nieuwe vorm.*

---

> **Rol.** Je bent de engineer die opruimt in een codebase waarvan de testsuite het geheugen is. Verwijderen is hier de riskantste handeling die er bestaat: elke guard in `CLAUDE.md` is betaald met een fout, en een guard die je weghaalt omdat "zijn onderwerp weg is" kan ook iets bewaakt hebben dat blijft. Daarom geldt in deze sessie: **wat weg mag, wordt gemeten en niet aangenomen**, en elke verwijderde test krijgt een regel in de commit die zegt wat hij bewaakte en waarom dat niet meer bestaat, of welke andere test het nu draagt.
>
> **Eerst lezen.** `CLAUDE.md`, met nadruk op: de toggle-invariant (harde regel), U-1 (v1 uit de UI, de vlag programmatisch), I-1 (de terugval leest de v1-knoppen), UI-1 (`selectFromShortlist`), H-3 (`runMinimizeTask` en de niet-hybride ⚙ Optimize lopen nog via de v1-worker), U-9 fase 0–3 (de veldinventaris, `V2_NIETS_ROWS`, B-2) en de F2b-guards rond `optimWorker.ts`. Verder `docs/U-9_veldinventaris.md` en `src/lib/engine2/facade.ts`.
>
> **Werkafspraken (ongewijzigd).** Nederlands. Inventaris vóór wijziging. Meten, niet toeschrijven. Golden refs zijn de autoriteit. Geen bewerkingen tijdens een lopende verificatie (de H-2-regel). Geen suite naast een browserrun.
>
> **Een belangrijk onderscheid, en lees het twee keer.** "v1" is niet "de oude code". De ketens (`designChain.ts`, `threeWayChain.ts`), de tuner (`netOptimizer.ts`), `vfOptimizer.ts`, de synthese en de audit zijn **gedeelde motor**: de v2-worker roept ze aan (`runThreeWayChain`, `runDesignChain`, `optimizeNetworkValues`). Die blijven. Wat v1 is, is de **route** eromheen: de v1-worker en zijn taken, de v1-scans, de v1-ranglijst, de vlag `engineV2Enabled` met `selectEngine`, de v1-guided-wandeling, en de terugval die de verborgen knoppen leest. Ook bestanden die gedeeld zijn kunnen v1-only functies bevatten (`rankChain3Results` staat in `threeWayChain.ts`). Beslis per functie, niet per bestand.
>
> ---
>
> ### Fase 0 — Inventaris door bereikbaarheid (geen wijziging)
>
> 0. **Housekeeping.** Boek de CI-uitslag van U-9 (`c06e4ad`, `65eadca`, `709ad9c`) in `CLAUDE.md` in de vorm van de vorige nazorgregels. Het getal om op te letten is 19 overgeslagen tests. Is het een ander getal, of is CI rood, dan stop je en meld je dat vóór al het andere. Commit ook `docs/U-9_startprompt_UI_guided_expert.md`, als die nog los staat.
> 1. **Wat is v1, per functie.** Volg vanaf de UI-ingangen (élke knop, élk effect, élke laadroute in `App.tsx`) welke code nog bereikbaar is met `engineV2Enabled === true`, en welke alleen via `false` of via de terugval. Lever per functie, export en bestand: bereikbaar vanuit de UI (ja / alleen terugval / alleen met vlag uit / nee), wie hem aanroept, en of hij gedeelde motor is. Gebruik een echte meting en geen grep alleen. Een goedkope manier: draai de snelle laag met coverage, plus de drie bewaarde app-runs via `replay-app-run.ts`, en kijk welke v1-exports nul hits hebben buiten tests.
> 2. **Wat de v1-worker nog doet.** `optimWorker.ts` bedient meer dan de scans: H-3 noteert dat de niet-hybride **⚙ Optimize components** (`runNetOptimizeTask`) en **de minimaliseerpas** (`runMinimizeTask`) daar nog lopen. Die zijn **wél bereikbaar** vanuit de Network-tab. Inventariseer elke taak van die worker: wie roept hem aan, en draait hij met v2-poorten en de v2-verklaring of niet? Dit is de belangrijkste vraag van de sessie. Een taak die vandaag zonder poorten tuned is een **v1-route die nog in gebruik is**, geen dode code.
> 3. **De terugval.** Wanneer neemt een run vandaag de terugval zonder A5d.3-venster? Meet het op de fixtures en de demobundels: welke invoer ontbreekt er dan (geen geldigheid? geen venster afleidbaar?), en wat leest de run in dat geval (de vier verborgen velden, de v1-drempels).
> 4. **De tests die aan v1 hangen.** Per testbestand en per claim: bewaakt hij v1-gedrag (en verdwijnt hij dus met v1), of bewaakt hij **gedeelde motor via een v1-ingang** (en moet hij dus een andere ingang krijgen)? `toggleRegression`, `f4cRegression` (de inherited-vorm), `workerRouteRegression` (inherited), `gateEnforcement`, `determinism` en `v1Carryover` hebben je aandacht nodig. De byte-baselines **blijven**: zij bewaken de tuner, en die blijft.
> 5. **Het projectbestand.** Welke velden in `project.ts` zijn v1-only (de verborgen knoppen, `engineV2Enabled`)? Wat doet een oud project ermee bij laden en opslaan?
>
> **Lever** `docs/U-10_v1_inventaris.md`: de tabellen van 1–5 en een voorstel per regel (weg / blijft als gedeelde motor / moet eerst naar v2 / test verhuist naar andere ingang). **Stop en leg Sander voor (B-4):**
> - **B-4.1 De v1-worker-taken die nog in gebruik zijn** (⚙ Optimize niet-hybride, minimaliseerpas): (a) naar de v2-worker zoals H-3 de hybride al deed (`v2TuneNetlist`), met poorten, budgetten en verklaring, of (b) iets anders. Zeg wat (a) concreet kost en wat het verandert aan een tune die de gebruiker nu doet.
> - **B-4.2 De terugval:** v2 **weigert** de run met de reden ("geen kruisvenster afleidbaar: <ontbrekende invoer>"), of v2 **meldt** het en draait een gedefinieerd v2-veld. Wat zou dat veld zijn, en is dat niet een verborgen default (P4)? Mijn advies: weigeren met reden.
> - **B-4.3 Oude projecten:** de v1-velden bij laden lezen en bij opslaan **meedragen** (verliesvrij, zoals nu), of bij opslaan **laten vallen** met een eenmalige melding.
> - **B-4.4 De toggle-invariant.** Zie fase 2. Leg je voorstel voor de nieuwe vorm hier al voor, want het verandert een harde regel in `CLAUDE.md`.
>
> ---
>
> ### Fase 1 — De terugval en de laatste v1-routes naar v2 (voorwaarde a)
>
> - Voer B-4.2 uit. De terugval leest geen verborgen knop meer. Geeft de route geen venster, dan zegt de run dat bij naam, met de ontbrekende invoer, en er loopt niets stil op v1-instellingen. Pin dat met een test op een fixture zonder venster.
> - Voer B-4.1 uit. Hergebruik de H-3-route (`v2TuneNetlist`, `assembledTuneOptions`, `twoWayChainSettings`); maak geen derde kopie. Een tune die vandaag geleverd werd en onder de v2-poorten geweigerd wordt, is een **bevinding** en geen regressie. Meet dat op de demobundels en noteer het.
> - Na fase 1 bereikt geen enkele UI-route nog v1-code. Laat de coverage-meting van fase 0 dat bevestigen: nul hits op elke v1-export, behalve via `false` in tests.
>
> ---
>
> ### Fase 2 — De invariant krijgt een nieuwe vorm (voorwaarde b)
>
> De harde regel was "met `engineV2Enabled` uit is app-gedrag byte-identiek". Zonder vlag heeft die regel geen onderwerp, maar **twee van zijn drie claims bewaken iets dat blijft**:
> - **De importgrens**: niets buiten de UI-ingangen importeert `engine2/`. Die blijft letterlijk; zij houdt de gedeelde motor vrij van engine2.
> - **De byte-identieke referentierun**: die run gaat rechtstreeks naar `optimizeNetworkValues` en leest geen vlag. Zijn nieuwe vorm: *de gedeelde motor geeft byte-identiek hetzelfde met en zonder engine2 in de modulegraaf*. Dat bewaakt dat engine2 de tuner nooit stil verandert.
> - **`undefined` = `false` in de vlag**: die vervalt samen met de vlag.
>
> Schrijf de nieuwe regel voor `CLAUDE.md` (Harde regels) en leg hem in fase 0 al aan Sander voor (B-4.4). Pas `toggleRegression.test.ts` aan in de V15-vorm (wat er stond, wat er staat, waarom), en hernoem hem pas als Sander dat wil.
>
> ---
>
> ### Fase 3 — Verwijderen, in kleine commits
>
> Pas nu. Volgorde, met elk een eigen commit, `npx tsc -b` en `npm run test:fast` (alleen gedraaid):
> 1. de v1-guided-wandeling (`!engineV2Enabled`-takken in `App.tsx`) en `guidedStages(false)`;
> 2. de vlag zelf: `engineV2Enabled`, `setEngineV2Enabled`, `selectEngine`, `ENGINE_V1_ONLY` (`facade.ts`), en de 37 lezers in `App.tsx`. Elke `engineV2Enabled && X` wordt `X`, en elke `!engineV2Enabled`-tak verdwijnt. Doe dit mechanisch en lees elke tak na;
> 3. de v1-scans (`runChainScan`, `runChain3Scan`), de v1-worker-taken die door fase 1 overbodig zijn, en `rankChain3Results` als hij geen lezer meer heeft;
> 4. de verborgen v1-velden uit de state, volgens B-4.3, en hun registerrijen (`v1-legacy`, `V2_NIETS_ROWS` voor zover v1), met `v1Carryover.ts` aangepast;
> 5. de tests die alleen v1-gedrag bewaakten, elk bij naam in de commit, met wat hij bewaakte.
>
> **Raak geen gedeelde motor aan.** Een functie in `designChain.ts`, `threeWayChain.ts`, `netOptimizer.ts` of `vfOptimizer.ts` gaat alleen weg als fase 0 aantoont dat de v2-route hem niet bereikt. Wijzigt er tóch iets in die bestanden, dan is **de volle run verplicht** (`npx vitest run`, alleen gedraaid), met alle vier de live ketenruns byte-identiek.
>
> ---
>
> **Buiten scope.** Poorten, metrieken, budgetten, venster en corpus. N1 (de Priority-schuif in de ontwerpstap) is een eigen besluit. De voicing in guided ná de eerste run (open punt van U-9 fase 3). Geen regeneratie.
>
> **Acceptatie.**
> 1. `docs/U-10_v1_inventaris.md` met een gemeten bereikbaarheid per functie, en Sanders besluiten B-4.1–4.4 vóór fase 1.
> 2. Geen UI-route bereikt nog v1-code (coverage, gemeten). De terugval weigert of meldt volgens B-4.2, gepind op een fixture.
> 3. De nieuwe invariant staat in `CLAUDE.md`, en de test bewijst hem: de gedeelde motor is byte-identiek met en zonder engine2 geladen, en de importgrens staat.
> 4. Beide byte-baselines (`f4cRegression`, `workerRouteRegression`), `p6Lint`, `ciLayer` en de golden-suites van casus 1, 1b, 1h en 2 zijn ongewijzigd groen. Verhuisde testclaims staan in de V15-vorm.
> 5. Een oud project, van vóór U-1 én van vóór U-9, opent zonder fout. Wat er met de v1-velden gebeurt, volgt B-4.3 en staat in de melding.
> 6. Browsercontrole op de driewegdemo, de tweewegdemo en een hybride project: een volledige run, ⚙ Optimize components en de minimaliseerpas op de Network-tab, desktop en 375 px. De console blijft leeg.
> 7. `npm run test:fast` na elke commit. De volle run alleen als er iets in de gedeelde motor veranderde, en dan alle vier de live ketenruns byte-identiek. De CI-tagtelling (19 overgeslagen) beweegt alleen als er een getagde test wegvalt, en dan zeg je dat met naam.
> 8. Afsluitend: hoeveel regels er weg zijn, welke tests verdwenen en wat ze bewaakten, en wat er níet is weggehaald en waarom.
