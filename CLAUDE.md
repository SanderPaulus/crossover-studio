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
- **TWEELAGENBELEID SINDS V43 — LEES DIT VOORDAT JE DE SUITE DRAAIT.** De volle run wordt
  vrijwel geheel gedragen door de twee live ketenruns (bij V42 nagemeten op 1427 s + 653 s).
  Een suite die niemand tijdens het werk draait beschermt niets, dus:
  - `npm run test:fast` — **de standaard tijdens ontwikkeling.** `vitest run -t '^(?!.*\[live\])'`,
    dus alles behalve wat de tag `[live]` draagt. **Gemeten 29-08-2026 (V43): 289 s (4 min 50),
    129 bestanden, 1425 tests en 2 overgeslagen** — tegen 3150 s voor de volle run. Wat er dan
    overblijft als langste bestand is `threeWayChain` (289 s), dus de snelle laag IS die ene
    ketenrun; korter kan alleen door daar iets aan te doen. **Meet hem op een LEEG systeem, en
    deze waarde is de REFERENTIE — overschrijf hem nooit met een belaste meting:** dezelfde run
    vlak na de vier uur durende regeneratie kostte 1348 s, viereneenhalf keer zo veel, zonder dat
    er iets aan de suite veranderd was. Bij V44 hetzelfde patroon en dus geen nieuwe referentie:
    906 s, óók vlak na een regeneratie. **Ná UI-1 (01-09-2026) gemeten op 289 s — 136 geslaagd
    + 1 overgeslagen bestand, 1503 tests + 2 overgeslagen** (+1 bestand,
    `optimizer/selection.test.ts`, 8 claims). Dat is exact de V43-referentie op dezelfde machine,
    dus de laag is niet duurder geworden. **Ná de splitsing van 01-09-2026 gemeten op 361 s
    (135 geslaagd + 1 overgeslagen bestand, 1495 tests + 2 overgeslagen) — en dat is GEEN nieuwe
    referentie:** `threeWayChain` alléén kostte in diezelfde run 361 s tegen de 289 s van V43, dus
    wat er beweegt is de machine en niet de laag. Het overgeslagen BESTAND is nieuw en klopt: de
    verhuisde verwerpingsrun is een bestand dat volledig uit `[live]` bestaat.
    **Ná V51 (03-09-2026) gemeten op 292 s — 145 geslaagd + 2 rode + 1 overgeslagen bestand,
    1636 geslaagd + 5 rode + 2 overgeslagen tests, op een lege machine ná de regeneratie**
    (+3 bestanden: `levelWork.test.ts` 3 claims, `engine2/ingest/wiring.test.ts` 4,
    `optimizer/lowestWayLevelWork.test.ts` 4 — die laatste kost 145 s aan ketenruns op de kleine
    fixture; +3 in `targetCurve.test.ts`, +2 in `buildabilityGate.test.ts`, +7 in
    `frozenNetlistGates`; en de `it.each` over het levende corpus ging van zeven naar ÉÉN, dus
    −6 — de corpusgrootte in de testtelling, opnieuw). De vijf rode claims waren drie V51-guards
    die de doelcurve niet meekregen, de V50-opnameregel die op 0,05 W tegen een 2 %-klasse aanliep,
    en het byte-gepinde V50-oordelenblok dat twee nieuwe parameters zag; alle vijf gerepareerd en de
    bestanden apart groen (frozenNetlistGates 168 s, f4cRegression 50 s). GEEN nieuwe referentie: de
    V43-waarde van 289 s blijft staan.
    **Ná V50 (03-09-2026) gemeten op 283 s — 143 geslaagd + 1 overgeslagen bestand en één rood
    bestand (`f4cRegression`, twee claims die het V50-oordelenblok kregen), 1619 + 2 overgeslagen
    tests; +2 bestanden (`metrics/buildability.test.ts` 7 claims, `optimizer/buildabilityGate.test.ts`
    12 claims) en +6 claims in `frozenNetlistGates`; ná de reparatie +2 in `f4cRegression`.** GEEN
    nieuwe referentie: de V43-waarde van 289 s blijft staan. De regeneratie liep ERNAAST niet:
    de snelle laag is gedraaid nadat de generator klaar was.
    **Ná V49 (03-09-2026) gemeten op 284 s (eerste run, met vier rode claims die gerepareerd zijn)
    en daarna groen — 142 geslaagd + 1 overgeslagen bestand, 1596 geslaagd + 2 overgeslagen**
    (+2 bestanden: `metrics/driveExcursion.test.ts` 15 claims en `optimizer/driveCeiling.test.ts`
    13 claims; +13 claims elders: zes V49-blokken in `frozenNetlistGates`, vier in `goldenCasus1`
    (één `it.each` over drie drivers), één feiten-variant in `determinism`). GEEN nieuwe
    referentie: de V43-waarde van 289 s blijft staan. **LET OP: de tweede snelle run liep NAAST
    een vite-dev-server** (de browsercontrole van het paneel) en is daarom niet als tijd genoteerd.
    **Ná UI-2 (02-09-2026) gemeten op 279 s — 140 geslaagd + 1 overgeslagen bestand,
    1555 geslaagd + 2 overgeslagen** (+2 bestanden: `lib/chartView.test.ts` 6 claims en
    `lib/networkReadiness.test.ts` 26 claims, waarvan achttien de mutatietabel als `it.each`).
    GEEN nieuwe referentie: de V43-waarde van 289 s blijft staan.
    **Ná V48 (02-09-2026) gemeten op 285 s — 138 geslaagd + 1 overgeslagen bestand,
    1523 geslaagd + 2 overgeslagen**, apart gedraaid op een lege machine ná de volle run en
    NOOIT ernaast (zie de geheugenles daar). GEEN nieuwe referentie: de V43-waarde van 289 s
    blijft staan, dit is dezelfde laag op dezelfde machine en vier seconden is ruis.
    **Ná de V47-nazorg (01-09-2026) gemeten op 276 s — 137 geslaagd + 1 overgeslagen bestand,
    1510 tests + 2 overgeslagen** (+1 bestand, `engine2/corpusPairing.test.ts`, 7 claims).
    **Twee dingen daarbij.** (i) 276 s is GEEN nieuwe
    referentie: de V43-waarde van 289 s blijft staan, dit is dezelfde laag op dezelfde machine en
    het verschil is ruis. (ii) **DE TELLING SLUIT WEL, EN DE V47-NAZORG LAS DE VERKEERDE REGEL —
    rechtgezet bij V48 (02-09-2026), zonder te hermeten, want `git ls-tree` beantwoordt de vraag
    exact.** Zij noteerde dat 137 + 1 mínus dit ene bestand niet op de post-splitsingsregel
    uitkwam (135 + 1, 1495) en liet het als onopgelost staan. De regel die zij had moeten lezen
    staat érbóven: de UI-1-regel, 136 + 1 en 1503 tests — en 1503 + 7 = 1510 klopt precies. Het
    aantal testbestanden per commit, geteld met
    `git ls-tree -r --name-only <commit> src | grep -cE '\.test\.tsx?$'`: V47 `fb8f211` 135,
    de splitsing `9b16f8e` 136, UI-1 `047b452` 137, de nazorg `a30b6ee` 138 — één erbij per
    oplevering, precies zoals elke regel het zegt. **Waar het ontspoorde is de VOLGORDE binnen deze
    alinea: de UI-1-zin staat vóór de splitsingszin terwijl UI-1 de látere commit is, dus wie de
    dichtstbijzijnde voorgaande ZIN pakt voor de dichtstbijzijnde voorgaande COMMIT pakt er één
    te ver terug.** Er is dus geen verkeerd overgenomen telling en er is niets weggeraakt.
  - `npm test` / `npx vitest run` — **de volle run, en hij is VERPLICHT** bij elke wijziging aan
    het corpus en vóór elke commit die de zoektocht raakt. Precies dát is wat de twee live
    gevallen toetsen: dat de route nog steeds de bevroren netlist levert.
  - `npm run test:ci` — **wat GitHub Actions draait, en hij is een derde laag met een andere
    reden dan de eerste twee.** `test:fast` en de volle run verdelen naar TIJD; deze verdeelt naar
    PLAATS. `vitest run -t '^(?!.*\[live\])(?!.*\[bytes\])'`: alles behalve de acht tests die een
    live herberekend netwerk BYTE-VOOR-BYTE naast een opgeslagen fixture leggen. Die fixtures zijn
    opgenomen op darwin/arm64 onder Node 26 en zij reproduceren daar; ergens anders niet, en dat is
    gemeten (V46, zie de A5e.4-precisering hieronder). **De volle run blijft de acceptatie-
    autoriteit en verandert niet:** wat CI draait is een deelverzameling, geen vervanging.
    Wat er dan overblijft is met opzet de helft die er niet aan lijdt — de klasse-A/B-referenties
    en de poortcontroles op bevroren netlists (`goldenCasus1`, `goldenClassification`,
    `frozenNetlistGates` en vier metriekbestanden): rekenwerk op vaste netwerken, zonder zoektocht,
    en dus portable. **CI bewaakt de natuurkunde, de lokale suite bewaakt de bytes.**
    `ciLayer.test.ts` bewaakt die taakverdeling zelf.
    **Gemeten 01-09-2026 (ná de splitsing), lokaal op arm64/Node 26: 136 bestanden (135 geslaagd,
    1 overgeslagen), 1488 geslaagd, 9 overgeslagen, 283 s.** (V46 mat 134 / 1475 / 9 / 286 s.)
    Die negen zijn precies 2 `[live]` + 8 `[bytes]` − 1 die beide tags
    draagt; klopt dat aantal niet meer, dan is er een tag bij gekomen en hoort `ciLayer.test.ts`
    daarover te zijn gevallen. **De splitsing veranderde dit aantal NIET** — de verwerpingsrun
    droeg `[live]` al vóór de verhuizing — maar wel het aantal BESTANDEN: er is nu één bestand dat
    volledig uit `[live]` bestaat en dus in zijn geheel overgeslagen wordt. Lokaal groen zegt overigens NIETS over CI — dat is de hele
    bevinding — en of de laag op ubuntu/Node 22 groen is, is wat de workflow zelf beantwoordt.
  **Geen test verdwijnt; alleen WANNEER en WAAR hij draait is beleid.** De tag zit op de testNAAM
  en niet op het bestand — `casus1V2Candidates.test.ts` draagt ook dertien goedkope claims en die
  blijven in de snelle laag. Twee valkuilen, allebei in de sessie die de tag invoerde tegengekomen:
  (1) het filter matcht de VOLLEDIGE testnaam, dus een blok dat het woord in zijn eigen titel noemt
  filtert zichzelf weg — de bewaker heet daarom `the live-run tag is …` en niet `[live] …`;
  (2) een tag die stilletjes groeit maakt de snelle laag waardeloos, dus
  `casus1V2Candidates.test.ts` bewaakt met een bronscan dat er precies TWEE getagde blokken
  bestaan, met naam — één sinds de splitsing van 01-09-2026 twee werd, en `ciLayer.test.ts`
  bewaakt dezelfde inventaris van de andere kant. **Sinds die splitsing is het ENE bestand dat
  volledig uit `[live]` bestaat (`casus1V2Refusal.test.ts`) in de snelle laag een OVERGESLAGEN
  bestand; dat is geen verdwenen test maar hetzelfde beleid, één bestand verderop.**
- **A5e.4-PRECISERING (V46): BYTE-IDENTIEK GELDT PER (MACHINE, RUNTIME).** A5e.4 belooft dat twee
  runs met dezelfde seed byte-identiek zijn. Dat blijft staan en het is niet geschonden — maar het
  geldt binnen één machine en één runtime, en dat stond nergens. **Gemeten bij V46, op dezelfde
  machine en met alléén de Node-versie anders (26 → 22):** het ZAAD — een vast netwerk, zonder
  enige zoektocht — meet al anders op het vijfde significante cijfer (`avgDevDb`
  1,1610824868774228 → 1,1610684586317268), en de simplex loopt daarna naar een ÁNDER lokaal
  optimum: **L1 3,005 → 3,034 mH, C·R9 13,61 → 7,08 Ω, 102 259 → 91 194 evaluaties.** En
  linux-x64/Node 22 wijkt op zijn beurt af van darwin-arm64/Node 22, dus platform en runtime dragen
  onafhankelijk bij. **Afronden repareert dit niet:** bij een verschil in het laatste bit zou een
  `toPrecision`-stap volstaan; 3,005 tegen 3,034 mH is een ánder ontwerp, en een vergelijking die
  dát doorlaat bewaakt niets meer. **Gevolg voor de doctrine:** over machines heen geldt
  EQUIVALENTIE BINNEN DE TOLERANTIEKLASSEN, niet byte-gelijkheid. Een corpus dat elders wordt
  opgewekt is een LEGITIEM ander corpus en geen regressie — wie het daar regenereert krijgt zijn
  eigen, even geldige veld. Daarom leggen de byte-referenties sinds V46 hun machine en runtime
  zelf vast (`opgenomen_op` in `f4b2_v2_baseline.json`, `f4b2_v2_worker_baseline.json` en
  `casus1_v2_herkomst.json`, dat laatste geschreven door de generator), precies zoals V15 eist dat
  een referentie haar parameters vastlegt.
- **DE TWEE LIVE KETENRUNS DRAAIEN SINDS 01-09-2026 NAAST ELKAAR, EN DAT IS EEN SPLITSING VAN
  BESTANDEN EN NIET VAN TESTS.** `handleV2Request` is SYNCHROON: twee live ketenruns in één
  bestand blokkeren dezelfde event loop en draaien dus achter elkaar, op een machine met achttien
  kernen net zo goed als op één. Vitest parallelliseert over BESTANDEN. De verwerpingsrun is
  daarom, ongewijzigd, verhuisd naar `src/lib/engine2/casus1V2Refusal.test.ts`; beide describes
  dragen `[live]`, en `ciLayer.test.ts` plus de tagbewaker in `casus1V2Candidates.test.ts` leggen
  vast dat het er precies TWEE zijn, met naam. **Vóór/ná op één leeg systeem, 01-09-2026:
  1761,09 s (29 min 23) → 1254,43 s (20 min 55), dus 506 s eraf (−29 %).**
  **De winst is kleiner dan het verschil tussen de twee runs, en dat is de eerlijke helft van de
  meting:** naast elkaar draaien kost élke run tijd. De byte-run ging van 1119,6 naar 1244,3 s
  (+11 %), de verwerpingsrun van 637,7 naar 924,2 s (+45 %), en `threeWayChain` — dat er
  onveranderd naast staat — van 285,8 naar 517,4 s. De totale CPU-tijd steeg van 3615 naar
  4306 s. Wandkloktijd is dus gekocht met rekentijd; een voorspelling op `max(1120, 638)` ≈ 950 s
  was te optimistisch en de gemeten 1254 s is wat er staat.
