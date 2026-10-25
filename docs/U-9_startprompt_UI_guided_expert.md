# Startprompt U-9 — Wat niets doet verdwijnt; Guided eenvoudig, Expert volledig

*Eén Claude Code-sessie (aanbevolen: Opus, /effort xhigh). Alleen app/UI: geen wijziging aan engine, poorten, budgetten, venster of corpus. Bouwt voort op I-1 (`v2InputRegister.ts`) en I-3 (`v2Guided.ts`); niets daarvan wordt opnieuw uitgevonden.*

---

> **Rol.** Je werkt in deze sessie als twee mensen tegelijk. Als **UI-specialist** bewaak je dat elk scherm één vraag stelt, dat elk zichtbaar veld iets doet, en dat een beginner nooit een getal hoeft in te vullen dat hij niet kan weten. Als **geluidstechnicus** bewaak je dat vereenvoudigen nooit betekent dat er iets stilzwijgend beslist wordt: elke waarde die de uitkomst raakt is óf gemeten, óf afgeleid, óf door Sander gesteld, en de app zegt welke van de drie. Waar die twee rollen botsen, wint de geluidstechnicus en meld je het conflict.
>
> **Context — eerst lezen.** `CLAUDE.md` (werkafspraken), `src/lib/v2InputRegister.ts` (de vier labels REQUIRED / JUDGEMENT / NICE / V1_LEGACY en hun zinnen), `src/lib/v2Guided.ts` (de vijftien schermen en de vier regels in de kop), `src/lib/v2Settings.ts`, en `src/lib/engine2/optimizer/worker.ts` + `scanRequest.ts` — die twee zijn de autoriteit over wat de grens naar de engine oversteekt, nooit een commentaar. Verder `README.md` (sectie Engine v2) en `docs/vuistregels_en_wat_de_engine_doet.md`.
>
> **Werkafspraken (ongewijzigd).** Nederlands. Inventaris vóór wijziging. Meten, niet toeschrijven. Golden refs zijn de autoriteit. Geen bewerkingen tijdens een lopende verificatie. De engine levert het veld, niet het oordeel — dat geldt ook voor de UI: de shortlist is een weergave, geen rangorde van "beste". P4 blijft staan: geen verborgen standaardwaarden.
>
> **Het probleem in Sanders woorden.** De UI moet logisch zijn én nuttig. Invoervelden die geen effect hebben op de optimizer of de uitkomst moeten verdwijnen. Expert en Guided moeten echt verschillen: Guided moet boven alles eenvoudig zijn, maar verstandig.
>
> ---
>
> ### Fase 0 — Veldinventaris door meting (geen wijziging)
>
> **Wat er al ligt, en waar je op voortbouwt in plaats van het opnieuw te doen.** `v2InputRegister.ts` (I-1) heeft 82 rijen onder vier labels, met zes `v1-legacy`-rijen (sinds U-5c ook `phasePriority`, het bedradingsgat). `V2_FORM_FIELDS` en `V2_UNGOVERNED_ROWS` (U-3b) bepalen per bestuurd formulier wat zichtbaar is. U-1 heeft de v1-lade al weggehaald en de v1-knoppen met een badge laten staan. U-5c heeft twee dode velden gevonden en gemarkeerd (de Priority-schuif op de v2-route, en `Source R disqualify` op een tweeweg). Lees die entries in `CLAUDE.md` vóór je begint. Een bevinding die daar al staat, rapporteer je als *bekend* en niet als nieuw.
>
> 1. **Inventariseer élk invoerveld in de app, op élke tab**: Setup, Project/Import, Drivers, Filters en de bandformulieren, Network, Settings, guided en grafiekbesturing. Niet alleen de registerrijen. Een veld zonder registerrij is zelf een bevinding.
> 2. **Doe per veld een statische trace.** Vraag: bereikt het de payload van `handleV2Request`? Volg daarvoor `scanRequest.ts` en `worker.ts`, en nooit een commentaar. Overschrijft de kandidaatverklaring het (`declareCandidateChoices`, `withDeclared*`, `chainChoices.ts`)? Leest alleen `buildReport` het, of alleen een grafiek? Of leest niets het? Noteer bij elk veld ook voor welke route dat geldt: drieweg, tweeweg, Hybrid mode gemeten of mager, en de terugval zonder afleidbaar A5d.3-veld. Een v1-knop kan in die terugval nog werken (I-1).
> 3. **Meet daarna per veld, en goedkoop. Ketenruns kosten op casus 1 15–55 minuten per stuk, dus een ketenrun per veld kan niet.** Meet daarom in deze volgorde, en stop zodra een veld geclassificeerd is:
>    - (a) **Payload-diff**: bouw het v2-verzoek zoals de app het bouwt, vóór en ná het veld op twee waarden en op leeg. Vergelijk de geserialiseerde payload, `candidateFieldKey` en de run-vingerafdruk. Kosten: seconden.
>    - (b) **Rapport-diff**: `buildReport` vóór en ná. Vergelijk de poortstatussen en de metriekwaarden. Kosten: seconden.
>    - (c) **Alleen voor velden die (a) en (b) niet beslechten**: één ketenrun per arm op de kleine parsers-fixture, het precedent van `h2bLeanForm` (17–80 s).
>
>    Fixtures: casus 1 (set `'m3'`), casus 1b (tweeweg) en casus 1h (hybride, voor de velden die van Hybrid mode afhangen). Draai daarnaast de twee demobundels door `buildEngineV2Input`, het pad van de app. Een veld dat in de app iets doet en in de fixtures niet, is precies wat je zoekt.
> 4. **Ken elk veld per route één effectklasse toe:**
>    - **ZOEKT**: verandert de payload of de vingerafdruk, dus welke netwerken er kunnen komen.
>    - **OORDEELT**: verandert alleen poortstatussen of het rapport.
>    - **TOONT**: verandert alleen een grafiek, een sortering of de weergave.
>    - **NIETS**: geen meetbaar effect. Dat geldt bijvoorbeeld voor een waarde die de verklaring overschrijft, voor een veld dat alleen v1 leest terwijl geen route door de UI v1 nog bereikt, en voor de U-5c-gaten.
> 5. **Noteer de afhankelijkheden.** Velden die alleen tellen als een ander veld gezet is: de `active*`-velden onder `activeSideOn`, een piekvermogen zonder nominale last, de klasse zonder marge, het maximum onder `series-r-max`. Noteer de ouder erbij. **Een veld dat alleen NIETS doet omdat zijn ouder uit stond, is géén NIETS-veld.**
>
> **Wat je levert:**
> - `docs/U-9_veldinventaris.md`: één tabel met per veld de tab, de registerrij (of "geen"), het label, de trace, het gemeten effect per route en fixture, de klasse, de ouder, wat er nu zichtbaar is in guided en expert, je voorstel, en of het al bekend is (met de sessie die het vond).
> - `scripts/measure-u9-field-effects.ts`, dat de tabel van (a) en (b) opnieuw opwekt. Het precedent hiervoor: een controle die alleen in een sessieverslag bestaat, kan niemand herhalen.
> - Daaronder de samenvatting: hoeveel velden er per klasse zijn, welke velden NIETS doen op élke route en welke alleen op sommige, en welke velden geen registerrij hebben.
>
> **Stop daarna en wacht op Sanders akkoord op de NIETS-lijst.** Er wordt niets verborgen, verplaatst of gemarkeerd in deze fase. Er draait ook geen suite tijdens de meting (de H-2-regel), en geen browserrun naast een testlaag.
>
> ---
>
> ### Fase 1 — Verbergen wat niets doet
>
> - Het register krijgt een veld `effect: 'zoekt' | 'oordeelt' | 'toont' | 'niets'`, gevuld uit de meting van fase 0 — data, geen documentatie, net als de rest van het register.
> - Een veld met `effect: 'niets'` wordt **in geen enkele modus** gerenderd. De v1-lade is sinds U-1 al weg. Wat er nu nog staat zijn de gebadgede v1-knoppen. Wil je die óók verbergen, dan vraagt dat een besluit tegen U-1/I-1 in (zij werken nog in de terugval), en dat leg je voor. **Verbergen, niet verwijderen**: de waarden blijven in het projectbestand staan, een oud project opent ongewijzigd, en de bestaande eenmalige melding over v1-instellingen blijft werken. De v1-motor zelf blijft onder water bestaan.
> - Afhankelijke velden verschijnen pas als hun ouder gezet is.
> - **Tests**: (1) elk gerenderd veld heeft een registerrij met `effect`; (2) een `niets`-rij wordt nooit gerenderd; (3) **voor elk `niets`-veld een perturbatietest** die aantoont dat de shortlist byte-identiek blijft — zo blijft de claim waar als iemand later de engine aanpast. Faalt die test ooit, dan is het veld niet meer `niets` en moet het terug in beeld.
>
> ---
>
> ### Fase 2 — Expert: alles wat iets doet, in de volgorde van het ontwerpen; v1 verdwijnt uit beeld
>
> **Uitgangspunt.** Fase 0 en 1 zijn af (`c06e4ad`). Lees eerst `docs/U-9_veldinventaris.md`, en dan vooral de samenvatting, N1–N7 en "Wat deze meting niet dekt". De tellingen: 138 velden, waarvan 90 ZOEKT, 16 OORDEELT, 28 TOONT en 4 NIETS (die vier zijn verborgen). **50 velden hebben geen registerrij, en 35 daarvan sturen de zoektocht (N2).** Het register is de bron van waarheid voor dit paneel, en dat werkt pas als élk veld erin staat. Daarom komt dat eerst.
>
> **BESLUIT B-2 — v1 WORDT UITGEFASEERD (Sander, 25-10-2026).** Engine v2 is sinds U-1 de enige route, en wat alleen v1 bedient hoort niet meer in beeld. "v1" betekent in deze app drie verschillende dingen, en elk krijgt een eigen behandeling. Lees ze goed uit elkaar:
> 1. **Velden onder een v1-kopje die de v2-zoektocht sturen (N2)** zijn géén v1. Het gaat om de gewichten, de trapmethode, de akoestische hellingen, de snap-voorkeuren en de rest van de 35. Zij **blijven**, verhuizen naar hun groep (stap 2) en verliezen het v1-kopje. Een kopje met "v1" boven een veld dat de v2-tuner stuurt, vertelt de gebruiker iets onwaars.
> 2. **De v1-vergelijking in de UI verdwijnt.** Dat zijn #93 BOM-plafond, #94 Ontwerpniveau en #126 de v1-drempels (ka-tier, c-t-c, breakup-harmonische, `xoWinThr`). Daarbij hoort de v1-ranglijst naast de shortlist, met haar kop ("v1 reading — not the route that made this run"), de per-rij v1-noot en de lege-shortlist-zin die naar die ranglijst verwijst. Ze worden **verborgen zoals de NIETS-vier**, in geen enkele modus getekend, en de waarden blijven in het projectbestand. Verberg de velden en de tabel samen: een tabel zonder de knoppen die haar sorteren kan niemand meer verklaren, en knoppen zonder tabel zijn dood.
>    - Let op UI-1: de regel dat er nooit een rij geladen wordt die v2 weigerde, hangt aan `selectFromShortlist` en niet aan deze tabel. Laat `selection.test.ts` dat blijven pinnen.
>    - Pas de U-1/UI-1-bronscans die de v1-tabel pinnen aan in de V15-vorm: noteer wat er stond, wat er nu staat en waarom. Versoepel er niets aan.
>    - Wordt er dan nog iets in die tabel getoond, bijvoorbeeld bij `scan-only` uit U-6b, waar een run geen shortlist maar wel een scantabel heeft? Rapporteer dat dan vóór je verbergt.
> 3. **De v1-motor onder water blijft staan, onaangeroerd.** Dat zijn `runChainScan`, `runChain3Scan`, de v1-ranking, de terugval zonder A5d.3-venster (die de verborgen velden nog leest) en `toggleRegression`, die de invariant bewijst dóór v1 te draaien. **Verwijderen is een eigen vervolgsessie (U-10), en die vraagt eerst twee dingen:** (a) dat v2 in de terugval zelf iets doet, namelijk melden of weigeren in plaats van stil v1 te lezen, en (b) dat de toggle-invariant een nieuwe vorm krijgt. Noteer dat aan het eind van je rapport als open punt, met deze twee voorwaarden.
>
> **Stap 0 — Leg de twee overgebleven besluiten aan Sander voor, vóór je iets bouwt.** Eén `AskUserQuestion`, en wacht op het antwoord.
> 1. **Velden die op de ene route iets doen en op een andere niets**: #102 Source-R-diskwalificatie, #103 DI-anker en #120/#121 de akoestische hellingen. Wat moet ermee: (a) per route verbergen, of (b) tonen met "doet niets op deze route"? Sinds U-5c staat bij #102 al een melding. Kies één regel voor alle vier. Dit zijn **geen** v1-velden: op de drieweg sturen ze v2.
> 2. **N1, de Priority-schuif.** Ook dit is geen v1-veld: de v2-tuner leest hem. Alleen de ontwerpstap en de synthese krijgen de vaste 50/50. Moet de schuif blijven staan met een badge die dat zegt? Het engine-besluit (de verklaring de schuif laten lezen) valt buiten deze sessie.
>
> **Stap 1 — Een registerrij voor elk veld dat iets doet.**
> - Geef de 50 velden zonder rij er een. Begin met de 35 die ZOEKEN: #95–#121 en #50–#53. Leg per rij de klasse, de bron, wat leeg betekent en het `effect` uit fase 0 vast. Neem het effect over uit de meting en niet uit je eigen inschatting. Rijen voor velden die door B-2.2 verborgen worden, krijgen `effect: 'niets'` met de reden "v1-uitfasering (B-2)".
> - Zet de bevindingen recht in de bestaande rijen: N3 (de hellingen sturen óók de vensters), N4 (S_d als NOODZAKELIJK, terwijl de route hem nauwelijks leest; meld dit en verander de klasse niet zonder meting), N5 (f_b op de kaart stuurt de part-audit en de tweeweg-ontwerpstap), N6 (f_max van het grafiekbereik is het plafond van de geoordeelde band) en N7 (de offset en trim van de aanpassing gaan de keten in).
> - **Repareer één afhankelijkheid die fase 1 te smal zette**: de tweeweg-scanstappen staan alleen onder de pin, terwijl het volle veld ze ook leest. Ze horen te verschijnen bij een pin **of** bij het volle veld, net als de drieweg-scanstappen. Gebruik de bestaande vorm van `V2_DEPENDENT_CONTROLS`, en laat de guard-test dit pinnen.
> - Verbreed test (1) van `u9FieldEffects.test.ts` van "het register en de bestuurde formulieren" naar **de hele app**. Elke `<input>` en `<select>` buiten de genoemde uitzonderingen moet precies één registertoken raken. Dit is de U-3b-drift-guard over alle tabs.
>
> **Stap 2 — De groepen, uit het register en niet uit `App.tsx`.** Een veld krijgt een `group`, en de volgorde staat als data:
> **Architectuur** (Hybrid mode, wegen; dit bepaalt wát er ontworpen wordt, dus het staat eerst, de H-2-regel) → **Metingen & geometrie** → **Versterker & belasting** → **Driverbescherming** → **Kruisvenster & topologie** → **Bouwbaarheid** → **Doelcurve & voicing** → **Run & shortlist**. Er komt **geen** v1-groep.
> - Het Filters-paneel toont die groepen in die volgorde. De v1-secties (Goals & weighting, Filter shape, Crossover, Driver limits, Components, Targets) verdwijnen als kopje, en hun velden gaan naar de groep waar het effect ze plaatst.
> - Badges en zinnen die "v1" zeggen op een veld dat de v2-route stuurt, verdwijnen. De U-1-badge `v1Legacy` blijft alleen staan op wat écht v1-alleen is, en dat is na B-2 in de UI niets meer zichtbaars. Controleer dat met een bronscan.
> - **Eén veld staat op één plek.** Een veld verhuist, maar wordt nooit verdubbeld en nooit afhankelijk van een vlag op twee plaatsen getekend; dat is de faalvorm uit U-3b. Velden die bij de meting horen (Setup, driverkaart, Network, grafiekbereik) blijven waar ze nu staan. Hun registerrij noemt wel hun groep, zodat het paneel kan zeggen "staat op de driverkaart".
>
> **Stap 3 — Elk veld zegt wat het doet.**
> - Zet bij elk getoond veld een kleine badge met **zoekt / oordeelt / toont**, afgelezen uit `effect`, en de **bron** (datasheet / naamplaat / meting / keuze).
> - Een gesteld veld houdt "stated by you on <datum>". Een leeg veld houdt de zin uit het register over wat leegte kost (`v2Empty`).
> - **Het zwaarste punt van fase 0 (N2, P4).** De 35 velden die de zoektocht sturen zonder registerrij hebben bijna allemaal een startwaarde van de **app** (een `useState`-initiaal). Niemand heeft die waarden gesteld, en toch sturen ze de zoektocht. Verberg ze niet en verander ze niet. Laat ze wél zeggen wat ze zijn: een ZOEKT-veld dat op de app-startwaarde staat, krijgt de markering **"app default — not stated by you"**, met de waarde erbij. Die markering verschilt zichtbaar van "stated by you on <datum>". Een eerste bewerking maakt er een gestelde waarde van, met datum, langs de bestaande `stampStated`-weg. De startwaarden lees je uit de broncode (zoals het meetscript van fase 0 dat al doet) en typ je nergens over. Een bronscan pint dat elk ZOEKT-veld met een app-startwaarde die markering draagt. Dit is een **weergave** en geen gedragswijziging: geen enkele run beweegt erdoor, en de perturbatietests bewijzen dat.
> - Een afhankelijk veld zonder ouder blijft verborgen (fase 1). Een ouder die zichtbaar is maar nog niet gezet, zegt in één regel wat er verschijnt als je hem zet.
>
> **Buiten scope.** Guided (dat is fase 3). Engine, poorten, budgetten, venster en corpus. N1 in de engine, en een V-nummer voor N1. **De v1-motor verwijderen** (zie B-2.3; dat is U-10). Geen enkele zin uit het register wordt herschreven, behalve de rechtzettingen van stap 1. Geen veld dat de v2-route stuurt verdwijnt.
>
> **Acceptatie fase 2.**
> 1. Elk getoond besturingselement in de app heeft een registerrij met `effect` en `group` (de verbrede test 1). De opzettelijke breuk (één `<input>` zonder rij) zet hem op rood.
> 2. In de UI is niets v1-alleen nog zichtbaar: de drie velden van B-2.2 en de v1-ranglijst staan in geen enkele modus in beeld. Pin dat met een bronscan op hun guards. Een perturbatietest toont aan dat het verbergen van de drie velden de v2-invoer byte-identiek laat. De v1-motor en `toggleRegression` staan ongewijzigd en groen.
> 3. De groepvolgorde wordt uit het register gelezen. Een bronscan pint dat `App.tsx` geen eigen volgorde typt.
> 4. Geen veld wordt op twee plaatsen getekend. Pin dit met een bronscan: één tekenpunt per registertoken.
> 5. De perturbatietests van fase 1 blijven groen, net als de bestaande guards: `v2InputRegister`, `v2InputPlacement`, `v2Guided`, `v1Carryover`, `selection`, `toggleRegression`, beide byte-baselines en `p6Lint`. Waar een guard de v1-tabel pinde, staat de aanpassing in de V15-vorm.
> 6. Browsercontrole op de driewegdemo, de tweewegdemo en een hybride project: Expert → Filters, elke groep, plus de shortlist na een run (geen v1-tabel meer). Doe dat op desktop én smal, en in EN én NL. De badges kloppen met de tabel in `U-9_veldinventaris.md` op een steekproef van tien velden, die je bij naam noemt.
> 7. Een oud project (van vóór U-9) opent, en elk gesteld veld staat er nog met zijn waarde, ook de verborgen v1-velden. De U-1-melding noemt ze. Een veld dat al van de app-startwaarde af stond, leest als gesteld (met "date not recorded", de E-2-regel) en niet als app-default.
> 8. `npm run test:fast` alleen gedraaid, op de boom die gecommit wordt (de H-2-regel). Een volle run is niet nodig, omdat er geen engine- of zoekwijziging is. Zeg dat in de commit. Sluit af met het open punt U-10 en zijn twee voorwaarden.
>
> ---
>
> ### Fase 3 — Guided: eenvoudig, maar verstandig
>
> **Uitgangspunt.** Fase 0–2 zijn af en gepusht (`c06e4ad`, `65eadca`). Lees eerst de fase-2-sectie onderaan `docs/U-9_veldinventaris.md` en de U-9-guards in `CLAUDE.md`. Wat er nu ligt en waar je op bouwt:
> - **Het register** heeft 124 rijen, elk met `effect` en `group`, en de acht groepen staan als data (`V2_FIELD_GROUPS`).
> - **`appDefaults.ts`** is het ene huis van de app-startwaarden, met de markering "app default — not stated by you".
> - **`V2StatedBy`** (sinds U-3) zegt WIE een veld stelde als het niet de kijker was. Gebruik dat voor de profielen en vind geen tweede attributie uit.
> - **Guided** heeft zes stappen (`guidedStages`). De stap "What it must meet" (`v2Guided.ts`) telt nu **16 schermen**: Hybrid mode plus vijftien eisen. Een beginner kan de meeste van die getallen niet weten.
> - **De Wizard** ("Walk me through it" in guided, "🧙 Wizard" in expert) tekent een deel van de zoekvelden opnieuw. Fase 2 hield hem bij naam buiten de driftguard, met de mededeling "de Wizard komt in fase 3".
>
> **Doel.** Van meetset naar shortlist met **hooguit vijf vraagschermen** in de stap "What it must meet". Elke vraag is te beantwoorden met kennis die een DIY-bouwer heeft zonder datasheetstudie. De stappen voor project, kast en drivers blijven invoer van metingen; daar vraag je niets wat de meting al weet.
>
> **Stap 0 — Twee besluiten aan Sander, vóór je bouwt.**
>
> **B-1, de profielwaarden.** Het principe is goedgekeurd: een profiel stelt pas iets **als de gebruiker het kiest**, elke waarde draagt "stated via profile <naam> on <datum>" (via `V2StatedBy`), is in Expert zichtbaar en te overschrijven, en staat per poort in het rapport. **De getallen zijn nog niet goedgekeurd.** Lever ze in één tabel en wacht op akkoord:
> - Per profiel en per registerrij: de waarde, de **onderbouwing** (literatuur, `docs/vuistregels_en_wat_de_engine_doet.md`, of een meting uit het casusboek met de naam erbij), en wat er gebeurt als de waarde te streng of te ruim is.
> - **Generiek, niet Koan.** Casus 1's getallen (2,6 Ω vloer, NAD-piekvermogen, 1,0 Ω serie-R) horen bij Sanders versterker en kast. Gebruik ze alleen als tegenproef ("een Koan-project haalt dit profiel"), niet als profielwaarde.
> - **"Ik weet het niet" is een profiel zonder waarden.** Het stelt niets, en de knop zegt wat dat kost.
> - Leg de tabel aan Sander voor, met de getallen in je bericht en niet alleen in een bestand. Stel `AskUserQuestion` alleen voor wat je echt niet kunt afleiden.
>
> **B-3, de Wizard in Guided.** Meet eerst wat hij in guided werkelijk schrijft (de fase-0-techniek: welke keteninvoer beweegt). Leg dan voor:
> - (a) de Wizard verdwijnt uit Guided, en zijn bruikbare vragen gaan op in de vijf;
> - (b) hij blijft als "meer controle"-route met de fase-2-badges;
> - (c) iets anders, op grond van wat je meet.
>
> **Stap 0b — Eén klein ding uit fase 2.** De tweeweg-crash (`polarityBranchOf` las `tAdjust` vóór de declaratie, sinds H-4) is gerepareerd zonder test. Voeg een bronscan toe die pint dat `polarityBranchOf` geen `const` leest die in `runVfOptimize` pas later gedeclareerd wordt. Doe dit met de opzettelijke breuk erbij.
>
> **Stap 1 — De vijf vragen, en waar elke eis heen gaat.** Lever eerst een **toewijzingstabel**: elk van de 16 huidige schermen (en elke OORDEELT-rij van het register) landt op precies één van drie plaatsen:
> - **een guided-vraag**, die hem via een profiel of een keuze schrijft;
> - **afgeleid**, uit de meting, met de rij die het afleidt;
> - **alleen in Expert**, bij naam, met de zin die Guided erover laat zien.
>
> Voorstel om mee te beginnen; jij mag het verbeteren, maar zeg waarom:
> 1. **Wat bouw je?** Volledig passief / Hybrid mode (woofer op eigen versterker en DSP). Hybride vraagt een overnamefrequentie, en die heeft geen default (P4). Weet de gebruiker hem niet, dan zegt Guided "regel Hybrid mode in Expert" en gaat passief verder. Het passieve pad heeft **geen verplicht getalveld**.
> 2. **Welke versterker?** Profielkeuze. Schrijft de vloer, het vermogen en het piek/nominaal-paar, en EPDR/dissipatie als het profiel dat onderbouwt.
> 3. **Hoe zwaar wordt hij belast?** (rustig luisteren / stevig / feesten) Profielkeuze. Schrijft de driverbescherming (M-C, excursiemarge) en het thermisch ontwerpvermogen.
> 4. **Wat wil je bouwen?** (zo eenvoudig mogelijk / gebalanceerd / zoveel als nodig) Profielkeuze. Schrijft de bouwbaarheid, het niveauwerk op de laagste weg en, als het profiel dat onderbouwt, de kwaliteitseisen (SPL-venster, fasesporing, LF-bult, Q_es).
> 5. **Hoe moet hij klinken?** Vlak / met een basplateau (een keuze uit dieptes, geen getalveld). Dit is de voicing; neutraal is gesteld door hem te kiezen (I-3).
>
> **Stap 2 — De regels die Guided houdt.**
> 1. **Vraag in begrippen, niet in getallen.** Elke keuze laat zien welke registerrijen zij schrijft, met hun waarden ("dit stelt: vloer 3,2 Ω, piek 200 W …"), zodat niets onzichtbaar gesteld wordt. Guided schrijft dezelfde staat als Expert: één projectstaat, twee weergaven (I-3, regel 2).
> 2. **"Weet ik niet" is altijd een knop.** Hij betekent: niet gesteld, dus niet beoordeeld, en die consequentie staat op de knop. Overslaan wist (I-3).
> 3. **Wat Guided niet vraagt, wordt niet verzwegen.** Op het eindscherm staan:
>    - "Deze eisen zijn niet beoordeeld" als één inklapbare regel met een link naar Expert (`describeSkipped`);
>    - "N eisen gesteld in Expert" als die er zijn. Guided negeert ze nooit stil, en een profielkeuze overschrijft geen waarde die in Expert gesteld is zonder dat te zeggen;
>    - **"N instellingen sturen de zoektocht op een app-startwaarde"**: de fase-2-markering, geteld en inklapbaar. Guided vraagt ze niet, maar verzwijgt ze ook niet (N2/P4).
> 4. **Resultaat zonder oordeel.** De guided-shortlist sorteert op een sleutel die de gebruiker kiest (minste onderdelen / laagste kosten / vlakste respons) en noemt die sleutel. Er komt geen "aanbevolen"-kroon die de engine niet uitsprak.
> 5. **Eén primaire knop per scherm**, voortgang zichtbaar, en alle nieuwe teksten in **EN en NL** (`src/i18n/nl.ts`).
>
> **Stap 3 — De profielen als data.** Na Sanders akkoord: `src/lib/guidedProfiles.ts`, één bestand met per profiel de waarden en per waarde de herkomst (de onderbouwing uit B-1, in een veld en niet in een commentaar). Een profiel kiezen schrijft via dezelfde setters als Expert (`setV2Field`, `setAmpMinLoadOhm`, …) en zet `V2StatedBy` op de profielnaam. Een latere bewerking in Expert wist die naam, en dan is het getal van de gebruiker (U-3-regel).
>
> **Buiten scope.** Engine, poorten, budgetten, venster en corpus. Nieuwe eisen of nieuwe metrieken. N1 en U-10 (de v1-motor). Expert verandert niet, behalve dat het de profielherkomst toont. Een profielwaarde die niet door Sander is goedgekeurd, gaat de code niet in.
>
> **Acceptatie fase 3.**
> 1. De B-1-tabel met onderbouwing per waarde, en Sanders akkoord, vóór er een profielwaarde in de code staat. B-3 is beslist.
> 2. De toewijzingstabel staat in `docs/U-9_veldinventaris.md` (fase-3-sectie). Een test pint dat **elke** OORDEELT-rij van het register precies één bestemming heeft: een guided-vraag, afgeleid, of "alleen in Expert" bij naam. Dat is de I-3-regel "het aantal is afgeleid, niet getypt" in nieuwe vorm. Een nieuwe eis zonder bestemming breekt de build.
> 3. Vanaf een vers project met de KOAN-demo kom je naar een shortlist in **≤ 5 vraagschermen** in "What it must meet", **zonder één verplicht getalveld** op het passieve pad. Leg het aantal vast in een test.
> 4. Profielattributie: een gekozen profiel toont "stated via profile …" in Guided én Expert, staat per poort in het rapport, en wordt gewist bij een eigen bewerking. Leg vast met een test, plus een bronscan dat geen profielwaarde buiten `guidedProfiles.ts` getypt staat (P6).
> 5. Moduswissel midden in een project behoudt alles. Een vóór U-9 bewaard project opent, en niets wat gesteld was gaat verloren of wordt door een profiel overschreven.
> 6. De Wizard volgens B-3. De fase-2-driftguard dekt hem daarna wél, of noemt hem bij naam met de reden.
> 7. De stap-0b-bronscan staat, met de opzettelijke breuk.
> 8. Browsercontrole: elk guided-scherm op de driewegdemo, de tweewegdemo en het hybride pad, op desktop en 375 px, in EN en NL, met één volledige run tot de shortlist. Kijk de screenshots zelf na voordat je klaar meldt.
> 9. `npm run test:fast` alleen gedraaid, op de boom die gecommit wordt. Geen volle run, want er is geen engine- of zoekwijziging; zeg dat in de commit.
> 10. Afsluitend: de gewijzigde bestanden, wat er níet gedaan is en waarom, en de open punten (U-10, N1).
>
> ---
>
> ### Buiten scope voor heel U-9
>
> Engine, poorten, metrieken, budgetten, venster en corpus. Het verwijderen van de v1-motor (U-10). Nieuwe eisen. Wie tijdens het werk een engine-fout vindt, boekt die als V-nummer en repareert hem niet in deze sessie. De uitzondering die fase 2 al maakte: een crash die de app onbruikbaar maakt, met een aparte vermelding in de commit.
