# Startprompt E-6 — De Priority-schuif: één waarde, één bron (N1)

*Eén Claude Code-sessie met één stoppunt voor Sander (aanbevolen: Opus, /effort xhigh). Engine-sessie, maar smal: zij raakt alleen hoe `phasePriority` de keten en de tuner bereikt. Geen poort, geen budget, geen venster, geen corpus.*

---

> **Rol.** Je bent de engineer die een inconsistentie in de zoektocht oplost zonder er een tweede voor terug te zetten. In dit project geldt: meten, niet toeschrijven. Elke uitspraak over wat de schuif "doet", komt uit een run die precies één factor verzet.
>
> **Eerst lezen.** `CLAUDE.md`, met nadruk op M-4 (de fase-schuif als zesde ketensleutel, `DEFAULT_PHASE_PRIORITY`, de twee gestelde runs en hun uitkomst), U-5c (de schuif gemarkeerd als "doet niets"), U-9 (N1 in `docs/U-9_veldinventaris.md`, §N1 en rij #88) en de motorgrens-invariant van U-10. Verder `src/lib/engine2/optimizer/worker.ts`, `candidateDeclaration.ts` en `chainChoices.ts`, en `scripts/measure-m4-phase-priority.ts`.
>
> **Werkafspraken (ongewijzigd).** Nederlands. Inventaris vóór wijziging. Golden refs zijn de autoriteit. V-nummers voor afleidingsfouten. Geen bewerkingen tijdens een lopende verificatie (de H-2-regel). Geen suite naast een browserrun.
>
> **De bevinding (N1, U-9 fase 0).** De schuif heeft drie lezers, en die lezen twee verschillende getallen:
> - **De ontwerpstap en de synthese** lezen `settings.phasePriority`. Na `withDeclaredChainChoices` is dat de verklaarde waarde, en de app verklaart altijd `DEFAULT_PHASE_PRIORITY` (0,5), omdat zij de schuif nooit aan `declareCandidateChainChoices` geeft (`candidateDeclaration.ts:996`).
> - **De tuner** krijgt zijn gewicht uit de hook. Die spreidt `network.weights.phasePriority`, en `network.weights` wordt in `worker.ts` gebouwd uit de **ruwe** `input.settings`, vóór de verklaring (`worker.ts:1190`, `:2067`, `:2207`). De hook staat als laatste, dus in de tuner wint de schuif.
>
> Een run met de schuif op 75 % ontwerpt dus op 50/50 en tunet op 25/75. Niemand heeft dat zo gekozen. Het commentaar bij M-4 belooft *"een ontwerper die de schuif stelt wint ervan"*, en dat is maar voor één van de drie lezers waar.
>
> ---
>
> ### Fase 0 — Meten (geen wijziging)
>
> 1. **Boek N1 als V-nummer** in `CLAUDE.md` (het volgende vrije nummer), met de drie lezers, de regels en de herkomst (U-9 fase 0). Dat is boekhouding en geen reparatie.
> 2. **Bevestig de splitsing op de echte route.** Gebruik de observator-techniek van U-9 fase 0 (`measure-u9-field-effects.ts`). Leg per route (drieweg, tweeweg, hybride, ⚙ Optimize en ✂ Minimize sinds U-10) vast wat de ontwerpstap, de synthese en de tuner werkelijk krijgen, bij een schuif van 0,25, 0,5 en 0,75.
> 3. **P2, gemeten.** Op 0,5 moet alles byte-identiek zijn aan de huidige stand, want daar is er geen splitsing. Toon dat. Laat ook zien welke casus-fixtures `phasePriority` stellen (M-4: casus 1, 1b en 2 stellen 0,5), zodat vaststaat dat geen corpus en geen live ketenrun kan bewegen.
> 4. **Wat de splitsing kost.** Draai drie armen met precies één factor verschillend: (i) de huidige splitsing, (ii) alle drie de lezers op de schuif, (iii) alle drie op 0,5. Doe dat op de kleine parsers-fixture (seconden) en op één casus-1b-kandidaat (minuten), bij een schuif van 0,25 en 0,75. Lees per arm: geleverd of geweigerd (met grond), rms, ± venster, M-K per paar, min |Z|, onderdelen en BOM. Gebruik de M-4-meting als referentie: daar kwam een hogere fase-prioriteit op casus 1 *slechter* uit op bijna alles, en één kandidaat werd geweigerd op M-D. Herhaal die meting niet; citeer haar.
> 5. **Wie de schuif nu gebruikt.** Zoek uit wat de app-startwaarde is (`appDefaults.ts`), of Guided hem stelt (U-9 fase 3: niet), en hoe een oud project met een andere waarde opent.
>
> **Lever** een korte sectie in `docs/U-9_veldinventaris.md` of een eigen `docs/E-6_meting.md`, met de tabel van stap 4 en de drie routes van stap 2. **Stop en leg Sander voor (B-5):**
> - **(A) Eén waarde, drie lezers: de schuif.** De app geeft de schuif aan de verklaring, en ontwerpstap, synthese en tuner lezen allemaal hetzelfde getal. De belofte van M-4 wordt waar. Een schuif op de app-startwaarde houdt de "app default"-markering van U-9.
> - **(B) Eén waarde, drie lezers: de motor.** De schuif verdwijnt uit de UI, en alle drie lezen `DEFAULT_PHASE_PRIORITY`. Dat past bij de M-4-meting (fase opdrijven maakte het ontwerp slechter) en bij Guided, dat hem niet vraagt. Een oud project draagt zijn waarde verliesvrij mee, zonder lezer (de U-10-regel B-4.3).
> - **(C) Iets anders**, op grond van wat je gemeten hebt.
> Zet de cijfers van stap 4 in je bericht en niet alleen in een bestand, en zeg welke optie je aanraadt en waarom. Mijn voorlopige voorkeur is (B), tenzij stap 4 laat zien dat een andere schuifwaarde op casus 1b werkelijk iets wint.
>
> ---
>
> ### Fase 1 — De keuze uitvoeren
>
> - **De reparatie zit op één plek.** `network.weights` wordt gebouwd uit de **verklaarde** waarde en niet uit de ruwe invoer, op alle drie de plaatsen in `worker.ts`. Hoe die verklaarde waarde ontstaat, volgt B-5: (A) de app geeft de schuif aan `declareCandidateChainChoices`, of (B) de verklaring blijft `DEFAULT_PHASE_PRIORITY` en de schuif gaat weg. Maak geen tweede bron: één functie bepaalt de waarde, en drie lezers lezen haar.
> - **Een bronscan pint** dat geen van de drie plaatsen nog `input.settings.phasePriority` leest. Doe dat met de opzettelijke breuk erbij.
> - **Een test door de echte route** (`handleV2Request`, payload door `structuredClone`) bewijst dat ontwerpstap, synthese en tuner hetzelfde getal krijgen, bij twee verschillende schuifwaarden onder (A), of bij elke invoer onder (B).
> - **P2:** zonder schuif of op 0,5 is elke run byte-identiek. `f4cRegression`, `workerRouteRegression`, `toggleRegression` (de motorgrens) en de twee live ketenarmen van `chainChoices.test.ts` reproduceren.
> - **De UI volgt.** De registerrij `phasePriority`, de badge en de U-9-notitie zeggen wat nu waar is. Onder (B) gaan de schuif en zijn Wizard-radio weg, en wordt de rij `niets` met de reden "E-6". `v1Carryover`/de projectlader dragen de oude waarde verliesvrij mee.
> - **De vingerafdruk.** `chainDeclarationKey` draagt `phasePriority` al. Zeg in de commit of een bestaande herkomst (`casus1_v2_herkomst.json` en de andere) daardoor veroudert. Dat hoort niet te gebeuren, omdat de casussen 0,5 stellen; meet het.
>
> ---
>
> **Buiten scope.** Poorten, metrieken, budgetten, venster en corpus. Geen regeneratie. `DEFAULT_PHASE_PRIORITY` zelf blijft 0,5; dat getal verplaatsen is een ander besluit. De andere open punten (v2 voor de tweeweg zonder impedanties, `physWin3` en de drempels, de voicing in Guided).
>
> **Acceptatie.**
> 1. N1 als V-nummer geboekt, met de meting van fase 0 en Sanders besluit B-5.
> 2. Op elke route lezen ontwerpstap, synthese en tuner hetzelfde getal, gepind door een test door de echte route en door een bronscan, elk met een opzettelijke breuk.
> 3. **De volle run is verplicht**, omdat dit de zoektocht raakt (`npx vitest run`, alleen gedraaid, op de boom die gecommit wordt). Alle vier de live ketenruns blijven byte-identiek, en beide byte-baselines reproduceren.
> 4. Een oud project met een schuif ≠ 0,5 opent zonder fout, en wat er met die waarde gebeurt staat in de melding.
> 5. Browsercontrole op de tweewegdemo: een run en ⚙ Optimize components, met de schuif (onder A) op twee waarden, of zonder schuif (onder B). Bekijk de badges en de console.
> 6. Afsluitend: de gewijzigde bestanden, de meetcijfers, wat er níet gedaan is, en of de CI-tagtelling (19 overgeslagen) beweegt. Dat hoort niet te gebeuren.