- `npx vitest run` — volledige testsuite. **GEMETEN 03-09-2026 (V51): 148 bestanden, 1643 tests,
  1530 s (25 min 30), niets overgeslagen, alleen gedraaid op een lege machine met `nohup`.** De
  telling is +3 bestanden sinds V50 (`levelWork.test.ts`, `ingest/wiring.test.ts`,
  `optimizer/lowestWayLevelWork.test.ts`) en +18 tests: 11 in die drie, 3 in `targetCurve`, 2 in
  `buildabilityGate`, 7 V51-blokken plus 1 herankerd V50-blok in `frozenNetlistGates`, MIN 6 uit de
  `it.each` van `casus1V2Candidates` — het levende corpus ging van zeven naar ÉÉN netlist, en dat is
  opnieuw een corpusgrootte in de testtelling. Het corpus is bij V51 GEREGENEERD (2417 s, `V2_JOBS=8`)
  met de eis "geen niveauwerk op de laagste weg" en de weerstandspoort bij 10 W thermisch gewapend;
  veertien van vijftien kandidaten verworpen (dertien op de vloer, één op de mid-excursiegrens). De
  wandkloktijd ligt boven V50 om de reden die V42–V47 al noteerden: de byte-reproductie treft een
  ANDERE kandidaat — `466,5 · 1719` kostte in de generator 1745 s en in de volle run 1527 s, tegen
  768 s voor de verwerpingsrun ernaast. Eerste volle run direct groen; de snelle laag ervóór had vijf
  rode claims die vóór deze run gerepareerd zijn (zie de `test:fast`-regel).
  (De stand ervoor: **03-09-2026 (V50): 145 bestanden, 1625 tests,
  1362 s (22 min 42), niets overgeslagen, alleen gedraaid op een lege machine met `nohup`.** De
  telling is +2 bestanden sinds V49 (de twee bouwbaarheidstests, 19 claims) en +27 tests (19 daar,
  2 in `f4cRegression` voor het V50-oordelenblok, 6 V50-blokken in `frozenNetlistGates`). Het
  corpus is bij V50 GEREGENEREERD (2673 s, `V2_JOBS=8`) en kwam onderdeel-voor-onderdeel identiek
  terug — dezelfde zeven kandidaten, dezelfde acht weigeringen — dus de twee live ketenruns treffen
  dezelfde netlists en de wandkloktijd ligt op die van V49. **De EERSTE volle run van V50 (1356 s)
  viel op de byte-inventaris van `ciLayer` om** (het V50-oordelenblok van `f4cRegression` draagt
  `[bytes]`: zes namen, tien tests) en is na die reparatie in zijn geheel herhaald, want een run
  met één rood bestand is geen acceptatie (V47b-les).
  (De stand ervoor: **03-09-2026 (V49): 143 bestanden, 1598 tests,
  1352 s (22 min 32), niets overgeslagen, alleen gedraaid op een lege machine — losgekoppeld
  met `nohup`, want de Bash-tool kapt een achtergrondopdracht op tien minuten af en een volle
  run duurt er twintig.** De telling is +2 bestanden sinds V47b (de twee V49-testbestanden) en
  +39 tests (28 in die twee bestanden, 11 elders: zes V49-blokken in `frozenNetlistGates`, vier
  in `goldenCasus1`, één in `determinism`). Het cijfer beweegt niet met het corpus, want het
  corpus is bij V49 NIET geregenereerd: de twee live ketenruns treffen dezelfde kandidaten als
  bij V47b en de byte-reproductie slaagde — dat is het bewijs dat het afgeleide plafond de
  zoektocht op casus 1 nergens raakte.
  (De stand ervoor: **02-09-2026 (V47b): 141 bestanden, 1559 tests,
  1341 s (22 min), niets overgeslagen, alleen gedraaid op een lege machine.**) De telling is
  +2 bestanden sinds V48 (de twee UI-2-bestanden, `lib/chartView.test.ts` en
  `lib/networkReadiness.test.ts`, die de UI-2-regel bij `test:fast` al noemt) en +34 tests: 32 uit
  die twee bestanden en **TWEE uit de `it.each` van `casus1V2Candidates.test.ts`, die over het
  levende corpus loopt en van vijf naar zeven netlists ging** — opnieuw een corpusgrootte in de
  testtelling. Het cijfer ligt boven de 1116 s van V48 om dezelfde reden: de twee live ketenruns
  treffen een ander, groter veld. **De eerste volle run van V47b viel om op
  `networkReadiness.test.ts`** — de UI-2-mutatietabel las het levende `KAND-V2-1` en pinde er een
  onderdelentelling op; herankerd op `V48-KAND-1` (zie de V47b-guards) en de volle run daarna
  opnieuw gedraaid, want een run met één rood bestand is geen acceptatie.
  (De stand ervoor: **02-09-2026 (V48): 139 bestanden, 1525 tests, 1116 s (19 min), niets
  overgeslagen.**)
  **DRAAI DE LAGEN NA ELKAAR EN NOOIT NAAST ELKAAR — deze sessie liep op een GEHEUGENLIMIET
  en gooide er een halve volle run mee weg.** De volle suite spant een worker per kern op en
  twee daarvan dragen een live ketenrun; een tweede vitest-pool ernaast (hier: de snelle
  laag, per ongeluk gelijktijdig gestart) telt niet op maar vermenigvuldigt. De machine
  brak de run af nadat 137 van de 139 bestanden groen waren. Dezelfde les als bij `V2_JOBS`
  hieronder, één laag verderop: kies naar GEHEUGEN en niet naar kernen. De 1119 s hierboven
  is de HERHALING daarna, alleen gedraaid en compleet. De telling is +1 bestand sinds de V47-nazorg
  (`optimizer/ceilingTracking.test.ts`) en **+13 tests, en de dertiende is geen nieuwe claim**:
  7 in dat nieuwe bestand, 3 in `lfBumpBorder.test.ts` (de V48-tracker), 2 in
  `choiceKeyGuard.test.ts` — samen twaalf, geteld met
  `git show a30b6ee:<pad> | grep -c '^\s\+it('` tegen dezelfde telling nu — plus ÉÉN uit de
  `it.each` van `casus1V2Candidates.test.ts`, die over het LEVENDE corpus loopt en dus meegroeit
  toen dat van vier naar vijf netlists ging. Dezelfde beweging die CLAUDE.md al noteerde toen dat
  corpus van tien naar acht kromp en er twee tests verdwenen: **een testtelling van dit project is
  deels een corpusgrootte, en wie hem als claimtelling leest komt er één tekort.** **Het cijfer is LAGER dan de 1254 s van
  01-09 terwijl er tests bij zijn gekomen, en dat is opnieuw het CORPUS en niet de suite:** het
  levende veld ging van vier naar vijf netlists, maar de twee live ketenruns treffen een andere
  kandidaat — dezelfde les die V42/V43/V44/V47 al noteerden.
  (De stand ervoor, ter vergelijking: **01-09-2026, ná de splitsing:
  136 bestanden, 1497 tests, 1254 s (21 min), niets overgeslagen.**) Het extra bestand is de
  verhuisde verwerpingsrun; de extra test is de live-inventaris in `ciLayer.test.ts`. De
  V47-meting eronder is de "vóór"-helft van die vergelijking en blijft staan.
  **GEMETEN 31-08-2026 (V47, ná de regeneratie):
  135 bestanden, 1496 tests, 1540 s (26 min), niets overgeslagen — en dit cijfer IS bruikbaar,
  anders dan de V45-meting eronder.** (Dezelfde stand op 01-09-2026 op een leeg systeem
  nagemeten: 1761 s. Het cijfer beweegt met de machine en niet met de suite; de vóór/ná van de
  splitsing hierboven is daarom in ÉÉN sessie en op ÉÉN systeem gemeten.) De waarschuwing daar ("meet op een leeg systeem") gold omdat
  de regeneratie zes uur lang élke andere meting vertraagde; sinds V47 duurt zij 27 minuten en is
  de machine daarna gewoon leeg. Dat de volle run nu ongeveer kost wat de SNELLE laag bij V43
  kostte, komt van het CORPUS: het levende veld ging van zeven netlists naar vier en de twee live
  ketenruns treffen daarmee goedkopere kandidaten. **Het cijfer beweegt met het veld en niet met de
  hoeveelheid tests** — dezelfde les die V42/V43/V44 al noteerden, nu de andere kant op. De TELLING
  is de nieuwe stand: **+1 bestand** (`optimizer/protectionRule.test.ts`, 6 tests) en +12 tests, de
  rest verdeeld over de V47-blokken in `frozenNetlistGates.test.ts` (8), `choiceKeyGuard.test.ts`
  (1) en `casus1V2Candidates.test.ts`. **Twee BRONbestanden erbij zonder eigen testbestand:**
  `lib/protectionDeficit.ts` (de regel) en `engine2/metrics/protection.ts` (de adapter) — zij
  worden geoefend door `frozenNetlistGates.test.ts` en door de byte-baselines, want de extractie
  mocht per definitie geen enkel getal verplaatsen.
  (V45 mat, ter vergelijking en BELAST — direct na een regeneratie van bijna zes uur:
  134 bestanden, 1484 tests, 5011 s (1 u 24 min), niets overgeslagen. LET OP: die meting bevatte
  één bestand dat V45 NIET heeft opgeleverd** (`ciLayer.test.ts`, 4 tests, uit parallel werk aan
  de CI-laag dat op het moment van committen nog niet gecommit was) — de stand van de V45-commit
  zelf is dus **133 bestanden en 1480 tests**. Dat bestand is bij **V46** gecommit, dus vanaf daar
  is 134 / 1484 de V45-stand. Die telling was +2 bestanden — `requirements/targetCurve.test.ts`
  11 tests en `optimizer/amplitudeReference.test.ts` 6 — en +31 tests.)
  (V44 mat, ter vergelijking:
  131 bestanden, 1449 tests, 33 min wandkloktijd (1973 s), niets overgeslagen.)** Alles groen
  houden. De twee live ketenruns kosten 1314 + 653 s en zijn samen 1969 van die 1973 s; de rest
  van de suite draait ernaast en is ~305 s (`threeWayChain`). (V43 mat 129 / 1427 / 3150 s met
  2537 + 608 s aan live runs; V41 mat 128 / 1391 / 4285 s. Het cijfer beweegt vooral met het
  LEVENDE CORPUS en met wélke kandidaat de live reproductie treft, niet met de hoeveelheid tests:
  V42 bracht het corpus van 8 naar 4 en de suite naar 2097 s, V43 bracht het naar 7 en de suite
  naar 3150 s, V44 hield het op 7 en de suite kwam op 1973 s — hetzelfde corpusformaat en toch
  bijna de helft eraf, want de live reproductie treft een ANDERE kandidaat.)

  **DE SUITE IS BIJ V41 TIEN KEER ZO DUUR GEWORDEN (405 s → 4285 s), en het zit in ÉÉN bestand.**
  Sinds de synthesestap correctienetwerken koopt dragen de casus-1-netlists veel meer onderdelen,
  en het iteratiebudget van de tuner is `max(700, 140 · vrij)` — superlineair in het aantal vrije
  waarden. `casus1V2Candidates.test.ts` doet twee LIVE ketenruns en kost daardoor **2601 s alleen
  gedraaid** (V38-fix: 401 s), waarvan 1552 s voor de bevroren netlist en 1046 s voor de
  verwerping. **Nagemeten bij V44 in de volle run: 1969 s van de 1973** (V43: 3146 van 3150) —
  dit ene bestand IS de volle wandkloktijd en al het andere draait ernaast in de schaduw. Dat cijfer is de meting
  waarop het tweelagenbeleid hierboven rust. Alles daaromheen is nauwelijks bewogen.
  **SINDS 01-09-2026 ZIJN HET TWEE BESTANDEN, en dat verandert deze alinea op één punt: er is geen
  ENKEL bestand meer dat de wandkloktijd IS.** De twee live runs draaien naast elkaar (1244,3 s en
  924,2 s in de volle run van 01-09-2026, bij een wandklok van 1254,4 s), dus de langste van de
  twee zet de wandkloktijd en de andere staat ernaast. Wat NIET verandert: samen zijn zij nog
  steeds vrijwel de hele suite, en de volle run blijft verplicht vóór elke commit die de zoektocht
  raakt. **Gevolg voor de per-bestand-cijfers
  hieronder: zij zijn in een volle parallelle run niet meer bruikbaar** — één bestand houdt ruim
  een uur een worker bezet, dus elk ander bestand rapporteert vooral wachttijd (`frozenNetlistGates`
  meldt 17 min in de volle run en kost er 106 alleen gedraaid). Meet een bestand dus APART wanneer
  je zijn prijs wilt weten; de cijfers hieronder dateren van V38-fix en beschrijven het oude,
  kalere veld.

  De telling van 1386 naar 1391 is +1 bestand en netto +5 tests, en dat is niet +5 claims:
  `chainChoices.test.ts` brengt er 5, `choiceKeyGuard.test.ts` 2, en `casus1V2Candidates.test.ts`
  verliest er 2 doordat zijn `it.each` over het levende corpus loopt en dat corpus van 10 naar 8
  netlists ging. De telling stond tot F4b op 99/1003 — dat was de
  stand bij F3 (`61a3ea4`) en zij is drie opleveringen lang niet bijgewerkt: F3b bracht 104 bestanden, F3c 106,
  F4a 107, F4b 108, F4b2 109, F4c 112, V20 113, F4d 119, de F4d-nazorg 120, de vloersessie 120, V30 121,
  V31/V32 123, V33 124 (`barrierSource.test.ts`), V34 125 (`probeSource.test.ts`),
  V36 126 (`dissipationTerm.test.ts`), V38-fix 127 (`searchMeasure.test.ts`), V41 128
  (`chainChoices.test.ts`), V43 129 (`metrics/lfBumpDecomposition.test.ts`), V44 **131**
  (`metrics/phaseIntegration.test.ts` en `optimizer/phaseAdmission.test.ts`). **V37 voegde géén
  bestand toe** — zijn claims staan in
  `dissipationTerm.test.ts`, `frozenNetlistGates.test.ts`, `choiceKeyGuard.test.ts` en
  `casus1V2Candidates.test.ts`, naast de claims die zij al droegen; de telling ging van 1369
  naar 1376 tests op hetzelfde aantal bestanden. V38-fix voegt er één bestand (4 tests) en zes
  claims elders bij: 1386.
  **V44 gaat van 1427 naar 1449** — +2 bestanden (`metrics/phaseIntegration.test.ts` 10 tests,
  `optimizer/phaseAdmission.test.ts` 5) en netto +7 claims elders, verdeeld over
  `frozenNetlistGates.test.ts` (zes V44-blokken), `choiceKeyGuard.test.ts` (het vierde
  CHOICE/POLISH-paar) en `casus1V2Candidates.test.ts` (het zevende besluit in de meetopstelling).
  Vandaar de datum erbij: een telling zonder meetmoment is een telling die stil veroudert.
  **Waar de tijd zat (nagemeten bij V38-fix, volle parallelle run — zie de waarschuwing hierboven:
  deze cijfers zijn sinds V41 niet meer representatief):** zeven bestanden draaien echte ketenruns en zijn
  samen het leeuwendeel van de CPU-tijd — `casus1V2Candidates` (401 s: twee live runs, de bevroren netlist én
  de verwerping), `threeWayChain` (302 s), `candidateRoute` (128 s), `designChain` (114 s),
  `workerRouteRegression` (100 s), `frozenNetlistGates` (92 s), `f4cRegression` (81 s).
  De V37-stand ter vergelijking: 317 / 294 / 124 / 107 / 96 / 80 / 76 s. De groei zit waar de
  zoekmaat veranderde — `casus1V2Candidates` draait twee LIVE ketenruns op de v2-route en die
  meten sinds V38-fix een andere kromme; `frozenNetlistGates` telt er twaalf seconden bij voor
  de vier V38-fix-blokken, die per netlist twee extra netwerkoplossingen doen en geen tune.
  `searchMeasure` (22 s) draait vier korte tuner-runs op de tweewegfixture.
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
  `npx vite-node scripts/generate-casus1-v2-candidates.ts` — vijftien ketenruns.
  **SINDS V47 DRAAIT HIJ PARALLEL EN KOST HIJ MINUTEN IN PLAATS VAN UREN: gemeten 1624 s
  (27 min) op achttien kernen, tegen 21 357 s (5 u 56) sequentieel bij V45.**
  **BIJ V48 GEMETEN OP 2402 s (40 min) MET `V2_JOBS=8`, en die acht is een LES en geen
  toeval: `V2_JOBS` default op ÁLLE kernen zetten is te veel voor het geheugen van deze
  machine.** In dezelfde sessie draaide `measure-v48-ceiling-tracking.ts` dertig ketenruns
  met achttien tegelijk en kostte **34 241 s (9 u 30)** — twintig keer de prijs per run,
  terwijl de `seed`- en de `tuned`-arm onderling nauwelijks verschilden (32 791 tegen
  32 809 s), dus het zat niet in de gemeten ingreep maar in de gelijktijdigheid. Een
  ketenrun houdt grote rasters vast; achttien daarvan naast elkaar zwiept de machine het
  geheugen uit. **Kies `V2_JOBS`/`V48_JOBS` naar GEHEUGEN en niet naar kernen** — acht
  tegelijk was hier de goede orde. Het script roept
  zichzelf aan met `V2_ONLY=<n>`, één proces per kandidaat, `V2_JOBS` tegelijk (default: alle
  kernen), en voegt de shards samen in KANDIDAATVOLGORDE — nooit in de volgorde waarin zij klaar
  kwamen, want dan zou de shortlist van de planning afhangen. `V2_SEQUENTIAL=1` draait de oude weg
  in één proces; hij is er als ARM om een parallelle run tegen af te zetten. **Het mag omdat er
  nergens in `netOptimizer.ts` of `engine2/` module-scope mutable state staat** — nagegaan en niet
  aangenomen — en het is GEMETEN: drie kandidaten als shard gedraaid leveren netlists die
  byte-identiek zijn aan het corpus dat de sequentiële weg opleverde. A5e.4 blijft gelden zoals
  V46 hem preciseerde: byte-identiek per (machine, runtime), en een kind draait op dezelfde
  machine en runtime als zijn ouder.
  *De sequentiële prijzen ter vergelijking: 15 756 s (4 u 23) bij V41, 17 498 s (4 u 52) bij V43,
  21 357 s (5 u 56, 513–3762 s per kandidaat) bij V45.* Dat de spreiding weer groeide zit in WELKE kandidaten geweigerd worden en
  niet in een algemene vertraging: de vier duurste runs van V45 (2931, 3762, 2089, 1626 s) zijn
  drie verwerpingen en één zware winnaar, terwijl de goedkoopste winnaar er 678 kostte. Een
  geweigerde kandidaat doorloopt de hele zoektocht en wordt pas aan het eind weggegooid, dus een
  veld met meer verwerpingen is duurder zonder dat er iets traag is geworden.
  Dat is geen ongeluk maar de ingreep: de synthesestap koopt sinds V41 correctienetwerken, dus het
  zaad draagt aanzienlijk meer onderdelen, en het iteratiebudget van de tuner is
  `max(700, 140 · vrij)` — superlineair in het aantal vrije waarden. Elke prijs hieronder dateert
  van vóór V41 en beschrijft het oude, kalere veld. De kosten hangen sinds
  V33 aan de BARRIÈREBRON die de kandidaat stelt, en alle drie zijn gemeten over het hele veld:
  `'grid'` ~14 min (45–66 s per kandidaat), **`'safety'` 44,6 min (113–237 s) — dit is wat de
  v2-route stelt en dus wat je krijgt**, `'sweep'` 4 u 23 min (603–2740 s). De barrière lost het
  netwerk bij élke objectief-evaluatie op op het raster van zijn bron, en dat kost 0,507 ms op
  96 punten, 1,257 ms op 240 en 8,886 ms op 1600; een ketenrun doet er ~88 000.
  **Nagemeten bij V34: 41 min (115–224 s per kandidaat)** — de bronweerstandsprobe van V34 leest
  ook op het veiligheidsraster maar SCANT er alleen (één rasterdoorloop tot 400 Hz plus één
  één-frequentie-oplossing), dus hij kost niets meetbaars. **Nagemeten bij V37: 40 min
  (115–223 s per kandidaat)** — V37 verandert een DELING en geen raster, dus de prijs is
  onveranderd. **Nagemeten bij V38-fix: 42 min (116–218 s per kandidaat)** — de ONGEGLADDE
  zoekmaat van V38-fix verandert geen raster, alleen wélke kromme de amplitudeterm meet, en zij
  kost niets meetbaars: het evaluatiebudget beweegt beide kanten op (−39 % en +12 % op de twee
  kandidaten waar het apart gemeten is). Schrijft de
  shortlist-netlists en `casus1_v2_herkomst.json`. **Bevries het levende corpus ERVÓÓR** met
  `scripts/freeze-live-corpus.ts` als je de vóór/ná wilt kunnen reproduceren. Daarna
  `npx vite-node scripts/record-casus1-v2-references.ts` (drie seconden) voor de klasse-B-blokken én
  de vergelijkingstabel voor het casusboek. **Nagemeten bij de nazorg: twee opeenvolgende runs leveren de
  netlists byte-identiek terug, op het `savedAt`-stempel van de serialisatie na.**
- **De vóór/ná-tabel tussen twee corpora**: `npx vite-node scripts/compare-corpora.ts [vóór] [ná]` —
  seconden, geen ketenrun. Corpora: `v30`, `v32`, `v33sweep`, `v33`, `v34`, `v37`, `v38fix`,
  `v41`, `v42`, `v43`, `v44`, `v45`, `v47`, `v48`, `v49`, `v50`, `live`; default `v50 live`, wat de
  V51-tabel is (`v49 live` was de V50-tabel — de identiteit; `v48 v49` is de V47b-tabel, `v47 v48`
  de V48-tabel). **Sinds V51 twee kolommen erbij:** `serie-L per weg` (de totale seriespoel PER WEG
  in mH, `seriesInductanceByWay` uit `levelWork.ts` — de tilt die het pad vervangt zodra dat
  verboden is, en de grootheid waarop het opslingeringsbudget bijt) en `niveauwerk laagste weg` (de
  inventaris van `levelWork.ts`: serie-R's en shunt-pads bij naam en ohm, of "geen"), met een
  corpusregel eronder die X ernaast zet (hoeveel niveauwerk de configuratie op de laagste weg VRAAGT,
  klasse A) en per verwerping X en of de geweigerde tune niveauwerk droeg. **Sinds V50 twee kolommen
  erbij:** `toegestaan W` (klasse × marge, uit het M-A/part-oordeel gelezen) en `spoel piek A`
  (M-L, de drukste spoel bij de piekingang), met een corpusregel op de weerstandseis eronder; de
  M-C-corpusregel telt sinds V50 per weg tegen zijn EIGEN grens (gesteld op de tweeter, afgeleid
  op de mid) en niet meer tegen één getal. **Sinds V47b twee kolommen erbij:** M-C PER WEG naast het
  maximum (op KAND_B raakt de eis de mid en niet de tweeter, en het maximum zegt dat niet) en de
  VERTICALE LOBING-SYNTHESE (M-F-eind, diepste dip in het kruisgebied over het ±15°-venster dat
  de klasse-B-referentie `lobing_eind_dip_15gr` draagt — daarvoor kreeg de meetbank in
  `casus1Corpora.fixture.ts` een `verticalWindowDeg`, want zonder venster staat de synthese UIT).
  Allebei kolommen en geen oordeel: casus 1 stelt geen lobinggrens, en de M-C-corpusregel telt
  al op het maximum.
  **DE LEESREGEL, EN ZIJ GAAT VÓÓR ELKE KOLOM HIERONDER (sinds de V47-nazorg, 01-09-2026): EEN
  CORPUSGEMIDDELDE IS GEEN DELTA.** De twee corpora bevatten niet dezelfde netlists — dat is juist
  wat een gewapende eis DOET — dus het verschil tussen twee corpusgemiddelden draagt twee dingen
  tegelijk: wat er met de overlevende ontwerpen gebeurde, en wie er vertrok. Daarom staat naast élk
  corpusgemiddelde de GEPAARDE lezing: hetzelfde getal over uitsluitend de kandidaten die BEIDE
  corpora dragen, met het aantal paren erbij en op twee decimalen (een gepaarde delta is klein, en
  op één decimaal verdwijnt het verschil tussen "niets bewogen" en "iets de verkeerde kant op").
  **Het corpusgemiddelde beschrijft het VELD, de gepaarde delta beschrijft de INGREEP, en alleen de
  tweede mag als verbetering of verslechtering gelezen worden.** Gemeten aanleiding, beide
  richtingen op dezelfde tabel: V45 → V47 las fase als winst (25,3° → 13,1°) terwijl gepaard
  11,96° → 13,06°, en dissipatie als verlies (60,4 % → 62,2 %) terwijl gepaard 69,05 % → 62,23 %.
  De scherpste vorm staat op twee GEDATEERDE corpora: `v30 v32` drukt 19,2 → 27,0 % dissipatie af
  terwijl élke gepaarde delta daar exact NUL is — V32 veranderde geen enkel ontwerp en trok er
  alleen drie in. De statistiek zelf woont in `casus1Corpora.fixture.ts` (één regel, twee lezers:
  dit script en `corpusPairing.test.ts`), samen met de corpuskaart, het instellingenblok en de
  afronding waarop de gemiddelden rusten.
  **SINDS V47 draagt hij twee kolommen erbij.** De eerste is een M-C-kolom — de aandrijving op de eigen resonantie van de SLECHTST
  beschermde weg, afgeleid uit de poortoordelen van het rapport en nooit op een wegnaam gezocht —
  met een corpusregel eronder die de gestelde grens ernaast zet en telt hoeveel netlists eroverheen
  gaan, vóór en ná. Zelfde vorm als de LF-budgetregel, met één verschil dat de regel zelf noemt:
  dit is een POORT en niet alleen een zoekgrens. De tweede is `protSqDb` als CONTROLEKOLOM
  (V44-patroon: gerapporteerd, nooit een poort, nooit een sorteersleutel) — de maat waarop de
  zaadvergelijking oordeelde, gelezen door de adapter die de REGEL van de tuner aanroept. Zij staat
  er voor de dekkingsvraag: M-C leest f_s, `protSqDb` integreert onder `xo/3`, en de eerste netlist
  die M-C haalt met een tekort boven nul is een bevinding over de VORM van de eis.
  **SINDS V45 GAAN BEIDE HELFTEN DOOR DE DOELCURVE VAN HET ONTWERP, en dat heeft een gevolg dat
  een lezer verteld moet worden:** `venster` en `RMS` zijn afwijkingen van een REFERENTIE, en
  A5e.2 heeft casus 1 een referentie gegeven die niet horizontaal is. Het paar blijft eerlijk —
  beide helften door hetzelfde pad, de regel die dit script altijd al volgde — maar de
  "vóór"-kolom reproduceert niet meer het getal dat de V44-tabel voor dezelfde netlist afdrukte,
  want dát stond tegen vlak. De netlists zijn niet bewogen; de vraag is dat wel. Wie de oude
  lezing nodig heeft neemt haar met `targetCurve: FLAT_TARGET`. `compare-corpora.ts v30 v32` reproduceert de
  V32-tabel, `v32 v33` de V33-tabel, `v33 v34` de V34-tabel, `v34 v37` de V37-tabel, `v37 v38fix`
  de V38-fix-tabel, `v38fix v41` de V41-tabel, `v41 v42` de V42-tabel, `v42 v43` de V43-tabel.
  Gekoppeld op KANDIDAAT (de bestandsnummers
  zijn rijnummers van verschillende shortlists en horen niet bij elkaar), beide helften gemeten door
  hetzelfde `buildReport`-pad. **Sinds V36 draagt hij twee kolommen erbij** — dissipatiefractie en
  de watt in de grootste enkele weerstand, per kandidaat en als corpusgemiddelde. Een kolom, geen
  oordeel: casus 1 stelt geen dissipatiegrens (P4). **Sinds V41 een derde:** de CORRECTIEGROEPEN
  per netlist (val / gedempte val / Zobel / shunt-shelf / niveauwerk), geteld uit de geleverde
  netlist met `decompose` uit `v38-groups.ts` — één decompositie, inmiddels vier lezers — plus het
  corpustotaal per rol. Ook een kolom en geen criterium: een correctiegroep is een shunt en kost
  dissipatie en belastingimpedantie, en de twee kolommen ernaast zeggen of ze betaald zijn.
  **Sinds V42 twee kolommen erbij**: de LF-bult (`lfBump().extraDb`, de grootheid waarin het
  gestelde budget is uitgedrukt) en de TOTALE seriespoel van de weg waarop M-D oordeelt — de
  grootheid die de A5d.6-inversie begrenst. De weg wordt afgeleid uit `metrics.lfBump[0].driver`
  en nergens benoemd. De corpusregel eronder zet het gestelde budget ernaast en telt hoeveel
  netlists eroverheen gaan, vóór en ná. **Sinds V43 twee kolommen daar weer bij** — de LIFT en de
  OPSLINGERING waarin die bult uiteenvalt — en de corpusregel telt sindsdien op de OPSLINGERING,
  want dáár staat het gestelde budget op. De liftkolom draagt geen oordeel: hij is niveauwerk en
  hoort bij A5e.2. **Sinds V44 staan er DRIE fasekolommen per paar in plaats van twee, en zij
  komen alle drie uit hetzelfde rapport**: `M-K` (de maat), `octaaf (ctl)` en `overlap (ctl)` —
  de twee maten die tot V43 in de app stonden, nu controlekolommen die niets oordelen. De aparte
  TUNERRUN per netlist is daarmee vervallen: sinds V44 leest de tuner dezelfde functie als het
  rapport, dus die run zou dezelfde grootheid op een ander raster afdrukken (V40 mat dat verschil
  op hoogstens 1,5°). Drukt voor het LEVENDE corpus ook de verwerpingen af met wat de
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
  **DE BESTANDSPREFIX MOET `V44-KAND` ZIJN EN NIET `V44_KAND`, en sinds V45 weigert het script het
  verschil.** Die fout is bij V45 gemaakt en was bijna onzichtbaar: de referentie-SLEUTELS kwamen
  gewoon goed (de `-`→`_`-herschrijving is een no-op op een underscore), dus het manifest las
  `V44_KAND_1` zoals bedoeld — terwijl de BESTANDEN `V44_KAND-1` heetten in een casusboek waar elk
  ander corpus `V43-KAND-1` heet, en de corpusomschrijving "HET GEDATEERDE V44_KAND-CORPUS" werd
  omdat de `-KAND`-strip niet matchte. Niets faalde. Een conventie die alleen in de voorbeeldregel
  van een usage-string staat, is een conventie die stukgaat; zij staat nu in een assert.
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
  `V38_LIMIT=n` doet er n als rookproef; dat is geen meting.
  **`V38_ERRSMOOTH=0` draait de ablatie én de transplantatie met de zoekgladding UIT** — de
  ene-sleutel-arm, en sinds V38-fix is dat de arm die de v2-route zelf draait. De transplantatie
  schrijft dan `casus1_v38_transplantatie_ongegladd.json`, de ablatie `..._ablatie_ongegladd.json`. **De bank is niet de v2-route**, en
  dat verschil is gemeten in plaats van geschat: hij draait zonder `staged` (die snoeit en
  escaleert ONDERDELEN, wat elke ablatie zinloos maakt) en zonder `branchTargets` (die komt uit
  de ontwerpstap, die hier niet draait). **De topologie ligt daarmee nog niet vast**: de
  onderdelenaudit blijft gewapend en verwijdert componenten — op twee van de vier
  transplantatie-armen een vierde-orde-pool uit de tweetertak. Daarom schrijft elk script de
  geleverde netlist mee: wat de audit weghaalde is dan per arm na te meten in plaats van
  onzichtbaar in een Δ te zitten. Op de kandidaat waar beide gemeten zijn levert de bank
  3,22 dB waar de volle route 1,76 dB levert. Arm-tegen-arm is dus de meting; het absolute
  niveau is dat van de bank en niet van het corpus.
- **Wat de zoektocht ziet, per bevroren netlist (V38-fix)**:
  `npx vite-node scripts/measure-v38fix-search-measure.ts` — seconden, geen ketenrun en geen
  enkele tune. Drukt per netlist drie krommen af op dezelfde oplossing: de echte complexe som
  (wat 0 meet en wat élk oordeel leest), diezelfde som ná gladding (de ongebouwde variant), en de
  som van per-driver gegladde magnitudes met ongemoeide fase (wat de zoektocht tot V38-fix las).
  Dit is het bewijsmateriaal waarmee de reparatie gekozen is: gladden ná de sommatie repareert
  niets, want de stille geest zit ook in de som. `frozenNetlistGates.test.ts` assert de claims.
- **Waar het LF-bult-budget wel en geen plafond oplevert (V42)**:
  `npx vite-node scripts/measure-v42-bump-bound.ts` — seconden, geen ketenrun en geen tune.
  Drukt per bevroren netlist de padweerstand van de laagste weg af en het plafond dat de
  A5d.6-inversie daarbij oplevert. **Dit is het bewijsmateriaal onder de belangrijkste bevinding
  van V42:** de elektrische overdracht is `H_el = Z / (Z + R_pad + jωL)`, dus SERIEWEERSTAND tilt
  de reflexpiek in zijn eentje al op — dezelfde natuurkunde als de Q_es-vermenigvuldiging van M-E
  — en boven ongeveer 1,7 Ω padweerstand is het budget al op vóórdat er een spoel in het pad zit.
  `maxSeriesInductanceFromBump` geeft dan `null` en er komt GEEN plafond (V12). Gemeten op het
  V41-corpus: zes van de negen netlists, HUIDIG (3,76 Ω) inbegrepen. Het budget is dus een grens
  op de totale BRONIMPEDANTIE bij resonantie en niet op de spoel alleen; wie hem als spoelplafond
  leest, leest hem op de helft van de ontwerpen verkeerd.
- **De LF-bult ontleed in lift en opslingering (V43)**:
  `npx vite-node scripts/measure-v43-decomposition.ts [SLEUTEL ...]` — seconden, geen ketenrun en
  geen enkele tune. Twee tabellen. De EERSTE ontleedt élke bevroren netlist: `extraDb`, de
  resistieve lift en de resonante opslingering, met de optel-controle ernaast (zij tellen per
  constructie op). De TWEEDE zet de A5d.6-inversie in DRIE vormen naast elkaar en zij is het
  bewijsmateriaal onder de herdefinitie van de klasse-A-referentie: op de SOM bij 2,5 dB (wat V42
  deed — boven ~1,5 Ω géén grens), op de OPSLINGERING bij diezelfde 2,5 dB (de stap die NIET
  genomen is: bij 0,5 Ω springt het plafond van 2,432 naar 3,162 mH, +30 %, want de resistieve
  lift eet daar al 0,967 dB van dat budget op), en op de OPSLINGERING bij de herijkte 1,4 dB (wat
  er sinds V43 draait: 2,322 mH, waar het was). **Grootheid én getal samen; één van de twee alleen
  zou de eis stilletjes hebben opgerekt, en dát is waarom de sessie halverwege gestopt is om het
  getal te laten stellen.** `frozenNetlistGates.test.ts` assert de eerste tabel,
  `lfBumpBorder.test.ts` alle drie de kolommen van de tweede.
- **Waar het niveau-anker ligt, gemeten vóór er iets gesteld wordt (V45)**:
  `npx vite-node scripts/measure-a5e2-anchor.ts [SLEUTEL ...]` — seconden, geen ketenrun en geen
  enkele tune; zonder argumenten élke netlist die het casusboek noemt. Vier tabellen. (1) Het
  GEREALISEERDE BASPLATEAU per netlist: het energiegemiddelde niveau van de SOM over de basband
  minus dat van diezelfde som over de band van de ANKERWEG, in vier bandlezingen — de overname uit
  het A5d.3-venster of het eigen kruispunt van de netlist, elk geclipt en ongeclipt op de
  ver-veldgeldigheid. **Die vier kolommen ZIJN de bevinding**: de geldigheidsvloer ligt bijna drie
  octaven boven f_p, dus de geclipte band is geen plateau maar een sliver van een kwart octaaf
  bóven de baffle step (HUIDIG −1,08 dB), en waar het kruispunt onder de vloer valt is zij leeg.
  (2) De baffle step uit de gemeten kastbreedte (260 mm → 442,3 Hz) met de shelf als fractie van
  zijn eigen diepte. (3) M-E op de laagste weg, op alle drie de R_e-lezingen die het casusboek
  draagt. (4) De GEREALISEERDE VERZWAKKING per weg tegen het verankerde gap-budget — de tabel die
  `gap-pad-r` op deze casus veroordeeld heeft: de woofer betaalt 4,6–8,5 dB tegen een budget van
  0,89 en de ANKERWEG, die per definitie nul budget krijgt, is in élk referentiefilter de zwaarst
  gepadde weg. Dit is het bewijsmateriaal onder casusboek V45.
- **De fasemaat per netlist en per paar (V40/V44)**:
  `npx vite-node scripts/measure-v40-phase.ts [SLEUTEL ...]` — seconden, geen ketenrun en geen
  enkele tune; zonder argumenten élke netlist die het casusboek noemt. **Sinds V44 staat M-K
  vooraan** — de fase-integratie op de toegelaten punten — met zijn BAND, zijn puntental en zijn
  afwijzingen per grond (geldigheid / stilte / niveau), en de twee maten die zij vervangt erachter
  als controlekolommen. Alle drie uit één rapport, op één raster; de aparte tunerrun is vervallen
  om dezelfde reden als bij `compare-corpora.ts`. De vraag aan VituixCAD is daarmee een VALIDATIE
  geworden ("reproduceert M-K?") in plaats van een keuze tussen twee maten, en de band waarop
  afgelezen moet worden staat per rij — hij is niet meer uit het kruispunt af te leiden.
- **Waarom de twee oude fasematen verschilden, punt voor punt (V44)**:
  `npx vite-node scripts/measure-v40-overlap-band.ts [SLEUTEL ...]` — seconden, geen ketenrun en
  geen enkele tune. `V40_POINTS=1` drukt ook de puntentabel per paar af. Dit is het
  bewijsmateriaal waarop V44 gekozen is en het is de reden dat er een DERDE maat kwam: het telt
  per netlist welke punten alléén de tuner meetelde en classificeert ze in drie elkaar
  uitsluitende soorten. Gemeten over de 99 BEVROREN netlists: 1048 zulke punten, waarvan **911
  onder de meetgeldigheidsvloer** die de meetbestanden zelf opgeven, **14 dood** (beide takken op
  de stille geest, dus het faseverschil komt uitsluitend van de filters) en 123 echte geldige data
  buiten het octaafvenster. Alle 99 woofer→mid-rijen dragen zulke punten en slechts 11 van de 99
  mid→tweeter-rijen: het defect van de tuner zit op de LAGE kruising, dat van het rapport op de
  hoge. Tabel 1 zet de meetgeldigheid naast de ongeknipte uitgestrektheid per weg,
  met de herkomst van de vloer. `frozenNetlistGates.test.ts` assert de claims; dit script laat de
  getallen zien.
- **Drie bevroren netlists als VituixCAD-project (V40, hernoemd bij V44)**:
  `npx vite-node scripts/export-v40-vxp.ts [SLEUTEL ...]` — seconden. Schrijft per sleutel één zip
  in `test-fixtures/casus1/v40_vituix/`. **De bestandsnaam is sinds V44 `<SLEUTEL>@<commit>.zip`
  en de sleutels zijn BEVROREN** (`HUIDIG`, `V41_KAND_1`, `V38FIX_KAND_5`). Dat is een reparatie:
  de V41-zips heetten naar de LEVENDE sleutel `KAND_V2_1`, en die wijst na elke regeneratie naar
  een ander bestand — de zip die op schijf stond bevatte de V41-netlist (L1 5,391 mH) terwijl
  `KAND_V2_1` in de repo op 2,118 mH stond, met een ander kruispunt. Een aflezing daaruit zou
  tegen de verkeerde rij van het getallenblad zijn gelegd. Een LEVENDE kandidaat kan als argument,
  maar wordt niet meegeleverd om precies die reden. Elke zip draagt het `.vxp` én zijn
  meetbestanden, precies zoals de exportknop van de app het doet: `serializeVxp`, `zipStore` en de brugvertraging uit
  `vituixBridge.ts` zijn dezelfde functies. **Drie dingen doet hij anders dan de knop, en het
  bestandshoofd van elk geschreven bestand zegt het:** de responsen zijn de `onAxisFull` van de
  opnamepas (de woofer is één weg gemeten als twee bestanden en VituixCAD wil er één per
  driverblok — V13), de impedanties zijn omgezet naar ZMA-tekst (casus 1's `.lim` is binair ARTA
  en VituixCAD leest dat niet — **dat is ook een bevinding over de app: wie een `.lim` inlaadt en
  exporteert krijgt het ongewijzigd in de map. Gemeld, niet gerepareerd**), en er gaan geen
  hoekensets mee (casus 1 heeft er één, en één hoek is geen directiviteitsset).
- **Waar de aandrijving op de eigen resonantie landt (V47)**:
  `npx vite-node scripts/measure-v47-drive.ts [SLEUTEL ...]` — seconden, geen ketenrun en geen
  enkele tune. Drukt M-C af per HOOGDOORLAATBESCHERMDE WEG van élke bevroren netlist, en dat is
  het punt: de klasse-B-referentie `V_tweeter_op_fs_dB` noteert alleen de tweeter terwijl de poort
  élke beschermde weg oordeelt — op casus 1 dus ook de mid. Tabel 2 is de sanity die V42 afdwingt:
  waar ligt HUIDIG (−25,084 dB op zijn slechtste weg) en welke gestelde waarde op één decimaal
  laat hem nog net toe (−25,0). Dit is het bewijsmateriaal onder de gestelde eis van V47.
- **Wat de relatieve beschermingsregel mat op de geweigerde tunes (V47)**:
  `npx vite-node scripts/measure-v47-rejections.ts [LABEL ...]` — ÉÉN KETENRUN PER LABEL, 15–55
  min per stuk; zonder argumenten leest hij de `kinds: ['protection']`-weigeringen uit
  `casus1_v2_herkomst.json` en draait ze allemaal SEQUENTIEEL. **Draai ze parallel** — één proces
  per label — anders duurt hij uren. Drukt per kandidaat de zaadwaarde, de tunewaarde en de
  speling van élke veiligheidsvergelijking af die vuurde (`refusal.measured`, sinds V47), plus
  M-C van het GEWEIGERDE netwerk. **Dat laatste komt uit de weigering zelf en niet uit een eigen
  meting, en dat is geen omweg maar de enige weg:** `runCandidate` wist `rejectedParts` voordat
  het resultaat de worker verlaat (V31), dus van buitenaf is een geweigerd netwerk principieel
  onmeetbaar. De eerste versie van dit script probeerde het van buitenaf en kreeg een lege kolom
  terug — wat als "geen resonantie" leest terwijl het "geen onderdelen" betekende.
- **Wat het volgende spoelplafond oplevert, in twee armen (V48)**:
  `V48_JOBS=<n> npx vite-node scripts/measure-v48-ceiling-tracking.ts` — DERTIG KETENRUNS
  (vijftien kandidaten × twee armen), parallel over de kernen; `V48_ONLY=<n>` draait één shard,
  wat het script met zichzelf doet. **DE TWEE ARMEN VERSCHILLEN IN ÉÉN WOORD:**
  `seriesInductanceCeilingSource` staat op `'seed'` in de ene en op `'tuned'` in de andere, en
  alles daaromheen — eisen, budgetten, zaad, raster, seed — is hetzelfde object. Precies dáárvoor
  is die sleutel een CHOICE met een expliciete waarde die wint: zonder hem zou deze vergelijking
  twee commits nodig hebben in plaats van twee runs, en dan zou zij ook het verschil tussen die
  commits meten. Drukt per (kandidaat, arm) de zaad-padweerstand, het zaadplafond, de
  eind-padweerstand, de geleverde spoel, het plafond BIJ die eind-padweerstand en de geleverde
  opslingering af; schrijft `test-fixtures/casus1_v48_plafond.json`. **De kolom die de sessie
  draagt is `verwerping = budget`** — de geleverde-netwerk-toets van V45. In de `seed`-arm zijn
  dat de slachtoffers van het verouderde plafond; in de `tuned`-arm horen het er nul te zijn.
  **De rij van een GEWEIGERDE kandidaat is met opzet leeg op alles behalve zijn grond:**
  `runCandidate` wist `rejectedParts` voordat het resultaat de worker verlaat (V31), dus van
  buitenaf is een geweigerd netwerk principieel onmeetbaar — dezelfde muur waar
  `measure-v47-rejections.ts` tegenaan liep, en een eerlijke lege kolom is beter dan een
  verzonnen meting.
- **M-C v2.0 gemeten: x/V op de resonantie, het plafond en de afgeleide grens (V49)**:
  `npx vite-node scripts/measure-v49-excursion.ts [SLEUTEL ...]` — seconden, geen ketenrun en
  geen enkele tune; zonder argumenten élke netlist die het casusboek noemt. Drie tabellen. (1) Per
  DRIVER, klasse A: f₀, Z_max en Small's Q_ms uit de sweep, Bl en M_ms van de driverkaart, x/V
  via route 1, de toegestane spanning op f₀ en het plafond in dB t.o.v. de piekingangsspanning
  √(2·P_piek·R_nom); route 2 ernaast of de reden dat zij uit staat. (2) Per
  HOOGDOORLAATBESCHERMDE WEG per netlist, klasse B: het doorlaatbandgemiddelde |H|, de AFGELEIDE
  M-C-grens (plafond minus dat gemiddelde), naast −20 (gesteld), −25 (V47) en de 18-dB-regel,
  welke van de twee de poort las, en M-C met zijn oordeel; met eronder hoeveel wegen de afgeleide
  grens alleen zou weigeren en waar zij strenger is dan de gestelde. (3) De ZWAKSTE SCHAKEL: de weg
  zonder hoogdoorlaat bij de piekingang. **Gemeten 02-09-2026 (V49): op het levende corpus en de referentiefilters is de afgeleide grens
  op ÉLKE weg ruimer dan de gestelde −20 (tweeter −3,9 tot −1,1 dB, mid −14,5 tot −10,8 dB), dus
  de effectieve poort bewoog niet en het corpus is NIET geregenereerd; over het hele casusboek is
  zij op zeven V28-mids 0,05–0,59 dB strenger (doorlaatband bóven de ingang) en op twee V28-mids
  bóven nul (doorlaatband 23–25 dB eronder); de wooferexcursie bij de NAD-piek leest 14–21 mm
  tegen 6,84 mm limiet.** Route 2 staat op casus 1 UIT: de FF-meetspanning
  is niet gedocumenteerd (`driverkaart.ff_meetspanning_V` is null, met de bevinding erbij), en
  er is bewust geen 2,83 V aangenomen.
- **Bouwbaarheid gemeten vóór er iets gewapend wordt (V50)**:
  `npx vite-node scripts/measure-v50-buildability.ts [SLEUTEL ...]` — seconden, geen ketenrun en
  geen enkele tune; zonder argumenten élke netlist die het casusboek noemt. Drie tabellen. (1) Per
  netlist het vermogen in ELKE discrete weerstand bij het gestelde continue vermogen (M-A,
  IEC-gewogen), de heetste met naam, de toegestane waarde klasse × marge en het oordeel van
  M-A/part. (2) Per netlist de piekstroom door elke spoel bij de piekingang √(2·P_piek·R_nom)
  (M-L, ongewogen), de drukste met frequentie. (3) De SANITY op de referentiefilters: haalt HUIDIG
  de weerstandseis, en welke klasse of welk continu vermogen zou hem nog net toelaten. **Gemeten
  03-09-2026 (V50): HUIDIG verstookt 25,6 W in R8 (3,3 Ω, het wooferpad) tegen 5 W toegestaan
  (10 W × 0,5 bij 100 W continu) — factor 5,1; KAND_A 30,9 W (6,2×), KAND_B 19,6 W (3,9×); het
  V49-corpus 13,6–34,9 W. Nog net toelaatbaar: klasse ≥ 51 W bij 100 W, óf ≤ 19,6 W continu bij
  10 W. Achttien gedateerde netlists (V28–V38-fix, zonder wooferpad) halen de eis wel, met
  0,5–1,4 W in een tweeterpad — dat is de eis die haalbaar is zodra de woofer NIET resistief
  verzwakt wordt, en precies wat de anker-verzwakking van V45 uitsluit.** Dit is het
  bewijsmateriaal onder de hangende beslissing in `gestelde_eisen.bouwbaarheid_op_de_zoektocht`
  — **genomen bij V51:** gewapend, bij een gesteld THERMISCH ONTWERPVERMOGEN van 10 W
  (`thermisch_ontwerpvermogen_W`) en niet bij de 100 W van de versterkerklasse; de poort zegt
  bij elk oordeel bij welk vermogen hij las (`judged_at_W`, `judged_at_source`) en de wattkolom
  van M-A blijft bij het continue vermogen.
- **Niveauwerk op de laagste weg gemeten vóór er iets verboden wordt (V51)**:
  `npx vite-node scripts/measure-v51-level-work.ts [SLEUTEL ...]` — seconden, geen ketenrun en
  geen enkele tune; zonder argumenten élke netlist die het casusboek noemt. Drie tabellen. (1) De
  CONFIGURATIE (klasse A, afgedrukt op elk referentiefilter): het anker, hoe ver de laagste weg
  erboven staat na de doelcurve — X, wat deze configuratie aan niveauwerk op die weg VRAAGT —,
  wat N gelijke drivers in serie daarvan zonder weerstand zouden leveren (20·log N), de baffle
  step, en of het gestelde plateau binnen de beoordeelde band ligt. (2) Per netlist wat de laagste
  weg WERKELIJK draagt (serie-R en shunt-pad bij naam, `levelWork.ts`), de seriespoel per weg, de
  opslingering, M-E, en M-A/part bij het thermisch ontwerpvermogen én bij het continue vermogen.
  (3) De SANITY op de referentiefilters (V42-les): HUIDIG draagt R8 in het wooferpad, dus de eis
  sluit het referentiefilter uit — en dat is de bevinding en geen reden om haar te versoepelen.
  **Gemeten 03-09-2026 (V51): X = 1,33 dB (anker mid, na de doelcurve; `verankerde_gaps_dB.
  woofer_tov_mid`), twee woofers in serie zouden 6,02 dB leveren, de baffle step ligt op 442 Hz en
  de beoordeelde band begint 0,16 octaaf eronder (doel op de bandvloer −1,32 van de gestelde −2,5
  dB): het plateau wordt op deze meetset NIET beoordeeld. HUIDIG R8 3,30 Ω, KAND_A R8 4,00 Ω,
  KAND_B R8 1,61 Ω; het V50-corpus 1,61–3,70 Ω serie plus op KAND_V2_1 een shunt-pad van 9,09 Ω.
  Bij 10 W thermisch halen alle drie de referentiefilters M-A/part (2,55 / 3,09 / 1,96 W tegen
  5 W); bij 100 W continu geen van drie (factor 5,1 / 6,2 / 3,9).**
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

- `src/lib/engine2/ciLayer.test.ts` — **de taakverdeling tussen CI en de lokale suite als test.**
  Zij is anders niet zelfdragend: zij is een regex in `package.json` plus een tag in een testnaam,
  en allebei kunnen stil groeien — dezelfde valkuil die V43 voor `[live]` opschreef, één tag
  verderop. Vier claims. (1) `test:ci` sluit beide planningstags uit en `npm test` sluit niets uit.
  (2) De DRAGENDE referentiebestanden van de CI-laag bestaan nog en dragen géén enkele tag — een
  tag daar zou CI leegmaken terwijl de deploy groen blijft, de stilste manier waarop dit ongedaan
  gaat. (3) De byte-inventaris is precies vijf bronnamen (acht gedraaide tests: drie zijn
  `it.each` over twee zaden), voluit opgeschreven zodat wie er een tagt hier langskomt en moet
  opschrijven wat hij uit CI haalt. **Sinds V50 ZES namen en TIEN tests:** het tweede
  oordelenblok van `f4cRegression` (`verdicts_sinds_V50`, `it.each` over twee zaden) draagt de
  tag om dezelfde reden als de andere vijf, en de eerste volle run van V50 viel precies op deze
  inventaris om — de bewaker deed wat hij moet doen. Het aantal overgeslagen tests in `test:ci`
  is daarmee 2 `[live]` + 10 `[bytes]` − 1 die beide draagt = ELF. (4) **SINDS 01-09-2026 een LIVE-inventaris ernaast, in dezelfde
  vorm en om dezelfde reden: precies TWEE blokken, met naam.** De splitsing van de twee live
  ketenruns bracht het tagtal van één naar twee, en precies zo'n verhoging is wat stil kan
  doorgroeien. (5) De scan loopt echt — zonder die tegenproef is "niets
  gevonden" niet te onderscheiden van "niet gekeken". De tagnamen worden op runtime samengesteld,
  zodat dit bestand zichzelf niet matcht én zichzelf niet uit de CI-laag filtert (`-t` matcht de
  VOLLEDIGE testnaam). **Het aantal overgeslagen tests in `test:ci` verandert door de splitsing
  NIET** — de verwerpingsrun droeg `[live]` al vóór de verhuizing, dus de vereniging van beide
  tags blijft negen gedraaide tests.
- `src/lib/engine2/casus1V2Refusal.test.ts` — **de tweede live ketenrun, sinds 01-09-2026 een
  eigen bestand.** Inhoudelijk ongewijzigd: het is de V31/V33-claim dat een kandidaat die een
  wholesale-regel weigert als VERWERPING terugkomt en dat er nergens in het resultaat een
  onderdelenlijst overleeft. De verhuizing is planning en geen herindeling — zie de meting bij
  `npx vitest run` hierboven — en zij is de enige reden dat het bestand bestaat; wie de twee ooit
  weer samenvoegt zet de suite terug op negenentwintig minuten.
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
  (30 sinds V38-fix; 25 bij F4c, 26 bij V30, 27 bij V33, 28 bij V34, 29 bij V37), `GREY_KEYS` (5),
  `POLISH_KEYS` (9). Samen exact de 44 top-level sleutels van `NetOptimizeOptions` — een telling
  die de test uit de BRON leest en niet uit deze regel. V38-fix voegde geen sleutel toe maar
  verplaatste er één (`errorSmoothOct`, polish → keuze), dus 44 blijft 44 en 29/5/10 wordt 30/5/9. De definities staan in de nota (A3j) in algemene bewoordingen; deze
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
- **Sinds V50 draagt `f4b2_v2_baseline.json` een TWEEDE oordelenblok, `verdicts_sinds_V50`**, naast
  `verdicts_sinds_V32` — twee gedateerde blokken en geen herschreven blok, om de reden die V32 gaf
  toen het de netwerk-helft van de oordeel-helft scheidde. V50 zette twee poorten (`M-A/part`,
  `M-L`) op élke oordelenlijst; het V32-blok blijft zijn VIER poort-id's pinnen (de test filtert
  de verse oordelen op de id's die het blok zelf draagt, met `gateIdsIn`) en het V50-blok pint
  alle zes. `npx vite-node scripts/record-f4b2-v50-verdicts.ts` (seconden, twee korte
  tuner-runs) schrijft het; de netwerk-helft (`runs`) raakt hij niet aan.
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
  herkomst, drie lezers), en de vóór/ná van de uitdagingsdrempel — op de piek haalt de term op
  géén enkele netlist de 1 %, op R_e haalt hij hem wel, en het verschil tussen die twee is het
  KWADRAAT van de factor tussen de noemers, afgeleid uit de opgeschreven noemers zelf.
  **De vergelijking is bij V41 gecorrigeerd en de drempel niet.** Zij deelde door de kleinste RMS
  van het HÉLE casusboek; toen V41 het veld vlakker maakte (kleinste RMS 0,53 → 0,48) sloeg zij om
  naar 1,22 % en viel om — niet doordat de term groeide (grootste piek-term 0,002819 → 0,002067)
  maar doordat de noemer kromp. Die proxy legde de term van de ENE netlist naast het objectief van
  een ANDERE, en dat is nergens een grootheid: de tuner telt de term op bij het objectief van het
  netwerk dat hij evalueert. Elke netlist wordt nu tegen zijn EIGEN objectief gelegd — grootste
  piek-aandeel 0,74 %, grootste R_e-aandeel 29,5 % — met een assert op het aantal deelnemers, en
  nagemeten dat hij kán falen (de piek-term van `KAND_V2_3` maal 1,5 geeft 1,10 % en rood).
  **BIJ V48 SLOEG ZIJ VOOR DE VIERDE KEER TOE, en toen lag het aan de ANKERING zelf.** V47 ankerde
  met een COMPLEMENT — "alles wat niet `KAND_V2_n` heet" — en dat is geen anker maar een
  verzameling die met elk corpus meegroeit. De netlist die hem bij V47 brak (`KAND_V2_1`, RMS 0,48,
  1,053 %) is bij V48 BEVROREN als `V47_KAND_1` en stapte daarmee precies het uitgesloten geval
  weer binnen, met hetzelfde getal. Dat was geen ongeluk maar een zekerheid: élke sessie bevriest
  het levende corpus vóór zij regenereert. **Een anker noemt sindsdien zijn VERZAMELING** — de tien
  families die bestonden toen V36 en V37 gemeten werden, uitgeschreven, met een tegenproef ernaast
  dat die verzameling aantoonbaar KLEINER is dan "alles wat niet levend is". Wie hier ooit een
  familie bij zet, zet er een corpus bij dat V36 en V37 nooit gezien hebben.
  **BIJ V47 SLOEG DEZELFDE VAL VOOR DE DERDE KEER TOE, en de vorm is nu veranderd in plaats van de
  drempel.** De assert viel om op `KAND_V2_1` met 1,053 %, en opnieuw niet doordat de term groeide
  maar doordat de NOEMER kromp: hij deelt door het objectief van de netlist zelf, en de gewapende
  M-C-poort liet alleen de vlakste ontwerpen door (`KAND_V2_1` draagt RMS 0,48, het vlakste van het
  boek). Elke vaste drempel op een aandeel-van-het-objectief beweegt dus mee met de kwaliteit van
  het veld. De drempel is NIET opgerekt — dat zou een bewaker zijn die precies zo ver meeschuift als
  nodig. De strikte claim is GEANKERD op de gedateerde corpora, waar hij onveranderd staat op
  0,736 % (dezelfde herankering die V43 op `v42_bult_bevinding` toepaste), en het levende veld krijgt
  de claim die V37 werkelijk draagt en die op ÉLKE netlist geldt: de twee noemers liggen een ORDE
  VAN GROOTTE uit elkaar (1,05 % tegen 42,2 %). Die vorm kan niet stil verouderen.
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

### V38-fix-guards (wat de zoektocht meet)
- `src/lib/engine2/optimizer/searchMeasure.test.ts` — de tuner-helft, vier claims. Afwezig en de
  historische 1/12 octaaf zijn byte-identieke netwerken (P2: de default is niet aangeraakt, dus
  élke v1-run leest wat hij las); **0 BEREIKT de zoektocht** — er komt aantoonbaar een ander
  netwerk uit, en zonder die tegenproef zijn de andere claims even waar voor een sleutel die
  nergens op aangesloten is (V23); met gladding aan rapporteert de tuner twee verschillende
  pieken (`rippleDb` tegen `ripplePeakSmoothedDb`) en met 0 zijn het er één — de naad zelf; en
  gladden-ná-sommatie levert een andere kromme dan gladden-vóór, maar op deze tweewegfixture
  blijven ze allebei binnen een fractie van de echte som. **Dat laatste is geen zwakte van de
  test maar de meting die de reparatie koos:** deze fixture heeft geen stille geest (het raster
  loopt niet voorbij de gemeten uitgestrektheid), dus hier is de ontkoppeling van magnitude en
  fase het énige effect en zij is klein. De grote helft staat op het echte corpus.
- `src/lib/engine2/frozenNetlistGates.test.ts` — vier V38-fix-blokken op élke bevroren netlist, en
  ze kosten geen tune: het zijn oplossingen van een gegeven netwerk. (1) De PREMISSE: binnen de
  beoordeelde band leeft elk punt van elke tak, en het eerste rasterpunt erboven is dood
  (−400 dB, de stille geest). (2) De gegladde zoekmaat leest een minimum dat op élke netlist
  dieper wegzakt dan het VOLLEDIGE piek-tot-dal-bereik van de echte som, en het landt op het
  laatste punt in de band — dat is het mechanisme. (3) **Gladden-ná-sommatie repareert het niet**:
  de twee volgorden verschillen minder dan de echte rimpel terwijl beide daar veelvouden boven
  zitten. Dit is de meting waarmee de ongebouwde variant is afgewezen in plaats van beredeneerd.
  (4) De ontkoppeling van magnitude en fase bestaat wél maar draagt minder dan een tiende van de
  echte rimpelpiek — de correctie op V38's eigen mechanisme-zin.
- `src/lib/engine2/optimizer/choiceKeyGuard.test.ts` — de HERCLASSIFICATIE, en zij is de enige in
  de A3j-tabel: `errorSmoothOct` is sinds V38-fix CHOICE en mag nooit terug naar POLISH of GREY.
  De sleuteltelling blijft 44 (geen sleutel erbij) en de verdeling wordt geassert: 30/5/9. Plus
  de V38-fix-verklaring, de tweede ONVOORWAARDELIJKE afleiding in `candidateDeclaration.ts` naast
  V37's: `full()` en `bare()` stellen allebei `SEARCH_SMOOTHING_OCTAVES`, een expliciete breedte
  wint, en de breedte beweegt de vingerafdruk.
- `src/lib/engine2/casus1V2Candidates.test.ts` — de meetopstelling zegt sinds V38-fix ook op welke
  KROMME de amplitudeterm gemeten is (`zoekmaat_gladding_oct`, `zoekmaat_waarom`), afgelezen van
  de verklaring en niet overgeschreven. Vierde besluit naast V30/V33, V34 en V37.

### V42-guards (het gestelde LF-bult-budget, en de som in plaats van de component)
- `src/lib/engine2/casus1V2.fixture.ts` — **`CASUS1_V2_GATES` en `CASUS1_V2_BUDGETS`: de gewapende
  eisen van een casus-1-v2-run hebben sinds V42 één huis.** Het generatiescript en de twee payloads
  in `casus1V2Candidates.test.ts` bouwden dit blok elk zelf, en toen V42 een budget wapende
  reproduceerde de test de run niet meer waarover hij oordeelt: hij draaide een kandidaat die het
  verslag als VERWORPEN registreert zónder het budget dat hem weigerde, kreeg een netwerk terug en
  viel om. Dat is V27's procesles voor de vierde keer, nu wél gevangen door de suite. Spreiden op
  de gebruiksplek (`gates: { ...CASUS1_V2_GATES }`), zodat een ongestelde eis niets wapent (P4).
- `src/lib/engine2/optimizer/bounds.ts` — de tak `'bump-series-l'` levert sinds V42 een
  **som-plafond** over de vrije seriespoelen van de weg, in de vorm die `qes-series-r` sinds F2
  draagt: dezelfde opgeloste `maxSI`, met de VERGRENDELDE spoelen eerst van het budget af (een
  vergrendelde spoel is reactantie die de driver ziet en die de tuner niet kan verplaatsen), en
  het per-component-plafond ernaast als noodzakelijke voorwaarde. Tot V42 stond er alleen dat
  laatste, mét een notitie die het gat zelf beschreef — en zeven van de acht V41-netlists droegen
  twee spoelen. **Eenheden nagegaan:** `valueSumCeilings` werd tot nu toe alleen door
  `qes-series-r` gebruikt en R heeft SI-factor 1, dus een mH/H-verwisseling zou daar nooit zijn
  opgevallen; `crossoverToNetlist` schrijft `value: mH * 1e-3`, dus `free[i].value` en `maxSI`
  staan allebei in henry.
- `src/lib/engine2/optimizer/lfBumpBorder.test.ts` — drie V42-claims op het ECHTE geval
  (5,39 + 1,95 mH uit `V41_KAND_1`, niet een verzonnen topologie): de som wordt begrensd en het
  per-onderdeel-plafond blijft ernaast; een vergrendelde spoel wordt van het budget afgetrokken in
  plaats van genegeerd; en één vrije spoel levert dezelfde vorm op, zodat de shape niet met het
  aantal verandert. De dragende assert is dat onder de OUDE box het zaad elk plafond haalde
  terwijl de som er ruim twee keer overheen ging — precies de ontsnapping die V42 sluit.
- `src/lib/engine2/frozenNetlistGates.test.ts` — vier V42-blokken, en **er is met opzet GEEN
  "elke netlist onder het budget"-assert.** Die claim zou een uitzonderingslijst ter grootte van
  het hele corpus vragen, en dat is de vrijstelling die dit project verbiedt. Wat er wél staat en
  kán falen: de metriek wordt op élke bevroren netlist gerapporteerd; de OPGESCHREVEN bevinding
  (`manifest_en_geometrie.v42_bult_bevinding`) klopt nog met een verse meting, per netlist en niet
  als gemiddelde, zodat een later corpus de entry niet stil onwaar maakt; de eis is BEREIKBAAR op
  deze drivers (het V28-corpus haalt hem) en zij is NIET vacuüm (de drie referentiefilters
  overschrijden hem — HUIDIG 3,78 dB tegen 2,5, wat het spiegelbeeld is van de versterkervloer,
  waar HUIDIG de eis juist met marge haalt).

### V43-guards (de bult ontleed, het budget verhuisd, en de tag die de suite betaalbaar houdt)
- `src/lib/engine2/optimizer/bounds.ts` — **`maxSeriesInductanceFromBump` lost sinds V43 op tegen
  de RESONANTE component en niet meer tegen de som**, en dat verandert het KARAKTER van de grens
  en niet alleen haar waarde. Op `extraDb` kon de functie `null` teruggeven zodra het budget bij
  L = 0 al op was — geen fout maar het antwoord (V12) — en op casus 1 gebeurde dat op zes van de
  negen bevroren netlists, HUIDIG inbegrepen. Op `resonantDb` is de opslingering bij L = 0 per
  definitie exact nul, dus er is ALTIJD een plafond en `null` betekent nog uitsluitend "de metriek
  kreeg geen data". De teruggave draagt sinds V43 ook `resistiveLiftDb`, en de bound-notitie zegt
  hardop wat de padweerstand al optilt: dat deel kan de zoektocht niet uitgeven en niet
  repareren — het is niveauwerk en hoort bij A5e.2.
- `src/lib/engine2/optimizer/boundInversions.test.ts` — de klasse-A-referentie is HERDEFINIEERD
  (V15-vorm) en drie asserts houden dat eerlijk. De LEVENDE waarde
  (`maxL_bij_Rs0_5_budget1_4dB_opslingering_mH`, 2,322 mH) wordt op de METRIEK getoetst: bij die
  spoel moet `extraDb(L) − extraDb(0)` het gestelde budget zijn. De BRUG (`_maxL_op_de_som_V42`,
  2,432 mH bij 2,5 dB op de som) reproduceert nog steeds op zijn eigen grootheid. En de
  NIET-GENOMEN stap (`waarde_zonder_herijking`, 3,162 mH) reproduceert óók — dat is de assert die
  het besluit draagt: grootheid alleen verplaatsen was +30 %, grootheid én getal samen is −4,5 %.
  **V12's tegenvoorbeeld is niet geschrapt maar aangescherpt:** waar het zei "bij 2 Ω haalt geen
  enkele spoel de 2,5 dB", zegt het nu wat het altijd al mat — bij 2 Ω is de RESISTIEVE helft
  alleen al over dat budget — plus de tegenproef dat er op de nieuwe grootheid daar wél een grens
  is.
- `src/lib/engine2/frozenNetlistGates.test.ts` — twee budgetblokken naast elkaar, en de scheiding
  is de claim. Het V42-blok bewaakt het NEGATIEVE resultaat en is HERANKERD op het bevroren
  `V42_KAND_*`-corpus: het noemde het levende corpus, en dat is bij V43 opnieuw opgewekt, dus de
  bevinding zou onwaar zijn geworden zonder dat iets faalde. Het V43-blok bewaakt de eis die
  vandaag geldt: haalbaar (**alle drie de referentiefilters halen haar nu**, wat onder V42 juist
  níet zo was en de reden dat het bewijs toen van het V28-corpus moest komen), niet vacuüm
  (netlists in het casusboek overschrijden haar), en de opgeschreven bevinding
  (`v43_budget_bevinding`, door de recorder geschreven) klopt met een verse meting per netlist.
- `src/lib/engine2/metrics/resistiveEquivalent.ts` — **het RESISTIEVE EQUIVALENT is een
  netlist-transform en geen model.** Zelfde topologie, zelfde waarden: spoel → haar eigen DCR
  (een ideale spoel heeft DCR 0 en wordt dus een KORTSLUITING — de knopen worden samengevoegd met
  union-find, want nodale analyse kan geen ideale kortsluiting stempelen en een "klein genoeg"
  weerstandje is een magisch getal dat het antwoord bepaalt, P6), condensator → OPEN en de tak
  verlaat het netwerk. Dat laatste is een besluit met een reden: de resistieve limiet van een
  condensator is een open tak, dus zijn ESR staat in serie met een oneindige reactantie en kan
  niets geleiden — hem dóór zijn ESR vervangen zou elke seriecondensator in een bijna-kortsluiting
  veranderen, de tegenovergestelde limiet. Ground blijft knoop 0 (de kleinste index wint een
  merge), en een driver die in die limiet kortgesloten raakt wordt bij NAAM gemeld in plaats van
  een tak op te leveren die niets uitstraalt.
- `src/lib/engine2/metrics/lfBumpDecomposition.test.ts` — de vier testsoorten van de
  metriek-skill op één bank. HANDBEREKENING: een puur reële belasting en één nabije-veldpunt in de
  band, zodat alle drie de maxima op hetzelfde rasterpunt vallen en elke kromme één regel algebra
  is (geleverd 0,6417 / 0,5514 / 0,0903 dB). DE OPTELSOM: `liftDb + resonantDb = extraDb` op vier
  combinaties, en met nul reactantie is de resonante helft exact nul. P2: zónder resistieve kromme
  is `extraDb` bit-identiek en zijn beide helften `null` — nooit 0, want een nul leest als
  "gemeten, en het is niets". NIEUWE MÉTING: een grotere spoel verplaatst de resonante helft en
  laat de resistieve **exact** onaangeraakt (het resistieve equivalent bevat de spoel niet), en
  meer serieweerstand verplaatst ze in TEGENGESTELDE richting — zonder die tegenproef zijn het
  twee namen voor één getal. Plus de transform zelf en beide versiestrings.
- `src/lib/engine2/frozenNetlistGates.test.ts` — vier V43-blokken over het HELE casusboek, en zij
  kosten geen tune: `FIELD` bouwt al één rapport per netlist. (1) De optel-assert op élke bevroren
  netlist — dat is wat de staande `lf_bult_extra_dB`-referenties tot de BRUG naar de twee nieuwe
  maakt. (2) De tegenproef dat het werkelijk twee grootheden zijn: er zijn netlists waar de lift
  domineert, netlists waar de opslingering domineert, en netlists waar zij TEGENGESTELDE TEKENS
  hebben — dat laatste kan geen enkel getal onder twee namen (V23). (3) De opgeschreven ontleding
  (`manifest_en_geometrie.v43_ontleding`) klopt nog met een verse meting, per netlist. (4) De
  bevinding van V43 als falsifieerbare claim: op alle drie de referentiefilters is de opslingering
  nul of negatief terwijl `extraDb` het budget overschrijdt — wat het budget op HUIDIG veroordeelt
  is dus niveauwerk en niet de spoel.
- `src/lib/engine2/optimizer/lfBumpBorder.test.ts` — de tweede tabel als assert, en géén tweede
  bisectie: `lfBumpForSeriesRL` is bij V43 uit `maxSeriesInductanceFromBump` gelicht en
  geëxporteerd, zodat de test de plafonds ON DE METRIEK toetst (bij de genoteerde spoel moet de
  lift het budget zijn) in plaats van de inversie na te bouwen. Eén synthese, twee lezers — de
  vorm die `impedanceFloor.ts` en `partAudit.ts` al dragen. De `null`-rijen zijn de scherpste
  assert: boven ~1,5 Ω hoort er GEEN plafond te zijn, en een versie die daar stilletjes 0 mH gaat
  teruggeven zou als een aanscherping lezen in plaats van als de stilte die het is.

### V44-guards (welke punten een fase-oordeel dragen)
- `src/lib/phaseAdmission.ts` — **de toelating heeft sinds V44 één huis, en twee lezers.** Drie
  gronden tegelijk, elk een bestaande doctrine: (a) binnen de meetgeldigheid van BEIDE takken
  (V15/lek-2 — 911 van de 1047 punten die de tunermaat extra meetelde vielen hieronder), (b) beide
  takken boven de stille-geestvloer (V38-fix — 14 dode punten, waar het faseverschil uitsluitend
  van de FILTERS komt), (c) |niveauverschil na filter| ≤ het overlapvenster (het bestaande
  tuner-criterium — fase waar de som hem niet voelt telt niet; het rapport middelde op
  `V28_KAND_1` M-T dertien punten van gemiddeld 146° mee). **De ±1-octaafband is als toelating
  VERVALLEN**: grond (c) leest het overnamegebied van het geleverde netwerk af. Het bestand staat
  in `src/lib/` en niet in `engine2/` om de reden die `impedanceFloor.ts` al draagt — de tuner mag
  niets uit `engine2/` importeren. Het overlapvenster kreeg bij dezelfde gelegenheid ook één huis
  (`DEFAULT_OVERLAP_WINDOW_DB` + `inOverlapWindow` in `integration.ts`), zodat grond (c) de
  vergelijking LEEST in plaats van hem na te bouwen.
- `src/lib/engine2/metrics/phaseIntegration.test.ts` — de vier testsoorten van de metriek-skill op
  één bank van acht punten, zó gebouwd dat **elke grond precies één punt wegstuurt** en dat allebei
  de defecten die V44 aanleiding gaven in dezelfde acht punten zichtbaar zijn: het DODE punt dat
  het kale overlapvenster binnenlaat, en het punt waar één tak dertig dB weg is dat het
  octaafvenster binnenlaat. Alle drie de maten met de hand nagerekend (110/3, 50/3, 110/7). P2:
  zonder geldigheid en zonder geestvloer IS de maat het kale overlapvenster, bit-identiek — de
  gronden onthouden zich, zij vallen niet terug (P4). NIEUWE MÉTING: het KRUISPUNT verplaatst
  alleen de controlekolom en nooit de maat, wat de vervallen octaafband als claim vastlegt.
- `src/lib/engine2/optimizer/phaseAdmission.test.ts` — de tuner-helft, vijf claims, en de derde
  draagt de rest. Afwezig en `'overlap'` zijn byte-identieke runs (P2: élke v1-run leest wat hij
  las); `'measured'` ZONDER data verandert niets en valt niet terug op een verzonnen band (P4 — de
  analyse-grid-terugval die V32 uit de poorten haalde); de toelating BEREIKT de zoektocht (V23 —
  er komt aantoonbaar een ander netwerk uit); de gerapporteerde fase IS het gemiddelde over exact
  de toegelaten punten, en die verzameling is een STRIKTE deelverzameling van het overlapvenster.
- `src/lib/engine2/frozenNetlistGates.test.ts` — zes V44-blokken over het HELE casusboek, en zij
  kosten geen tune. De dragende is **"de drie maten zijn drie GROOTHEDEN"**: er moeten netlists
  zijn waar elke controlekolom hoger leest dan M-K én netlists waar zij lager leest, plus
  handovers waar de twee controles aan WEERSZIJDEN van M-K vallen — dat kan geen enkele monotone
  herschaling van één getal (V23). Verder: elke bevroren netlist levert M-K met grond (a)
  gewapend; de dekking is ergens 100 % en ergens minder (anders zegt zij niets); de tegenspraak
  tussen de twee oude maten is nog steeds groter dan 10° ergens op het corpus; en de opgeschreven
  ontleding (`manifest_en_geometrie.v44_fasematen`, door de recorder geschreven) klopt met een
  verse meting, per netlist en per paar.
- `src/lib/engine2/optimizer/choiceKeyGuard.test.ts` — het VIERDE paar, met dezelfde scheiding als
  V33, V34 en V37: `phaseAdmission` is CHOICE (welke punten een oordeel dragen) en
  `phaseAdmissionFacts` is POLISH (de geldige band en de geestconventie die de run al in handen
  heeft). Migratie in beide richtingen breekt de build; de tweede mag nooit CHOICE worden, want
  een kandidaat die zijn eigen geldigheidsband meebrengt is een tweede mening over A5b.1.
  Sleuteltelling 44 → 46, verdeling 30/5/9 → 31/5/10. Plus de V44-verklaring: `full()` en `bare()`
  stellen allebei `'measured'` (de derde ONVOORWAARDELIJKE afleiding, naast V37's en V38-fix's),
  een expliciete `'overlap'` wint, en de toelating beweegt de vingerafdruk. **En een assert dat
  `phaseMetric` er los van staat** — beide waarden dáárvan middelen over het overlapvenster, dus
  die sleutel noemt de WEGING en kan geen toelating stellen. Dat was de correctie op de opdracht.
- `src/lib/engine2/optimizer/determinism.test.ts` — het `facts`-ingrediënt telt sinds V44 ZES
  feiten in plaats van vijf: de geestconventie van de aanroeper reist mee, want een run die er een
  stelt en een run die dat niet doet kunnen hetzelfde netwerk leveren en iets anders bedoelen over
  welke punten het oordeel droegen. De dekkingsassert kijkt naar namen, dus de telling erbij.

### V45-guards (A5e.2 gesloten: het niveau-anker, de doelcurve en de Q_es-grens)
- `src/lib/targetLevel.ts` — **de doelcurve als gesampelde kromme heeft één huis, met twee
  lezers.** Zelfde vorm en zelfde reden als `phaseAdmission.ts` (V44) en `impedanceFloor.ts`: het
  VOCABULAIRE blijft in `engine2/requirements/targetCurve.ts`, maar zodra de curve de ZOEKTOCHT
  mag sturen moet de tuner hem ook lezen — en die mag niets uit `engine2/` importeren. Wat
  oversteekt is daarom een kromme van OFFSETS plus de ene regel om hem te lezen: log-interpolatie,
  GECLIPT aan beide einden (extrapoleren zou een shelf onder zijn laagste sample eeuwig laten
  doorzakken), en gelezen op FREQUENTIE en nooit op index — de tuner evalueert zijn objectief op
  een gedecimeerd raster en zijn rapporten op het volle, en een array op index zou daar stilletjes
  twee verschillende krommen betekenen.
- `src/lib/engine2/requirements/targetCurve.test.ts` — de vier testsoorten van de metriek-skill op
  één bank, met diepte 6 dB en hoek 400 Hz zodat elke aflezing een heel of half getal is (200 Hz
  → −4, 400 → −3, 1200 → −1,5, 4400 → −0,5). P2: `flat` is exact nul en `isFlatTargetLevel` zegt
  het, mét de tegenproef dat de plateau-curve dat NIET is. NIEUWE MÉTING, en zij is de
  tegenproef die telt: de DIEPTE schaalt elk punt en verplaatst geen hoek, de STAP verplaatst de
  hoek en schaalt niets — twee grootheden, geen getal onder twee namen. P4: een gestelde vorm
  waarvan een parameter ontbrak levert GEEN offsets en noemt welke miste.
- `src/lib/engine2/optimizer/amplitudeReference.test.ts` — de tuner-helft, en de derde claim draagt
  de rest. Afwezig en `'flat'` zijn byte-identieke runs (P2: élke v1-run zoekt het veld dat hij
  altijd zocht); `'target'` ZONDER curve verandert niets en verzint er geen (P4 — de stille
  terugval die V32 uit de poorten haalde); een VLAKKE curve is de identiteit en wapent niets, want
  een mechanisme dat aantoonbaar niets kan bewegen hoort niet in een run te staan alsof het iets
  deed (V23); en de referentie BEREIKT de zoektocht — er komt aantoonbaar een ander netwerk uit.
  De doelcurve wordt uit het RASTER afgeleid (hoek op het meetkundig midden) en nooit ingetypt,
  zodat zij op deze fixture echt kantelt; een curve die alle punten gelijk verschuift is voor
  `bandStd` onzichtbaar en zou elke claim vacuüm maken.
- `src/lib/engine2/optimizer/choiceKeyGuard.test.ts` — het VIJFDE paar, met dezelfde scheiding als
  V33, V34, V37 en V44: `amplitudeReference` is CHOICE (wat er als vlak TELT) en
  `amplitudeTargetDb` is POLISH (de voicing van het ontwerp, gesampeld). Migratie in beide
  richtingen breekt de build; de tweede mag nooit CHOICE worden, want een kandidaat die zijn eigen
  voicing meebrengt is een tweede mening over wélke luidspreker ontworpen wordt. Sleuteltelling
  46 → 48, verdeling 31/5/10 → 32/5/11. **En een assert dat hij losstaat van `ampTarget`** — die
  kiest WELKE som vlak gemaakt wordt, deze wat er als vlak telt voor die som; de namen liggen
  ongelukkig dicht bij elkaar en samenvoegen zou één van de twee antwoorden onbereikbaar maken.
  Plus de kandidaatverklaring met DRIE toestanden in plaats van twee: geen curve, een `flat` curve
  en een onbruikbare curve leveren drie VERSCHILLENDE absent-zinnen, en de test eist dat het er
  drie zijn — anders kan een lezer niet zien welke toestand de afwezigheid produceerde.
- `src/lib/engine2/optimizer/determinism.test.ts` — **de feiten-dekkingsassert LAS ZIJN EIGEN
  LIJST, en V45 liep er dwars doorheen.** Er stond `expect(Object.keys(variants).length).toBe(6)`
  onder een commentaar dat beloofde dat élk veld van `MeasurementFactsPayload` hierboven geoefend
  wordt. V45 voegde twee velden aan dat type toe, schreef geen varianten, en de telling was nog
  steeds 6: groen. Een bewaker die telt wat een sessie met de hand bijhoudt kan niet zien wat die
  sessie vergat. De veldenlijst komt sindsdien uit de BRON van het payload-type — dezelfde
  techniek die `choiceKeyGuard.test.ts` op `NetOptimizeOptions` gebruikt en om dezelfde reden — en
  de assert eist twee kanten op: elk gedeclareerd veld wordt door minstens één variant geraakt, en
  geen variant raakt een veld dat het type niet kent. Nagemeten dat hij kán falen: één variant
  weghalen noemt het vergeten veld bij naam.
- `src/lib/engine2/optimizer/borderFacts.test.ts` — lek 3 is OMGEKEERD, in de V15-brugvorm. De
  claim die tot V45 `/not applied/` asserteerde assert nu dat die woorden er NIET meer staan: de
  asymmetrie die F4b moest opbiechten (rapport past de marge toe, zoektocht kan het niet) bestaat
  niet meer. Plus de acceptatie van A5e.2 als scan — `TODO(A5e.2)` komt niet meer voor in
  `worker.ts` en `gapBudgetDb: null,` evenmin — en de nieuwe claim eronder: het verankerde budget
  STEEKT OVER, met de ANKER-naam ernaast, en het beweegt de vingerafdruk.
- `src/lib/engine2/goldenCasus1.test.ts` — `verankerde_gaps_dB` is een ACCEPTATIECRITERIUM
  geworden. De waarden worden uit het referentiebestand gelezen en niet in de test getypt, en er
  staat een BRUG naast: met de voicing eruit reproduceert dezelfde meting de oude waarden
  (0,89 / 3,44), mét de tegenproef dat de nieuwe daar aantoonbaar van verschillen — zonder die
  laatste is de brug dezelfde assert twee keer.
- `src/lib/engine2/frozenNetlistGates.test.ts` — vijf V45-blokken over het HELE casusboek, en zij
  kosten geen tune. De Q_es-eis is HAALBAAR (HUIDIG haalt haar) en NIET VACUÜM (netlists in het
  casusboek overschrijden haar, en de ergste is er een van); het opgeschreven `v45_qes`-blok
  reproduceert uit een verse meting per netlist; de doelcurve verplaatst de verankerde gaps in
  TEGENGESTELDE richting (woofer omhoog, tweeter omlaag — wat geen enkele gelijke verschuiving kan)
  en het blok blijft klasse A (alle drie de referentiefilters leveren hetzelfde ankerblok). En de
  vijfde is de scherpste: **de twee q-kolommen lopen naar BEIDE kanten uiteen.** Waar de weg
  reactantie draagt leest M-E hoger (HUIDIG +0,08); waar er een SHUNT over de driver staat leest
  M-E LAGER (`V43_KAND_1`: 2,17 Ω tegen 4,46 Ω padweerstand, q 1,71 tegen 2,46). De eis zoals
  gehandhaafd is daar dus STRENGER dan de eis zoals gemeten — de veilige kant, maar een eigenschap
  die alleen een meting kan vaststellen, en zij staat als open punt in het manifest.
- **De eerste versie van dat blok asserteerde monotonie en de data weerlegde haar.** Dat is hier
  de moeite van het opschrijven waard: de aanname was "M-E leest altijd hoger, want reactantie kan
  er alleen bij komen", en zij is fout op elke netlist met een shunt. De assert is vervangen door
  wat er werkelijk gemeten is, met beide uitersten bij NAAM, zodat elke richting met de hand tegen
  één rij te controleren is in plaats van als aggregaat geloofd te moeten worden.

### UI-1-guards (wat de Working-tab toont na een v2-run)
- `src/lib/engine2/optimizer/selection.ts` + `selection.test.ts` — **de UI-laag ná
  `handleV2Request` lag tot 01-09-2026 buiten ELKE test, en zij deed al die tijd het verkeerde.**
  De workerroute heeft `workerRouteRegression`, de shortlist heeft `shortlist.test.ts`, de
  weigering heeft `wholesaleRejection.test.ts` plus een eigen live ketenrun — en wat de app
  vervolgens mét de shortlist deed was ongedekt. Nagegaan en niet aangenomen: geen enkel
  testbestand noemde `workingDesign`, `WORKING_ID` of `applyScanCandidate`. Wat het deed was
  `rankChain3Results(results)[0]` in de Working-tab zetten: de V1-RANGLIJST, die geen poort, geen
  eis en geen wholesale-weigering kent, dus zij kroonde een kandidaat die v2 had weggegooid — en
  V31 wist de onderdelen van zo'n kandidaat (`parts` én `net.parts`) voordat het resultaat de
  worker verlaat. `setWorkingDesign([])` zette `networkActive` er onvoorwaardelijk achter. Gevolg
  op de live site: "No generator — add a source element" in de Working-tab, de kale drivers
  gesommeerd in élke grafiek, vier badges die die som een cijfer gaven, en één groene regel
  "Design ready — the winner is loaded in the Working tab". **`net.after` overleeft de weigering
  wél** (die cijfers beschrijven het geweigerde netwerk), en daar komt de "Z min 0,8 Ω" in Sanders
  melding vandaan: een echte meting aan een netwerk dat niet bestaat.
  De regel is nu een WAARDE en geen reeks `setState`-aanroepen — de V32-vorm:
  `selectFromShortlist(shortlist, label?)` levert óf een ontwerp óf een getypeerde reden
  (`no-run` / `nothing-feasible` / `refused` / `unknown-label` / `empty-network`), en `App.tsx`
  past het antwoord toe via dezelfde `applyScanCandidate` die de scan-tabel al gebruikte. Acht
  claims, gebouwd op ECHTE shortlists uit `buildShortlist`. **De claim die er het meest toe doet
  is niet "er wordt niets geladen"** — het defect was dat er iets ánders laadde — dus de zin bij
  een lege shortlist sluit de v1-ranglijst bij NAAM uit, en de test assert die zin. Nagemeten dat
  hij kán falen: `rows.find(...) ?? rows[0]` (de stille terugval) zet hem op rood.
  De vijfde reden `empty-network` hoort onbereikbaar te zijn en staat er omdat een lege
  onderdelenlijst die de Working-tab bereikt exact dit incident IS.
- **`anchoredGaps` WEIGERT sinds UI-1 te rekenen als een niveau op een onbekende vensterband rust.**
  F3b's `suspectBands` drukte een kanttekening af BOVEN een verder compleet blok — anker, gap per
  weg, drie verzwakkingsbudgetten — en de demobundel bewees dat dat niet genoeg is: er stond een
  waarschuwing én er stond een anker, en dat anker was het verkeerde (`low` in plaats van `mid`).
  `report.predesign.gapsBlocked` draagt de reden. **Op ÉLKE weg en niet alleen op de weg die het
  anker zou worden:** het anker is per definitie de STILSTE weg, dus je weet pas welke weg de rol
  draagt als je élk niveau gelooft, en een niet-anker met onbekende vloer overdrijft zijn eigen gap
  en zijn eigen budget. De uitweg is een INVOER (de header van het bestand, of de venstertijden in
  het A5a-formulier) en er is met opzet geen "reken toch"-knop. `manualWindowAndLobing.test.ts`
  meet de inversie nog stééds — herberekend uit de eigen ongevloerde niveaus van het rapport, want
  "er werd geweigerd" is een bewering die niemand kan narekenen.
- **De demobundel op de site IS casus 1, en de wooferbestanden waren hun ARTA-header kwijt.**
  Gemeten per bestand (hash, header, kromme): `mid-hor0.txt` en `tweeter-hor0.txt` zijn de
  fixturebestanden herbemonsterd op 500 punten, grootste |ΔdB| **0,001**; `woofer-pair-hor*.frd` is
  de complexe SOM van `woofer_up_hor_*` en `woofer_down_hor_*`, grootste |ΔdB| **0,002**. Die
  sommatie schreef `* Reference time = 2,5 ms` en `* Right window = 5,021 ms, Tukey 0.25` weg en
  zette er een prozaregel voor in de plaats. **Twee parsers, één bestand, twee antwoorden:**
  `xoWindow.gateHeaderOf` (v1) accepteert de vorm `ARTA gated 5.021 ms` en las 5,021;
  `ingest/manifest.parseArtaHeader` (engine2) matcht op VELDNAAM en las niets — en engine2 heeft
  óók de referentietijd nodig, want de vloer is `1/T` met `T = rechter venster − referentietijd`.
  De reparatie is de DATA en niet de parser: de twee regels staan terug op alle vijf de afgeleide
  bestanden, met in het bestand zelf waarom (beide bronbestanden dragen ze woordelijk, en een
  complexe som van twee gelijk gepoortte responsen heeft die poort). **De parser blijft zoals hij
  is** — hem proza laten lezen zou betekenen dat een willekeurige commentaarregel een
  geldigheidsvloer kan zetten, en die vloer is A5b.1(i): hard, automatisch, bindend.
- **`not judged` is sinds UI-1 een eigen POORTSTATUS.** Een poort met gestelde grens en waarde
  `null` is `active: true, pass: true` — met opzet, want "we konden niet kijken" mag niet als "hij
  faalde" gerapporteerd worden. De statuscel las die `pass` en drukte **`inside`** af: de sterkst
  mogelijke lezing van het zwakst mogelijke bewijs. De data was al eerlijk (`value: null`, `reason`
  begint met "not evaluated"); alleen de cel klapte drie toestanden tot twee. Gemeten in de
  draaiende app: M-B/EPDR met grens 2,00 Ω en geen netwerk leest nu `not judged`.
- **`report.subject.network`** — het rapport zegt sinds UI-1 zelf op welk NETWERK het gebouwd is,
  of `null`. Zonder dat moest het paneel leegte afleiden uit een patroon van afwezige rijen, en dat
  is de app die haar eigen invoer reconstrueert. Zonder netwerk stond er een volledige pagina
  tabellen die als een verdict over een ontwerp leest en over niets ging.
- **A5e.2 HAD GEEN VELD.** V45 gaf de engine `bass-plateau`, liet de doelcurve óók de zoektocht
  sturen en sloot A5e.2 erop — en gaf niemand een manier om er een te STELLEN: de app las
  `activeDesign.targetCurve` op vier plaatsen en schreef hem nergens, het opslagtype in
  `project.ts` kende de vorm niet, en het paneel drukte "Target curve: flat" af als een feit over
  elke run ooit gemaakt. De besturing staat er nu, en de tweedeling van A5e.2 is erin terug te
  zien: de DIEPTE wordt gesteld, de OVERGANG wordt afgeleid uit de kastbreedte **bij het lezen en
  nergens opgeslagen** (een opgeslagen overgang is een meting die in een ontwerp bevriest en
  onzichtbaar veroudert). Gemeten in de draaiende app: 260 mm → 442 Hz. Twee bijvangsten:
  `saveActiveDesign` nam de voicing niet mee (elke bewaarde kopie zou stil vlak zijn geweest — de
  vergelijking die A5e.2 gemakkelijk moest maken, stil onmogelijk), en `shortlist.ts` droeg een
  TWEEDE implementatie van "is deze curve bruikbaar" die sinds V45 een werkende plateau-curve als
  onbeoordeelbaar rapporteerde.

### V47-guards (welke regel een onbeschermde bovenste driver verbiedt)
- `src/lib/protectionDeficit.ts` — **de beschermingsmaat van de tuner heeft sinds V47 één huis, en
  twee lezers.** Zelfde vorm en zelfde reden als `impedanceFloor.ts`, `phaseAdmission.ts` en
  `targetLevel.ts`: `protSqDb` werd binnen een closure in `metricsOn` berekend en was nergens
  leesbaar, en zodra hij ook als CONTROLEKOLOM gerapporteerd moet worden zijn er twee lezers. De
  getallen (vloer −15 dB, band tot `xo/3`) zijn v1-erfenis en zijn alleen BENOEMD, niet herzien —
  de extractie mag geen enkel getal verplaatsen en de byte-baselines van `f4cRegression` en
  `workerRouteRegression` zijn wat dat afdwingt (nagemeten: beide reproduceren).
  `engine2/metrics/protection.ts` is de adapter die de rapportwereld erop aansluit; hij bouwt de
  grootheid niet na.
- **DE DEKKINGSVRAAG, en het antwoord is een MÉTING die de naam van de oude regel weerlegt.**
  `protSqDb` integreert onder `xo/3`; M-C leest f_s. **HET ANTWOORD IS ABSOLUUT: op het
  TWEETERPAAR leest de oude maat exact 0,000 dB² op élke netlist van het hele casusboek** — 117 van
  117 — inclusief de twee die de eis met tien dB overschrijden. Zij is niet STUK: elders leest zij
  wél boven nul (`V38FIX_KAND_5` 1,226 dB², `V37_KAND_3` 0,063, `V33_KAND_5` 0,018), maar die
  tekorten komen alle drie van een paar waarvan de bovenste weg NIET de tweeter is. **Wat zij op
  deze casus mat is de MID** (f_s 88,8 Hz, binnen elke W-M-band): de vier geweigerde tunes dragen
  M-C op de mid van +4,5 / +0,5 / −1,7 / −5,3 dB. De melding "tweeter protection got worse" ging
  dus over de mid.
  **TWEE EERDERE VORMEN VAN DEZE CLAIM WAREN TE BREED EN DE DATA DOODDE ZE ALLEBEI**, en daarom
  staat er nu een die geen bandrekensom nodig heeft. (1) "Geen netlist kruist boven `3·f_s` =
  2773 Hz" — er zijn er drie (`V28_KAND_2` 3949, `V28_KAND_1` 3818, `V33_KAND_10` 3312). (2) "Geen
  netlist die de eis MIST kruist zo hoog" — dat zijn er twee (`V28_KAND_1` M-C −19,38,
  `V28_KAND_2` −22,87). Ook op díé twee, waar de band de resonantie wél bereikt, leest de maat nul:
  hoog genoeg kruisen is noodzakelijk noch voldoende.
  **DE TEGENPROEF:** élke condensator van HUIDIG opschalen jaagt M-C van −25,08 via −15,92 en
  −10,39 naar **+9,75 dB** terwijl `protSqDb` de hele weg exact 0,000 blijft — `xoF` zakt mee
  (2250 → 404 Hz), dus de band beweegt WEG van f_s in plaats van ernaartoe.
  **OPENSTAAND:** op de mid dekt de eis het RESONANTIEPUNT en niet de hele band eronder — daar was
  de vervangen regel een integraal en is de eis een punt. Op het huidige veld is dat leeg (de
  controlekolom leest nul op alle vier de levende netlists), en zij staat er om de eerste netlist te
  vangen die M-C haalt met een tekort boven nul.

### UI-2-guards (elke bewerking herrekent, of zegt waarom niet; de view is van de gebruiker)
- `src/lib/networkReadiness.ts` + `networkReadiness.test.ts` — **"kan dit netwerk gesimuleerd
  worden, en zo niet, waarom niet" heeft sinds UI-2 één huis, met drie lezers**: de sim-memo in
  `App.tsx` (oplossen of weigeren), de status onder de editor op de Network-tab, en de badges.
  Tot UI-2 had elk van de drie een eigen idee: de sim liet bij een solver-`throw` stil de KALE
  drivers als som door (met de foutregel op de Setup-tab), de editor drukte `validateNetlist` af,
  en de badges scoorden wat de sim teruggaf. Twee ernstgraden — GEWEIGERD (geen generator,
  kortgesloten of Rg ≤ 0, geen driver, driver zonder impedantie, waarde ≤ 0, één terminal) en
  GESIMULEERD MET GEBREKEN (driver zonder pad naar de generator, los onderdeel, draad die geen
  terminal raakt, losse ground, beide terminals op één net, tweede generator, niets aan ground).
  **"Pad naar de generator" wordt gelopen ZONDER door ground te gaan** — de ene regel verschil met
  `validateNetlist`, en het is de hele bevinding: een wooferketen die alleen nog aan ground hangt
  gold daar als verbonden. De test is een MUTATIETABEL op het echte KAND-V2-1 met de
  casus-1-impedanties (achttien rijen: elke editorbewerking, undo, redo, shortlist-rij) plus de
  gemeten casus: R5 weg → woofer exact nul en `validateNetlist` schoon; de draad één rij ernaast
  → byte-identieke overdrachten en de draad bij zijn eindpunten benoemd. Het bestand leest van
  schijf (`casus1.fixture.ts`), dus het is een test en geen bundelcode. Het bestand staat in
  `src/lib/` en niet in `engine2/`, want de editor is v1-laag en de regel geldt in beide modi
  (dezelfde reden als `impedanceFloor.ts`).
- `src/lib/chartView.ts` + `chartView.test.ts` — **een door de gebruiker gezet grafiekvenster
  overleeft een herberekening.** `Chart.tsx` had één effect dat de zoom liet vallen zodra een
  domein veranderde; de SPL-y-as is auto uit de data, dus élke bewerking die de luidste kromme
  over een 5 dB-stap duwde gooide óók de x-zoom weg (live gemeten met Rg 20 Ω: 80–140 → 75–135,
  zoom weg, x-as terug op "10k"). `effectiveView` is de pure regel: geen keuze → de basis volgen;
  een venster blijft in DATA-eenheden staan, schuift met behoud van span in een basis waar het
  niet meer in past, en valt samen met de basis zodra het even breed is — wat ook is hoe "use as
  view range" de zoom netjes beëindigt. Zes claims, en de dragende is de X-zoom die een
  Y-domeinwissel overleeft. Geldt voor élke `Chart`, want de regel zit in de component.
- **In `App.tsx`: `replaceActiveParts` is de ENIGE plek die de onderdelenlijst van de actieve tab
  vervangt** — `commitSchematic`, `undoSchematic` en `redoSchematic` roepen hem aan en verschillen
  alleen in hun geschiedenisboekhouding. De sim-memo vraagt `readiness` vóór de solve; op de
  editor-route is een `throw`, een `ambiguous` slot-mapping en een niet-eindige oplossing een
  WEIGERING en geen stille terugval. Een geweigerde tekening houdt de VORIGE gesimuleerde
  toestand op het scherm (alleen zolang drivers, impedanties en tab dezelfde zijn), gedimd, met
  de tag "previous state — network not simulated" op elk grafiekpaneel, één chip "Not simulated"
  in plaats van Response/Overlap/Phase, een banner boven de SPL en een DRC-regel. De Timing-chip
  blijft: hij beoordeelt de metingen en niet het netwerk. `validateNetlist` heeft in de app geen
  lezer meer en is niet aangeraakt.
- **Het "Draw wire"-gereedschap blijft na een draad actief** ("click the start point"); niet
  aangeraakt, wel genoteerd in de UI-2-entry.

### V47-nazorg-guards (een corpusgemiddelde is geen delta)
- `src/lib/engine2/casus1Corpora.fixture.ts` + `corpusPairing.test.ts` — **de leesregel bij elke
  vóór/ná-tabel, als test.** De corpuskaart, het instellingenblok waarmee beide helften gemeten
  worden, de afronding waarop de gemiddelden rusten en de gepaarde statistiek stonden alle vier in
  `compare-corpora.ts`; zolang die tabel de enige lezer was, was dat één implementatie. Zij wonen nu
  in de fixture, met het script en de test als twee lezers (V21). Zeven claims. De dragende twee zijn
  RICHTINGSCLAIMS en geen getallen: op V45 → levend leest het corpusgemiddelde van de W-M-fase als
  winst terwijl de gepaarde delta verslechtert, en leest de dissipatie als verlies terwijl de
  gepaarde delta verbetert — dezelfde twee corpora, dezelfde grootheden, tegengestelde conclusies.
  De derde knoopt ze vast: omdat er niets is bijgekomen is het gepaarde ná-gemiddelde per
  constructie hetzelfde getal als het corpusgemiddelde ná, dus het hele verschil zit in de
  VÓÓR-helft. **De ankerproef is `V30 → V32` en zij is volledig gedateerd, dus onverouderbaar:**
  V32 veranderde geen enkel ontwerp en trok er drie in, en daar is élke gepaarde delta EXACT nul
  terwijl de corpusgemiddelden bijna acht procentpunten bewegen — het compositie-effect zonder één
  bewegend netwerk eronder. Verder: een paar waarvan één helft niets meet telt aan géén van beide
  kanten mee (nagemeten dat hij kán falen), en de marge waarmee vergeleken wordt is twee ordes
  kleiner dan het verschil dat hij moet zien. **De V45 → levend-helft hoort bij de eerstvolgende
  regeneratie HERANKERD te worden op het dan bevroren V47-corpus** — dezelfde herankering die V43 op
  `v42_bult_bevinding` toepaste; een falende test is daar de bedoeling.

### V47b-guards (de tweetereis wordt voorlopig −20 dB)
- **Het getal zelf woont in `manifest_en_geometrie.gestelde_eisen.tweeter_drive_op_fs_max_dB` en
  nergens anders** — V47b verplaatste het van −25,0 naar −20,0 zonder één regel engine-, poort- of
  inversiecode aan te raken, en dát is de claim: `casus1MaxDriveOnFsDb` leest het, de fixture
  spreidt het, en de generator schrijft het in `v2_poorten_bron`. Een grep op `-25` of `-20` in
  `src/lib/engine2/` buiten tests en fixtures hoort leeg te zijn (p6Lint bewaakt de literalen).
- `src/lib/engine2/frozenNetlistGates.test.ts` — **de HUIDIG-assert is OMGEKEERD.** Tot V47b eiste
  het V47-blok dat één tiende strenger HUIDIG zou veroordelen ("HUIDIG is de maat"); sinds V47b
  eist het dat HUIDIG de eis met MEER dan een dB haalt. Zit hij er ooit binnen een dB van, dan is
  het getal stilletjes weer HUIDIG's afronding geworden (de V47-vorm, die bij hermeting na
  inspelen het eigen referentiefilter veroordeelt) of is HUIDIG op de regel gedreven — allebei
  bevindingen en geen groen. De vlaggen op `V45_KAND_5/_6` staan ongewijzigd en dragen de grens
  die VANDAAG geldt (−20): een uitzonderingslijst die een vervallen grens noemt is boekhouding
  van niets, en het blok assert `gestelde_grens_dB` tegen de gestelde eis én tegen een verse
  meting. Het "LEVENDE corpus haalt haar"-blok is de acceptatie van de regeneratie: 14 wegen,
  0 eroverheen.
- `src/lib/engine2/casus1Corpora.fixture.ts` — de meetbank draagt sinds V47b een
  `verticalWindowDeg` (±15°, het venster onder `lobing_eind_dip_15gr`), want zonder venster staat
  de lobing-SYNTHESE uit en was de M-F-kolom in `compare-corpora.ts` leeg zonder dat iemand het
  zag. `corpusPairing.test.ts` bleef groen op hetzelfde bankpad: fase en dissipatie lezen het
  venster niet, en dat is nagemeten en niet aangenomen (zeven van zeven, ongewijzigde getallen).
  **corpusPairing hoefde NIET herankerd:** de opdracht voorzag de V45→levend-faalvorm, maar V48
  had die helft al op `v45 → v47` gezet, dus beide vergelijkingen zijn volledig gedateerd.
- `src/lib/networkReadiness.test.ts` — **HERANKERD op `V48-KAND-1`/`-2`, en dat was een bewaker
  die werkte op de verkeerde manier.** UI-2 las de mutatietabel op het LEVENDE `KAND-V2-1`, en
  de rij "delete a wire (the feed to the mid branch)" pint hoeveel onderdelen er dan stroomloos
  raken. De V47b-regeneratie gaf `KAND-V2-1` een mid-tak met één onderdeel meer, en de rij ging
  rood zonder dat er één regel readiness-code veranderd was — de stille-verouderingsval die V43
  op `v42_bult_bevinding` en V48 op `corpusPairing` al vingen, nu op een UI-test. `V48-KAND-1` is
  byte-identiek aan het bestand dat UI-2 toetste (met `cmp` nagegaan tegen het pre-regeneratie
  `KAND-V2-1`), dus geen enkel getal in de tabel bewoog. **Regel voor élke test die een
  `KAND-V2-*`-bestand van schijf leest en er een GETAL op pint: lees het gedateerde corpus.** De
  live bestanden zijn voor de guards die het levende veld moeten volgen (`casus1V2Candidates`,
  `frozenNetlistGates`), niet voor een tabel die één topologie beschrijft.
- **Een ruimere poort is óók geen passieve waarnemer.** V47 mat dat een gewapende poort een
  kandidaat kan kosten die zonder haar aan haar voldeed; V47b mat het spiegelbeeld: `548,5 ·
  1981,2` werd onder −25 geleverd en onder −20 op de MID geweigerd (−7,3 dB), en `396,7 · 1491,4`
  werd onder −25 op −16,2 geweigerd en onder −20 op −29,86 geleverd. Wie een grens verplaatst en
  het veld als monotone functie van die grens leest, leest het verkeerd — de zoektocht loopt onder
  elke grens een ander pad.

### V49-guards (M-C excursie-gedragen: de grens is een eigenschap van de driver)
- `src/lib/engine2/metrics/driveExcursion.ts` + `driveExcursion.test.ts` — **M-C v2.0 als zuivere
  functies, en elke bouwsteen is een handberekening.** `x/V = Bl·Q_ms/(Z_max·N·M_ms·ω₀²)` (route 1),
  `x/V = p·2π·r/(ρ₀·S_d·N·ω₀²·V_meet)` (route 2, rondgang op een kolvenformule), `V_piek =
  √(2·P·R_nom)`, het plafond als ratio, de passband-relatieve grens als één aftrekking
  (`derivedDriveLimitDb`, de ENE regel die de eis aan de F1-conventie knoopt — poort en rapport
  roepen hem aan). De vier testsoorten van de metriek-skill: handberekening met ronde getallen
  (ω₀ = 1000 rad/s, x/V = 0,05 mm/V), de uit-toestanden met het ontbrekende veld bij naam (P4),
  nieuwe meting (f₀ ×2 ⇒ ÷4, Z_max ×2 ⇒ ÷2, Q_ms ×2 ⇒ ×2 — drie wetten, geen getal onder drie
  namen, V23), en het één-resonatormodel dat óp f₀ exact de resonantieformule reproduceert en
  eronder stijfheidsgestuurd is. Versiestring `drive-excursion/2.0`: een MAJOR, want de
  GROOTHEID waaruit de grens volgt veranderde. Geen X_max, marge, vermogen, last of meetspanning
  in dit bestand; de twee nieuwe constanten zijn ρ₀ (physical) en 20 µPa (norm).
- `src/lib/engine2/ingest/impedance.ts` — **`z-resonance` 1.0 → 1.1: elke motionele piek draagt
  Small's Q_ms en Q_es** (halfvermogen op √r0·R_e, dezelfde constructie die `SealedDiagnosis` al
  voor het sealed fundamenteel deed). De vorm groeide, geen getal bewoog; de cache vervalt
  (A5e.5). Op de mid IS `qms` van de fundamentele piek `sealed.qmc` — één constructie, twee
  lezers, en `goldenCasus1` assert het.
- `src/lib/engine2/optimizer/driveCeiling.test.ts` — **wat er met het getal gebeurt ná de
  metriek.** `effectiveDriveLimit` (gates.ts): gesteld, afgeleid, of de STRENGSTE — in beide
  richtingen getest, met `limit_source` op het oordeel; niets gesteld = M-C uit en élke andere
  poort byte-identiek (P2); een plafond alleen wapent M-C; een plafond voor een ándere driver
  oordeelt deze niet; zonder doorlaatbandgemiddelde kan de afgeleide helft niet gevormd worden en
  oordeelt het gestelde getal alleen, gezegd. De `drive-series-c`-voorbound leest DEZELFDE regel
  (24 dB vereist bij een plafond van −30 re ingang op een doorlaatband van −6). De vingerafdruk
  beweegt met het plafond (`gateSettingsKey`, per driver, afgerond op negen cijfers) en met het
  ACHTSTE feit (`measurementFactsKey`); de kandidaatverklaring leidt `protectionRule: 'stated'`
  óók af uit een afgeleid plafond.
- `src/lib/engine2/optimizer/determinism.test.ts` — de feiten-dekkingsassert dwong het achtste
  feit af (`driveCeilingDbByModel`), precies zoals hij V45's twee velden had moeten afdwingen.
- `src/lib/engine2/frozenNetlistGates.test.ts` — zes V49-blokken over het HELE casusboek, en de
  dragende is een BEVINDING MET EEN TEGENPROEF: op élke weg van het LEVENDE corpus en de drie
  referentiefilters is de afgeleide grens RUIMER dan de gestelde −20, dus het gestelde getal bijt
  daar overal en de effectieve poort is niet bewogen; over het hele boek bijt het plafond WÉL
  ergens — op zeven mids van het V28-corpus, met doorlaatbanden bóven de ingang, 0,05–0,59 dB —
  en die verzameling moet exact de verzameling zijn die `v49_excursie` noemt. **De eerste vorm van
  deze claim zei "op élke weg van élke netlist" en viel om op `V28_KAND_4/mid` (−20,054): de
  V47-assert "de gestelde grens bereikt élk oordeel" las `limit` en leest sinds V49
  `stated_limit_dB`, want de limit is de STRENGSTE van twee.** Verder: het plafond is klasse A
  (identiek op alle drie de referentiefilters); de afgeleide mid-grens ligt op élke netlist van
  het beoordeelde veld ÓNDER −7,3 dB (V47b's mid-weigering was gevaarlijk, niet conservatief; de
  twee V28-mids die 23–25 dB onder de ingang staan lezen een grens bóven nul en zijn de reden dat
  de claim over het beoordeelde veld gaat); het opgeschreven `v49_excursie`-blok reproduceert per
  weg en per zwakste-schakel-rij — **op de R_e-LEZING die het blok noemt** (Small's Q_ms leest het
  niveau √(Z_max·R_e), dus de woofer beweegt 0,2 mm tussen meterlezing en fit;
  `_excursie_parameters.R_e_lezing`); route 2 staat UIT met de meetspanning bij naam; en P2:
  zonder de excursie-invoer is het rapport wat het was, met dezelfde M-C-WAARDE en alleen het
  gestelde getal als grens.
- **CI ving bij V49 een exacte float-vergelijking op een AFGELEIDE grens** (`effectieve_grens_dB`
  `toBe` de verse limiet): op de zeven V28-mids is die limiet het afgeleide plafond, een float, en
  linux/Node 22 leest −20,05402383546058 waar darwin/Node 26 −20,054023835475075 opschreef — de
  A5e.4-precisering van V46, nu op een klasse-B-referentie. Lokaal groen, CI rood; sindsdien
  binnen de dB-klasse. Een gestelde grens is een exact getal, een afgeleide is dat niet.
- **De V47-guard is bij V49 van vorm veranderd zonder van claim te veranderen:** "M-C is ARMED on
  every protected way" pinde `verdict.limit === −20`; de limit is sinds V49 `min(gesteld,
  afgeleid)`, dus de guard pint nu dat het gestelde getal élk oordeel BEREIKT (`stated_limit_dB`)
  en dat de gelezen limit nooit ruimer is dan het gestelde getal.
- `src/lib/engine2/goldenCasus1.test.ts` — de klasse-A-referenties per driver
  (`afgeleide_parameters.<driver>.excursie_*`, met `_excursie_parameters` als V15-blok):
  x/V, de toegestane spanning en het plafond reproduceren op alle drie de referentiefilters, en
  `excursie_route_verhouding` is `null` en geen 0 (F0).
- **Elke casus-1-meetplek spreidt `casus1ExcursionSettings(golden)`** — `frozenNetlistGates`,
  `goldenCasus1`, de recorder, de generator, de meetbank (`casus1Corpora.fixture.ts`), beide live
  reproducties en `measure-v47-drive.ts` — zodat zij niet kunnen verschillen over de vraag of het
  plafond gewapend was (dezelfde V42-les als `CASUS1_V2_GATES`). De invoer zelf woont in
  `manifest_en_geometrie.driverkaart` en `.gestelde_eisen` (piekvermogen, nominale last, marge)
  en nergens anders (P6).
- **Het corpus is bij V49 NIET geregenereerd en NIET bevroren, en dat is een meting:** de
  afgeleide grens kan op de mid pas strenger worden dan −20 bij een doorlaatbandgemiddelde boven
  +2,3 dB en op de tweeter boven +11,4 dB, wat een passief netwerk niet levert, dus de zoektocht
  ziet onder `min(−20, afgeleid)` dezelfde poortbeslissingen als onder V47b; de live
  byte-reproductie in `casus1V2Candidates` bewijst het. `casus1_v2_herkomst.json` draagt daarom
  nog de V47b-vingerafdruk (`facts=` en `estimators=` bewegen pas bij de volgende regeneratie).

### V51-guards (geen niveauwerk op de laagste weg; schakeling per weg; het thermisch ontwerpvermogen)
- `src/lib/levelWork.ts` + `levelWork.test.ts` — **"niveauwerk op een weg" heeft één huis, met
  drie lezers** (de worker, het rapport, de guards), in de vorm van `impedanceFloor.ts`: een
  weerstand OP de bus bron→driver van de weg (een pad, de R van een L-pad, een shelf-pad, een
  top-octaaf-hold — met of zonder bypass), of een weerstand die ALLEEN van een busknoop van die
  weg naar massa hangt (de L-pad-poot). NIET: de R in een shunt-KETEN (Zobel, gedempte val) en de
  DCR van een spoel. De bus-walk is die van de tuner zelf — `busTopology` is bij V51 een wrapper
  over `busTopologyOfNetlist` geworden en exporteert `busNodesOf`/`nodesOf`, zodat een lezer met
  een netlist (het rapport) dezelfde walk vraagt als een lezer met een partslijst (de keten).
  `seriesInductanceByWay` ernaast: de totale seriespoel per weg. De test loopt op HUIDIG (R8 in
  het wooferpad, bij naam), op een GEDATEERD corpusbestand (nooit het levende, UI-2-les) en op een
  papieren netwerk waarin de vier onderscheidingen elk één onderdeel zijn; een onbereikbare driver
  is `reachable: false` en NIET `none`.
- `src/lib/engine2/ingest/wiring.ts` + `wiring.test.ts` — **de schakeling van een weg** (aantal
  gelijke drivers, gemeten en gewenst) en de afleiding parallel↔serie: SPL ∓20·log N, fase gelijk,
  Z ×N² / ÷N², met de AANNAME "gelijke drivers" in elke afgeleide noot. Op casus 1 de identiteit
  (gemeten = gewenst = parallel) en NIET toegepast; de rapportregel "N in serie zou 20·log N
  leveren" leest `parallelGainDb`. Handberekening op N = 2, 3, 4; P2 (N = 1 of gelijke schakeling
  = verbatim); versiestring `way-wiring/1.0`.
- `src/lib/engine2/optimizer/chainChoices.ts` — **de DERDE ketensleutel, `lowestWayLevelWork`, en
  de eerste met een ABSENT-toestand.** Gelezen vóórdat de tuner bestaat: de ontwerpstap trimt de
  laagste weg met 0 dB en stelt er geen shelf-pad op voor (`threeWayDesign.ts`,
  `lowestWayLevelWork`), haar synthese legt geen L-pad, geen top-octaaf-hold en geen shelf-pad
  (`synthesis.ts`, `noLevelWork`), en de tuner maakt nooit een weerstand aan (nagegaan: geen enkele
  pas construeert een `Resistor`; de escalatie voegt alleen een bypass-C toe). `declareCandidate-
  ChainChoices` leidt `'none'` af uit `lowestWayLevelWorkForbidden` (het gestelde
  `geen_niveauwerk_op_laagste_weg`), en NIETS uit niets — absent met P4, nooit een gesteld
  `'allowed'` (de V45-regel voor `'flat'`); een expliciete waarde wint. `chainChoices.test.ts` en
  `choiceKeyGuard.test.ts` pinnen de lijst op drie en het gat op twee.
- `src/lib/engine2/optimizer/lowestWayLevelWork.test.ts` — **de zes claims van de sleutel, door de
  echte route** (`handleV2Request`, payload door `structuredClone`), op de kleine fixture van
  `chainChoices.test.ts` met de WOOFER 6 dB opgetild zodat de historische regel hem werkelijk
  padt: afleiding en absent; de vingerafdruk beweegt; P2 (absent en een gesteld `'allowed'`
  byte-identiek); `'none'` BEREIKT de ontwerp- en synthesestap — de `'allowed'`-arm draagt
  niveauwerk op de laagste weg en de `'none'`-arm niet, en de netwerken verschillen (V23); en de
  WEIGERING: met de eis gesteld, X > 0 op de laagste weg (`gapBudgetDbByModel`) en een rimpeldoel
  dat het padloze ontwerp mist komt de kandidaat terug als V31-verwerping `kinds: ['topology']`
  met X in de zin, met de tegenproef dat dezelfde run met de laagste weg ALS anker (X = 0) en met
  een gehaald doel niet op deze regel weigert. Elke uitkomst draagt de kolom `levelWork`
  (eis, X, geleverde inventaris, plateau). Gemeten 145 s.
- `src/lib/engine2/optimizer/worker.ts` — **de weigering, `by: 'stated-topology'`**, in de V45-vorm
  en op dezelfde plek (ná de budgettoets, alleen als de tuner niet al weigerde): drie voorwaarden
  tegelijk — de eis gesteld, X > 0, en het geleverde netwerk mist het rimpeldoel van de trapmethode
  (`staged.rippleDb`, de eigen definitie van "doel gehaald" van de tuner en een keuze-sleutel).
  Waarom het rimpeldoel en niet het SPL-venster: het venster is een A5e.1-smaakeis die de ladder
  mag verruimen, en een niveaustap van X dB is geen smaak maar een configuratiefeit. X komt van
  `facts.gapBudgetDb[laagste]` (de A5d.4-gap, doelcurve erin, als meetfeit overgestoken) of is 0
  als de laagste weg het anker is; de geweigerde tune reist mee als rapportage. Plus per kandidaat
  een notitie met X, de geleverde inventaris (en een DEFECT-regel als die niet leeg is terwijl de
  eis dat vraagt) en de plateau-toets.
- `src/lib/engine2/requirements/targetCurve.ts` — **`plateauCoverage`**: ligt het gestelde
  plateau binnen de beoordeelde band? Beoordeeld zodra de bandvloer minstens
  `PLATEAU_JUDGED_OCTAVES_BELOW_STEP` (1, @p6 rule) onder de overgang ligt — een eerste-orde
  shelf staat dáár op twee derde van zijn diepte; anders "het niveau bij de overname is
  beoordeeld; het laag niet — geen aanname". Getest op een octaaf eronder (doel −4 van −6),
  vlak eronder, erboven, flat en een plateau zonder invoer.
- `src/lib/engine2/report.ts` — **`predesign.levelWork`**, rapportage en geen oordeel: de laagste
  weg, het anker, X (`aboveAnchorDb` uit de verankerde gaps, 0 als de laagste weg het anker is,
  null als de gaps geblokkeerd zijn), de schakeling per weg, wat serie zou leveren, de baffle step
  uit de doelcurve, de inventaris van de geladen netlist, de gestelde eis en de plateau-toets — in
  één zin die het paneel afdrukt (sectie "Pre-design — level work on the lowest way"). Invoer:
  `ReportSettings.wiringByDriver` en `.lowestWayLevelWork` (via `ProjectSettings`), door de
  adapter uit `AdapterBranch.wiring` en de gates-memo van de app gevuld.
- `src/lib/engine2/optimizer/gates.ts` — **`resistorThermalPowerW`**: het vermogen waarbij M-A/part
  oordeelt; absent = het continue vermogen (V50). `resistorJudgementPowerW` is de ENE regel, met
  twee lezers (de poort en `report.ts`, dat `resistorLoads` ermee vormt); het oordeel draagt
  `judged_at_W` en `judged_at_source`; in de vingerafdruk zolang de poort gewapend is.
  `buildabilityGate.test.ts`: tien keer minder vermogen is tien keer minder watt in dezelfde
  weerstand, de M-A-kolom beweegt niet, een thermisch vermogen alleen vormt óók watt (F0), en
  P2 zonder het veld.
- `src/lib/engine2/frozenNetlistGates.test.ts` — **zeven V51-blokken over het hele casusboek, plus
  het V50-bevindingsblok HERANKERD** (op het continue vermogen én op het gedateerde
  `V50_KAND_*`-corpus — de poort oordeelt sinds V51 bij 10 W, dus de V50-lezing komt van de
  M-A-kolom bij 100 W, en het levende corpus is het V51-veld zonder wooferpad). De dragende
  V51-claims: X is klasse A (hetzelfde op alle drie de referentiefilters, boven nul, en het anker
  is NIET de laagste weg — het casus-1-feit; gelijk aan `verankerde_gaps_dB.woofer_tov_mid`);
  het plateau wordt NIET beoordeeld, uit de eigen getallen van het blok; de TEGENPROEF dat de
  referentiefilters en élke V50-netlist niveauwerk op de laagste weg dragen; het LEVENDE corpus
  draagt er géén (en de seriespoel van die weg bestaat); het opgeschreven `v51_niveauwerk`-blok
  reproduceert per netlist; P2 zonder de eis en de schakeling. `FIELD` draagt daarvoor
  `levelWork`, `seriesLByWay` en `hottestAtRatingW` (de heetste weerstand bij het continue
  vermogen, van de M-A-kolom en zonder tweede rapport).
- `src/lib/engine2/casus1V2Candidates.test.ts` / `casus1V2Refusal.test.ts` — de meetopstelling
  noemt het TIENDE besluit (`niveauwerk_laagste_weg`, met herkomst), de schakeling per weg, het
  thermisch ontwerpvermogen en bij welk vermogen de poort oordeelt (`bouwbaarheid.oordeelt_bij_W`),
  en de gewapende M-A/part-bron; de weigerings-vocabulaire kent sinds V51 `budget` (V45) en
  `topology`.
- **Het corpus is bij V51 GEREGENEREERD** (`V2_JOBS=8`) met de eis gewapend en de weerstandseis op
  10 W thermisch, het V50-corpus vooraf bevroren als `V50-KAND-*` (`v50_corpus`). Wat het veld
  deed staat in de V51-entry en in `compare-corpora.ts v50 live`.

### V50-guards (bouwbaarheid als gestelde eis; de M-C-grens per weg)
- `src/lib/engine2/metrics/buildability.ts` + `buildability.test.ts` — **twee grootheden, allebei al
  in de oplossing, nu met een toegestane waarde per element.** `resistorLoads` LEEST M-A's eigen
  elementen (geen tweede integraal) en zet er de toelating naast: de opgave van het gesnapte
  catalogusonderdeel, anders de gestelde klasse, maal de gestelde marge; `coilLoads` leest de
  piekstroom per spoel als `|I_L(f)|·V_piek/E_g`, ONGEWOGEN en met de frequentie erbij — verzadiging
  is een gebeurtenis van een halve periode. `worstResistor`/`worstCoil` kiezen het element met de
  MINSTE MARGE en niet het heetste (een gemeten test: 2 W op 1 W is erger dan 20 W op 100 W), en een
  element mét toelating gaat altijd vóór een element zonder. Versie `buildability/1.0`. De vier
  testsoorten: handberekening op een papieren netwerk (Rg 1 mΩ, want de solver deelt de geleverde
  stroom door Rg — dat kostte de eerste versie van de test vier NaN's), uit-toestanden met het veld
  bij naam, nieuwe meting (piekingang ×2 ⇒ stroom ×2; vermogen ×2 ⇒ watt ×2, fractie staat), en de
  opgave-boven-klasse-regel met de SKU bij naam.
- `src/lib/engine2/optimizer/gates.ts` — **twee poort-id's erbij: `M-A/part` en `M-L`**, beide
  `subject: 'system'` met het element in de parameters. De limiet bestaat zodra klasse × marge
  gevormd kan worden, ook op een netlist zónder weerstand (dan ACTIEF en NIET GEOORDEELD, `value`
  null met de reden "no discrete resistor" — een nul zou als meting lezen, F0). `GateSettings`
  draagt sinds V50 `maxDriveOnFsDbByDriver`, `amplifierPowerW`, `resistorClassW`,
  `resistorPowerMargin`, `coilClassA` en `peakInputVolts`; `statedDriveLimitDb` is de ENE regel
  voor "per-weg eerst, dan het ene veld" en `effectiveDriveLimit` leest hem. `gateSettingsKey`
  neemt het continue vermogen en de piekingang ALLEEN mee zolang de poort die ze leest gewapend
  is — V36's "de wattkolom is geen vingerafdruk-ingrediënt" blijft staan voor elke run zonder
  toelating. `evaluateGates` heeft een vijfde argument `ratings` (`partRatings.ts`: wat de
  catalogus over de GESNAPTE onderdelen zegt, gelezen uit `VxpPart.catalog`; een stapel kernspoelen
  is zo sterk als haar zwakste lid, een stapel met één ongewaardeerd lid is ongewaardeerd).
- `src/lib/engine2/optimizer/buildabilityGate.test.ts` — de poortregel: absent is absent (P2 op de
  tweewegfixture: zonder de velden zijn alle andere oordelen byte-identiek, en de M-A-fractie is
  hetzelfde getal met en zonder vermogen), klasse zonder marge wapent niets en noemt het veld, de
  minste-marge-keuze, de drie null-toestanden met hun reden, de vingerafdruk (klasse, marge,
  vermogen alleen bij toelating), de per-weg-resolutie (dezelfde −15 dB is binnen op de mid zonder
  gesteld getal en eroverheen op de tweeter met −20), en `partRatingsOf`.
- `src/lib/engine2/frozenNetlistGates.test.ts` — **zes V50-blokken over het hele casusboek, en de
  dragende is een BEVINDING:** aan de gestelde klasse haalt géén referentiefilter en géén levende
  netlist M-A/part — HUIDIG's R8 met een factor > 4 — terwijl het casusboek wél netlists draagt die
  haar halen (achttien gedateerde, zonder wooferpad), dus de klasse beschrijft iets bouwbaars en de
  eis is niet vacuüm. Verder: elke bevroren netlist draagt beide oordelen (M-A/part gewapend op
  klasse × marge, M-L uit met de stroom zichtbaar en de "air-cored"-reden); het opgeschreven
  `v50_bouwbaarheid`-blok reproduceert per netlist; P2 zonder klasse en marge (zelfde watt, andere
  oordelen byte-identiek); de spoelstromen schalen met de piekingang (een kwart van het
  piekvermogen is de helft van de stroom, zelfde spoel, zelfde frequentie); en de run-fixture volgt
  de manifestbeslissing `bouwbaarheid_op_de_zoektocht.gewapend`. **Het V47- en het V49-blok zijn
  van vorm veranderd zonder van claim te veranderen:** "het gestelde getal bereikt élk oordeel"
  geldt sinds V50 voor de wegen die er een STELLEN (de tweeter), en een weg zonder gesteld getal
  moet `limit_source` "no stated dB figure" dragen; "de afgeleide grens bijt ergens" wordt gemeten
  tegen de CONVENTIE (−20) op elke weg, of die weg haar nu stelt of niet, want anders is de claim op
  een mid zonder gesteld getal leeg. Eén literal (`1e3` voor mH) ving p6Lint; hij leest nu
  `H_PER_MH`.
- **De gate-id-dekkingstest laat `M-A/part` null toe op een netlist zonder discrete weerstand**
  (`V28_KAND_1`), en eist dan de reden in de zin; `gates.test.ts`' "absent is off"-geval stelt
  sinds V50 een continu vermogen en een piekingang — dat zijn geen grenzen maar wat de twee poorten
  nodig hebben om überhaupt een getal te LEZEN, en `anyGateActive` blijft er false op.
- **De catalogus kent sinds V50 `maxCurrentA`** (`CatalogPart`, `CatalogSeries`, en in
  `catalogFile.ts` de spellingen `maxCurrentA` / `max_current_a` / `saturationA`). Inventaris van
  de v8-catalogus: 108 van 108 weerstanden dragen `powerW` (10 W: Jantzen MOX 53, Superes 40,
  Duelund CAST 7; 20 W: Mundorf MResist Supreme 8); 0 van 2116 spoelen dragen een stroomopgave
  (1482 Air Core, 611 P-Core, 9 Wax, 7 Aronit, 7 Zero-Ohm). De Jantzen C-Coil-documentatie noemt
  géén verzadigingsstroom ("getest met 1000 W, 700 W gedurende 48 uur") — daarom is de
  spoelklasse van casus 1 LEEG met die bevinding, en oordeelt M-L niets.
- **De bouwbaarheid is op de casus-1-ZOEKTOCHT nog niet gewapend, en dat is een gesteld besluit:**
  `gestelde_eisen.bouwbaarheid_op_de_zoektocht.gewapend` (false, met de reden) wordt door
  `casus1BuildabilityOnSearch` gelezen en `CASUS1_V2_GATES` volgt het; het rapport en de guards
  oordelen wél. Zet het op true en regenereer om haar te wapenen — en lees eerst de sanity: aan
  10 W × 0,5 bij 100 W haalt geen enkel bekend ontwerp de eis, dus dat levert vijftien verwerpingen
  en een leeg corpus, wat de suite niet draagt (V42: geen uitzonderingslijst ter grootte van het
  corpus).

### V48-guards (welk netwerk het seriespoel-plafond beschrijft)
- `src/lib/engine2/optimizer/bounds.ts` — **`seriesInductanceCeilingTracker` is dezelfde inversie,
  als FUNCTIE van de padweerstand.** `maxSeriesInductanceFromBump` lost op bij ÉÉN padweerstand;
  tot V48 was dat die van het ZAAD, en het antwoord stond daarna vast terwijl de tune diezelfde
  padweerstand verplaatst. V45 schreef dat op als open punt en beredeneerde het als veilig — meer
  serieweerstand dempt de resonante helft, dus een plafond opgelost bij een LAGERE padweerstand is
  hoogstens te streng — en dat klopt in één richting. **De andere richting is het defect:** een
  tune die de padweerstand VERLAAGT loopt onder een plafond dat voor een beter gedempt netwerk is
  opgelost, en dat plafond is toegeeflijk. De inversieformule is NIET aangeraakt en het budget is
  NIET verplaatst (1,4 blijft); wat verandert is bij welke padweerstand zij gevraagd wordt.
- **GEMÉMOÏSEERD OP EEN NAAR BENEDEN AFGERONDE KORREL, en beide helften daarvan zijn gemeten.**
  Eén inversie kost **13 ms** (zestig bisectiestappen, elk een volle `lfBump` over de gemeten NF en
  sweep) en een casus-1-kandidaat doet ~100 000 objectief-evaluaties — 21 minuten rekenwerk voor
  één grens. De padweerstand wordt daarom gekwantiseerd naar `BOUND_CEILING_PATH_R_GRAIN_OHM` en
  per cel één keer opgelost; een tune bezoekt enkele tientallen cellen. **Naar BENEDEN afronden is
  wat de benadering veilig maakt in plaats van alleen klein:** het plafond stijgt met de
  padweerstand, dus de onderrand van de cel geeft een plafond dat hoogstens te streng is — dezelfde
  richting die de geleverde-netwerk-toets van V45 één laag verderop garandeert.
- `src/lib/engine2/optimizer/lfBumpBorder.test.ts` — de drie claims onder die kwantisering, en zij
  zijn METINGEN en geen aannames. (1) Het plafond stijgt MONOTOON met de padweerstand, op de korrel
  zelf, over het hele bereik dat het casusboek noteert — één omkering maakt "naar beneden afronden
  is conservatief" onwaar. (2) De tracker leest op punten die met OPZET niet op de korrel vallen
  (het derde en het zevende tiende van een cel) nooit boven het exacte plafond, en de prijs van die
  veiligheid blijft onder een procent — met de grens ernaast, zodat een grovere korrel zichtbaar
  wordt in plaats van stil door te gaan. (3) A5e.4: dezelfde cel geeft hetzelfde getal, een VERSE
  tracker geeft dezelfde reeks, en een punt in de volgende cel geeft aantoonbaar iets anders —
  zonder die tegenproef zou een tracker die overal hetzelfde teruggeeft slagen.
- `src/lib/engine2/optimizer/ceilingTracking.test.ts` — de tuner-helft, op een SYNTHETISCH plafond
  en dat is een keuze: de vraag is of de tuner het plafond op het juiste moment en bij de juiste
  padweerstand afleest, niet of de inversie klopt. Zes claims. Afwezig en `'seed'` zijn
  byte-identieke runs **ook met de tracker in de groep** (P2 — het wapenen zelf kost niets, en zou
  dat falen dan was de vóór/ná van V48 geen vergelijking meer); `'tuned'` zonder tracker verandert
  niets (P4); een tracker die `null` teruggeeft laat het ZAADPLAFOND staan en nooit nul (een
  plafond van nul zou een ontwerpuitspraak op een dataprobleem zijn); het plafond wordt
  aantoonbaar afgelezen bij padweerstanden die het zaad NIET had; **het GELEVERDE netwerk staat
  onder het plafond van zijn EIGEN padweerstand en er ook tegenaan** (gemeten: 0,9122 mH geleverd
  tegen 0,9124 mH bij een geleverde padweerstand van 1,551 Ω, waar het zaadplafond 0,800 stond);
  en het bereikt de zoektocht (V23). **DE RICHTING OP DIE FIXTURE IS DE CONSERVATIEVE en dat staat
  er met zoveel woorden:** de tune loopt daar naar een HOGERE padweerstand, dus het zaadplafond was
  te streng. De toegeeflijke richting is geen eigenschap die je op een tweewegfixture kunt
  bestellen; zij is gemeten op het echte veld.
- `src/lib/engine2/optimizer/choiceKeyGuard.test.ts` — `seriesInductanceCeilingSource` is CHOICE en
  mag nooit naar POLISH of GREY migreren: hij bepaalt welke GROOTHEID de zoekdoos begrenst. Het is
  de TWEEDE sleutel na V47's `protectionRule` die ZONDER polish-tweelingzus komt, en de reden is
  dezelfde vorm: de gemeten NF en sweep die de inversie herleest reizen binnen
  `valueSumCeilings`, dat sinds F2 polish is precies omdat het data is die de run al vasthoudt.
  Sleuteltelling 49 → 50, verdeling 33/5/11 → 34/5/11. Plus de kandidaatverklaring: een gesteld
  LF-budget leidt `'tuned'` af, geen budget geeft ABSENT met de P4-reden en NOOIT een gesteld
  `'seed'` (dezelfde regel die V45 op `'flat'` en V47 op `'seed'` toepast), een expliciete waarde
  wint, en de bron beweegt de vingerafdruk. **Dat laatste is hier geen hoffelijkheid maar de hele
  meting:** de twee armen van `measure-v48-ceiling-tracking.ts` verschillen in dat ene woord.
- **DE GELEVERDE-NETWERK-TOETS VAN V45 BLIJFT STAAN, ONGEWIJZIGD, en is sinds V48 van betekenis
  veranderd zonder van code te veranderen.** Zij was de vangnet onder een bekend gat; zij is nu de
  BEWAKING dat het gat dicht is. Vuurt zij nog op een kandidaat die het volgende plafond gevolgd
  heeft, dan is de reparatie onvolledig en niet de kandidaat verkeerd.

### V41-guards (wat de ontwerp- en synthesestap mochten bouwen)
- `src/lib/engine2/optimizer/chainChoices.ts` — **een TWEEDE classificatielijst, en de smalheid is de
  claim.** `CHOICE_KEYS`/`GREY_KEYS`/`POLISH_KEYS` dekken de 44 sleutels van `NetOptimizeOptions`
  volledig; `CHAIN_CHOICE_KEYS` dekt **twee** sleutels van `Chain3Settings` (`eqBands`,
  `leanTargetDb`) en beweert niets over de andere dertig. V38 tekende de hele laag op als gat
  (beslispunt D) en V39 bezit hem; V41 sluit de twee sleutels die een MÉTING veroordeeld heeft.
  Dat is de norm die rij 11 van de A3j-tabel stelt: een classificatie beweegt wanneer een meting
  haar beweegt, niet op vermoeden. `withDeclaredChainChoices` is de V34-vorm van
  `withDeclaredSourceLimit`, één laag breder: geen verklaring ⇒ de IDENTITEIT, en dat is wat elke
  niet-v2-aanroeper byte-identiek houdt.
- `src/lib/engine2/optimizer/chainChoices.test.ts` — vijf claims, en de derde draagt de rest. De
  twee waarden zijn de ENGINE-standaarden, gelezen uit hun eigen huis (`SYNTHESIS_LEAN_DEFAULT_DB`
  in `synthesis.ts`, `DEFAULT_EQ_BANDS_PER_DRIVER` in `vfOptimizer.ts`) en een expliciete waarde
  wint; `withDeclaredChainChoices` is de identiteit zonder verklaring én met een lege verklaring
  (P2); de verklaring BEREIKT de ontwerp- en synthesestap — dezelfde kandidaat, dezelfde seed en
  hetzelfde budget leveren aantoonbaar een ander netwerk, want zonder die tegenproef zijn de
  andere claims even waar voor twee sleutels die nergens op aangesloten zijn (V23); en — de claim
  die de derde pas iets waard maakt — een arm die de OUDE waarden STELT is byte-identiek aan een
  arm die niets stelt en de ketensettings ze laat dragen. Drie ketenruns op de kleine fixture van
  `candidateRoute.test.ts`, krap budget.
- `src/lib/engine2/optimizer/choiceKeyGuard.test.ts` — twee V41-blokken erbij. De ketenlijst is
  gedekt (met een gatendetectie die is nagemeten), en **geen van beide sleutels mag naar de
  classificatie van de tuner migreren**: de spiegel van de "nooit terug"-pinnen die V33, V34, V37
  en V38-fix elk dragen, de andere kant op. `eqBands` bepaalt wat `deriveTopology` mag VOORSTELLEN
  en `leanTargetDb` of `synthesize` het BOUWT; een waardetune verschuift alleen getallen tussen de
  onderdelen die die twee gekozen hebben. De sleuteltelling van `NetOptimizeOptions` blijft 44 en
  de test assert dat de twee ketensleutels er niet in voorkomen.
- `src/lib/engine2/casus1V2Candidates.test.ts` — de meetopstelling noemt sinds V41 ook het
  EQ-budget en de lean-drempel (`eq_budget_per_tak`, `lean_drempel_db`), afgelezen van de
  ketenverklaring, met een assert dat de drempel aantoonbaar NIET het stopdoel van de trapmethode
  is. Vijfde en zesde besluit naast V30/V33, V34, V37 en V38-fix — en het eerste paar dat bóven de
  tuner zit.

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
`test-fixtures/casus1/KAND-V2-*.adsfilter.json` zijn de v2-kandidaten die de shortlist haalden —
negen bij F4d, tien vanaf V28, acht sinds V41, vier bij V42, zeven sinds V43, zeven na de V44- en
de V45-regeneratie, vier bij V47, vijf bij V48, zeven bij V47b en V50, **en ÉÉN sinds V51** (veertien van
vijftien verworpen: dertien op de versterkervloer, één op de mid-excursiegrens — zonder wooferpad
ontbreekt de serieweerstand die de impedantiebodem optilde) — bevroren als bestanden
op precies dezelfde voet als de drie v1-kandidaten — want F4a stelde vast dat casus 1 géén klasse-C-
referenties heeft, en "laat de suite de scan draaien en assert op wat eruit komt" zou de eerste maken.
Twee scripts, twee kosten:
- `npx vite-node scripts/generate-casus1-v2-candidates.ts` — vijftien ketenruns; de gemeten prijs
  per sessie staat bij het commando bovenaan, en zij is bij V41 van 42 minuten naar 4 u 23 min
  gegaan. Schrijft de netlists en `test-fixtures/casus1_v2_herkomst.json`. **Hij schrijft alleen de
  bestanden die de shortlist haalt en RUIMT NIETS OP:** krimpt de shortlist, dan blijven de
  overtollige `KAND-V2-*`-bestanden van de vorige run staan als wezen. Bij V41 (10 → 8) en
  opnieuw bij V42 (8 → 4) gebeurde dat, en de wezenloze-bestanden-wacht in
  `casus1V2Candidates.test.ts` is wat het zou hebben gevangen — verwijder ze met de hand, na te
  hebben gecontroleerd dat het bevroren corpus ze draagt. Bij V43 GROEIDE de shortlist (4 → 7),
  dus daar viel niets op te ruimen; nagegaan in plaats van aangenomen. Bij V44 bleef zij op 7 (één
  eruit, één erin), dus ook daar geen wezen — geteld en niet aangenomen.
- `npx vite-node scripts/record-casus1-v2-references.ts` — leest die bestanden en schrijft de
  klasse-B-blokken in de golden refs. Drie seconden, dus vrij om opnieuw te draaien. Sinds V36
  elf metrieken per kandidaat (`grootste_R_W_bij_100W` erbij) plus het afgeleide blok
  `manifest_en_geometrie.v36_dissipatie`; sinds V43 dertien (`lf_lift_dB` en
  `lf_opslingering_dB`) plus twee afgeleide blokken; **sinds V47 een VIJFDE afgeleid blok, `v47_bescherming`** — M-C tegen de
  gestelde aandrijfgrens, met f_s en de doorlaatband erbij, ÉÉN RIJ PER HOOGDOORLAATBESCHERMDE WEG
  en niet per netlist, want dat is wat de poort oordeelt; **sinds V45 een VIERDE afgeleid blok,
  `v45_qes`** — M-E op de laagste weg van élke bevroren netlist tegen de gestelde
  Q_es-vermenigvuldigingsgrens, met de bronweerstand, de PADWEERSTAND (de grootheid die de
  inversie werkelijk begrenst), beide q-lezingen, het plafond en het oordeel. Zelfde vorm en
  zelfde reden als `v36_dissipatie`, `v43_ontleding` en `v44_fasematen`: afgeleid, over het hele
  casusboek, en `frozenNetlistGates.test.ts` herrekent hem. **En elke `buildReport` in dit script
  draait sinds V45 op de DOELCURVE van het ontwerp** (`CASUS1_TARGET_CURVE`) en niet op `flat`,
  want de referenties beschrijven de runs; venster en RMS zijn daardoor tegen een andere
  referentie gemeten dan tot V44. **Sinds V44 zeventien** — de vier
  CONTROLEKOLOMMEN van de fasematen (`wm_fase_oct_octaafgeknipt_V43`, `mt_..._V43`,
  `wm_fase_overlapvenster_V43`, `mt_..._V43`) naast `wm_fase_oct`/`mt_fase_oct`, die sinds V44 M-K
  dragen. Die vier zijn de BRUG in V15's vorm: de oude waarden reproduceren nog steeds, zodat een
  getal dat bewoog te lezen is als een herdefinitie in plaats van als een regressie. Plus een derde
  afgeleid blok, `v44_fasematen`, dat alle drie de maten per netlist en per paar draagt — met de
  band, het puntental en de afwijzingen per grond — over ÉLKE bevroren netlist, om dezelfde reden
  als `v36_dissipatie` en `v43_ontleding`. `v43_ontleding` draagt de ontleding over
  ÉLKE bevroren netlist en niet alleen over het levende corpus — dezelfde vorm en dezelfde reden
  als `v36_dissipatie`, want de gedateerde corpora dragen hun eigen bevroren blokken en worden
  nooit herschreven. `v43_budget_bevinding` draagt wat het gestelde budget op het LEVENDE corpus
  doet, plus wat de drie referentiefilters op dezelfde grootheid meten. **Dat tweede blok is
  afgeleid en niet met de hand geschreven, en dat is de les van zijn voorganger:**
  `v42_bult_bevinding` noemde "het levende corpus", en zodra V43 dat corpus opnieuw opwekte zou
  die zin onwaar zijn geworden zonder dat iets faalde. Hij is bij V43 HERANKERD op het bevroren
  `V42_KAND_*`-corpus, waar hij niet meer kan verouderen.

**`scripts/` viel tot V37 buiten `tsc -b`** — `tsconfig.test.json` dekt `src/**` en geen enkele
scope dekte `scripts/`. **Sinds V37 dekt `tsconfig.scripts.json` het wél**; zie de aantekening bij
het commando bovenaan, die deze regel tegensprak zolang zij hier onveranderd stond.
Bij V36 kostte het gat een kolom vol `null` in het referentiebestand: `casus1Filter(...).parts`
op een `FilterInput` dat geen `parts` heeft kwam niet als typefout terug. Wie een script schrijft dat
referentiegetallen wegschrijft, kijkt het geschreven blok na vóór de commit.
De acceptatie zit in `casus1V2Candidates.test.ts`: de metrieken reproduceren op alle bevroren bestanden,
en **één** kandidaat wordt live door de échte route heen gereproduceerd — **nagemeten bij V43:
1130–2537 s, plus 608–629 s voor de verwerping ernaast; het hele bestand kost 1761–3146 s, en die
spreiding komt van de machine en niet van de code** (V42:
1427 + 653 s; V41: 1552 + 1046 s; V38-fix: 260 + 139 s; V37: 158 + 158 s). De ~41 s die hier tot V37 stond dateert van vóór V33: sinds de
barrière het veiligheidsraster leest kost élke live casus-1-run het viervoudige, en sinds V41 het
zesvoudige daarvan — de synthesestap koopt correctienetwerken, dus er zijn veel meer vrije waarden
te tunen. **Deze twee runs zijn samen het leeuwendeel van de suite** — en zij staan sinds
01-09-2026 in twee bestanden (`casus1V2Candidates.test.ts` houdt de byte-reproductie,
`casus1V2Refusal.test.ts` de verwerping), zodat zij naast elkaar draaien in plaats van na elkaar.
Gemeten in de volle run van 01-09-2026: 1244,3 s en 924,2 s, bij een wandklok van 1254,4 s.

**Sinds V51 zijn het er ZEVENTIEN corpora, en dat is opzet.** `KAND_V2_*` is het levende corpus.
`V28_KAND_*` is bevroren vóór de vloer een ZOEKDOEL was (V30); `V30_KAND_*` toen de poort nog blind
was onder de verre-veldbodem (V32); `V32_KAND_*` toen de BARRIÈRE nog het evaluatieraster las terwijl
de poort de sweep handhaafde (V33); `V33_SWEEP_KAND_*` is V33's dure referentiearm, met de barrière
op het poortraster zelf; `V33_KAND_*` is bevroren toen de BRONWEERSTANDSPROBE nog op de bovenrand van
zijn eigen zoekvenster landde en de v2-route nog een 2,0 Ω-grens droeg die niemand gesteld had (V34);
`V34_KAND_*` toen de DISSIPATIETERM nog door de piekhoogte deelde in plaats van door de opgeloste
R_e — 19,31 Ω tegen 3,05 Ω, en dat kwadrateert tot 40,1 (V37); `V37_KAND_*` toen de ZOEKTOCHT nog
de spreiding mat van een som van gegladde magnitudes met ongemoeide fase, waarbij de
gladdingskern de stille geest van net buiten de band over de bandrand trok en de amplitudeterm
van 1,85 naar 10,22 dB blies (V38-fix); `V38FIX_KAND_*` toen de ONTWERP- en SYNTHESESTAP nog
erfden wat de v1-keten toevallig droeg — `eqBands` ongesteld (een stille nul, dus geen enkele
EQ-band en daarmee geen enkele val op een gemeten breakup) en `leanTargetDb` afgeleid uit het
stopdoel van de trapmethode (2,5 dB tegen de eigen 0,5 dB van `synthesize`, waardoor de kale
ladder op 45 van de 45 takken slaagde) (V41); `V41_KAND_*` toen het LF-BULT-BUDGET nog niet
GESTELD was, dus geen enkele A5d.6-inversie de seriespoel van de laagste weg begrensde — 3,62 tot
7,93 dB opslingering, tot 7,34 mH in twee spoelen, en de inversie plafonneerde toen nog alleen per
component zodat een gesplitste keten er sowieso aan ontsnapte (V42); `V42_KAND_*` toen het budget
wel GESTELD was maar op de verkeerde GROOTHEID — op `extraDb`, de SOM van de resistieve lift en de
resonante opslingering, waardoor de eis niveauwerk mee veroordeelde (alle drie de
referentiefilters overschreden haar terwijl hun spoelen niets toevoegden) en boven ~1,5 Ω
padweerstand helemaal zweeg omdat het budget al op was vóór er een spoel bestond (V43);
`V43_KAND_*` toen de ZOEKTOCHT fase nog beoordeelde op elk rasterpunt waar de twee takken binnen
20 dB van elkaar lagen — zonder knip op meetgeldigheid en zonder vloer onder de stille geest,
waardoor zij over het hele casusboek 1047 punten meetelde die het rapport niet zag: 911 onder de
meetgeldigheidsvloer die de meetbestanden zelf opgeven en 14 waar beide takken dood waren en het
faseverschil uitsluitend van de filters kwam (V44); `V44_KAND_*` is bevroren vóór A5e.2 gesloten
werd, en daar ontbraken drie dingen tegelijk die alle drie over NIVEAUWERK gaan — het niveau-anker
was het KALE gemeten niveau (A5d.4(a) wil het NA baffle step, en dat object bestond niet), de
ZOEKTOCHT mat vlakheid tegen horizontaal terwijl het oordeel al een doelcurve kon lezen, en er was
geen Q_es-vermenigvuldigingsgrens, dus de weerstandsvlucht die V43 mat liep door tot 5,65 Ω
padweerstand op de wooferweg (V45); `V45_KAND_*` toen de TWEETERBESCHERMING nog uitsluitend
RELATIEF bewaakt werd — de volle-band-veiligheidspoort legde het beschermingstekort van het
geleverde netwerk naast dat van het ZAAD en casus 1 stelde niets op M-C. Wat dat kostte is bij V47
aan BEIDE kanten gemeten en de twee kanten wijzen tegengesteld: alle vier de kandidaten die zij weigerde
meten absoluut −3,43 tot −12,29 dB, dus zij ving daar echte schendingen — maar hetzelfde veld
LEVERDE twee netlists op −14,38 en −15,10 dB, omdat hún zaad even slecht was. Een regel die aan
het zaad hangt bewaakt het toeval en niet de driver (V47); `V47_KAND_*` toen het A5d.6-PLAFOND op
de seriespoel van de laagste weg nog EENMALIG werd opgelost, bij de padweerstand van het ZAAD, en
daarna vaststond voor de hele tune — terwijl de tune diezelfde padweerstand verplaatst. V45 schreef
dat op als open punt en beredeneerde het als veilig, en in één richting klopt dat: meer
serieweerstand dempt de resonante helft, dus een plafond opgelost bij een LAGERE padweerstand is
hoogstens te streng. Wat dat argument weglaat is de tune die de padweerstand VERLAAGT, en daar is
het plafond TOEGEEFLIJK — gemeten op Sanders browserrun van 01-09-2026: twee van negen kandidaten
leverden 2,29 en 1,61 dB opslingering tegen een gestelde 1,4, en de geleverde-netwerk-toets ving ze
allebei. Vangen is verliezen (V48); `V48_KAND_*` toen de TWEETERAANDRIJFGRENS nog op −25,0 dB
stond — de toevallige waarde van HUIDIG op één decimaal (−25,084), met 0,084 dB marge, zodat een
hermeting van het eigen referentiefilter na inspelen de eis kon laten omslaan, en zodat vier
V47-weigeringen tussen −21,8 en −23,5 dB, die de 18-dB-industrieregel op f_s ruim halen, als
kandidaat geweigerd werden. Bij V47b staat de eis VOORLOPIG op −20,0 (18 dB + 2 dB marge voor
f_s-drift), tot M-C excursie-gedragen is (V49); een gekozen dB-getal is geen generieke eis (V47b);
`V49_KAND_*` toen de M-C-grens nog ÉÉN getal voor elke hoogdoorlaatbeschermde weg was en
bouwbaarheid nergens een poort (V50); `V50_KAND_*` toen de LAAGSTE weg nog niveauwerk mocht dragen
— het anker is de mid, het wooferpaar staat er 1,33 dB boven (A5d.4, na de doelcurve), en élke
geleverde netlist betaalde dat in een serieweerstand in het wooferpad, 13,6–34,9 W bij 100 W
continu; V51 verbiedt dat pad (`geen_niveauwerk_op_laagste_weg`), wapent de weerstandseis op de
zoektocht bij 10 W thermisch ontwerpvermogen en wekt het veld opnieuw op — onderdeel-voor-onderdeel
identiek aan het V49-corpus, want V50 bewoog het veld niet (V51).
Alle zestien de gedateerde corpora zijn byte-identieke bestanden onder een andere naam, met hun
klasse-B-blokken mee, bewaard als de "vóór"-helften van hun vergelijkingen. Wie
een script schrijft dat het levende corpus opruimt gebruikt `^KAND_V2_\d+$` en nooit
`startsWith('KAND_V2')`: die tweede slikt de gedateerde corpora mee en gooit het bewijsmateriaal weg.
`record-casus1-v2-references.ts` en `casus1V2Candidates.test.ts` dragen die regel expliciet;
`goldenClassification.test.ts` is er sinds V33 vanaf — daar geldt de structurele regel dat élke
genoemde netlist die geen v1-baseline is een geclassificeerd blok moet hebben, omdat de
familielijst die er stond bij V32 vergeten is. De koppeling bestandsnaam ↔ kandidaat staat in
`manifest_en_geometrie.v30_corpus`, `.v32_corpus`, `.v33_sweep_corpus`, `.v33_corpus`,
`.v34_corpus`, `.v37_corpus`, `.v38fix_corpus`, `.v41_corpus`, `.v42_corpus`, `.v43_corpus`,
`.v44_corpus`, `.v45_corpus`, `.v47_corpus`, `.v48_corpus`, `.v49_corpus` en `.v50_corpus`, want zij
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
