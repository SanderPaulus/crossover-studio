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
    **Ná U-3d (10-09-2026) gemeten op 456 s — 170 bestanden (169 geslaagd, 1 overgeslagen), 2070 tests
    (2067 geslaagd, 3 overgeslagen), groen.** +1 BESTAND
    (`engine2/optimizer/polarityFold.test.ts`, 5 claims) en +5 tests — hetzelfde getal, want het corpus
    is niet geregenereerd. GEEN nieuwe referentie: de V43-waarde van 289 s blijft staan.
    **Ná U-3c (09-09-2026) gemeten op 462 s — 169 bestanden (168 geslaagd, 1 overgeslagen), 2065 tests
    (2062 geslaagd, 3 overgeslagen), groen.** Geen nieuw bestand; +1 test, de datasheetregel in
    `v2InputPlacement.test.ts` (14 → 15). GEEN nieuwe referentie: de V43-waarde van 289 s blijft staan.
    **Ná U-3b (09-09-2026) gemeten op 447 s — 169 bestanden (168 geslaagd, 1 overgeslagen), 2064 tests
    (2061 geslaagd, 3 overgeslagen), alleen gedraaid ná de browsercontrole met de dev-server en de
    headless Chrome gestopt.** +1 BESTAND (`lib/v2InputPlacement.test.ts`, 14 claims) en +23 tests, en die
    twee getallen sluiten exact: die veertien plus NEGEN in `demoBundle.test.ts`, dat van 21 naar 30 ging
    toen guard 2 verbreed werd naar de hele projectstaat en de kale-bundelrun erbij kwam. Het corpus is
    niet geregenereerd, dus geen enkele `it.each` over het levende corpus beweegt; `nfMerge.test.ts` blijft
    op 56 (de I-2-bronscan op de nabij-veldslot veranderde van VORM en niet van aantal — hij ging rood
    omdat het slot een `<details>` werd en zijn anker `className="nf-slot"` de aanhalingsteken verloor,
    precies wat een bronscan hoort te doen, en is vóór de volle laag bijgewerkt). GEEN nieuwe referentie:
    de V43-waarde van 289 s blijft staan, en 447 tegen U-3's 453 s is dezelfde laag op dezelfde machine.
    **Ná U-3 (09-09-2026) gemeten op 453 s — 168 bestanden (167 geslaagd, 1 overgeslagen), 2041 tests
    (2038 geslaagd, 3 overgeslagen), in één keer groen, alleen gedraaid ná de browsercontrole met de
    dev-server en de headless Chrome gestopt.** +1 BESTAND (`lib/demoBundle.test.ts`) en +21 tests, en
    die twee getallen sluiten exact: het bestand telt ZESTIEN `it`-declaraties, waarvan er vijf een
    `it.each` over de TWEE demobundels zijn, dus 16 + 5 = 21. `v2Settings.test.ts` staat op dertien
    zoals op HEAD — de U-3-claims daar zitten binnen bestaande `it`s (de twee bronscans die de vorm van
    `statedMark` en `restoreV2Settings` pinnen, en die bij U-3 rood gingen omdat die vorm een argument
    kreeg: zij deden precies wat zij moeten doen en zijn vóór de volle laag bijgewerkt). Het corpus is
    niet geregenereerd, dus geen enkele `it.each` over het levende corpus beweegt. GEEN nieuwe
    referentie: de V43-waarde van 289 s blijft staan, en 453 tegen U-1's 452 s is dezelfde laag op
    dezelfde machine.
    **Ná U-1 (09-09-2026) gemeten op 452 s — 167 bestanden (166 geslaagd, 1 overgeslagen), 2020 tests
    (2017 geslaagd, 3 overgeslagen), in één keer groen, alleen gedraaid ná de browsercontrole met de
    dev-server en de headless Chrome gestopt.** +1 BESTAND (`v1Carryover.test.ts`, 16 claims) en
    +16 tests, en die twee getallen zijn HETZELFDE getal: het corpus is niet geregenereerd, dus geen
    enkele `it.each` over het levende corpus beweegt, en de twee herschreven I-1-claims in
    `v2InputRegister.test.ts` zijn een herformulering en geen telling (18 vóór en ná). GEEN nieuwe
    referentie: de V43-waarde van 289 s blijft staan, en 452 tegen B-1's 461 s is dezelfde laag op
    dezelfde machine.
    **Ná B-1 (09-09-2026) gemeten op 461 s — 166 bestanden (165 geslaagd, 1 overgeslagen), 2004 tests
    (2001 geslaagd, 3 overgeslagen), in één keer groen, alleen gedraaid.** +1 BESTAND
    (`ingest/motionalModel.test.ts`, 20 claims) en +22 tests, en die twee getallen sluiten exact: die
    twintig, +1 in `goldenCasus2` (het B-1-blok over de gehouden lekterm) en +1 in
    `goldenClassification` (de engine-toets op het nieuwe V15-blok `_re_fit_parameters`). Het corpus is
    niet geregenereerd, dus geen enkele `it.each` over het levende corpus beweegt. GEEN nieuwe
    referentie: de V43-waarde van 289 s blijft staan, en 461 tegen I-3's 457 s is dezelfde laag op
    dezelfde machine.
    **Ná I-3 (09-09-2026) gemeten op 457 s — 165 bestanden (164 geslaagd, 1 overgeslagen), 1982 tests
    (1979 geslaagd, 3 overgeslagen), in één keer groen, gedraaid ná de twee browserruns met de
    dev-server en de headless Chrome gestopt.** +1 BESTAND (`v2Guided.test.ts`, 38 claims) en +38 tests,
    en die twee getallen zijn HETZELFDE getal: het corpus is niet geregenereerd, dus geen enkele
    `it.each` over het levende corpus beweegt en de delta is precies de inhoud van het nieuwe bestand.
    GEEN nieuwe referentie: de V43-waarde van 289 s blijft staan, en 457 tegen I-2's 444 s is dezelfde
    laag op dezelfde machine.
    **Ná I-2 (08-09-2026) gemeten op 444 s — 164 bestanden (163 geslaagd, 1 overgeslagen), 1944 tests
    (1941 geslaagd, 3 overgeslagen), gedraaid ná de browsercontrole met de dev-server en de headless
    Chrome gestopt.** +1 BESTAND (`nfMerge.test.ts`, 56 claims) en +56 tests, en die twee getallen zijn
    HETZELFDE getal: het corpus is niet geregenereerd, dus geen enkele `it.each` over het levende corpus
    beweegt en de delta is precies de inhoud van het nieuwe bestand. GEEN nieuwe referentie: de
    V43-waarde van 289 s blijft staan, en 444 tegen I-1's 449 s is dezelfde laag op dezelfde machine.
    (De eerste run had één rode claim — een bronscan die de regel `far: { name: loaded.name, … }` pinde
    terwijl de reparatie van de HERMERGE er `far: n[role].far ?? { … }` van maakte; de scan deed wat
    hij moet doen en is bijgewerkt vóór de volle run.)
    **Ná I-1 (08-09-2026) gemeten op 449 s — 163 bestanden (162 geslaagd, 1 overgeslagen), 1888 tests
    (1885 geslaagd, 3 overgeslagen), in één keer groen, alleen gedraaid ná de browsercontrole met de
    dev-server gestopt.** +1 BESTAND (`v2InputRegister.test.ts`, 18 claims) en +18 tests, en die twee
    getallen zijn HETZELFDE getal: het corpus is niet geregenereerd, dus geen enkele `it.each` over
    het levende corpus beweegt en de delta is precies de inhoud van het nieuwe bestand. GEEN nieuwe
    referentie: de V43-waarde van 289 s blijft staan, en 449 tegen C-2's 458 s is dezelfde laag op
    dezelfde machine.
    **Ná C-2 (08-09-2026) gemeten op 458 s — 162 bestanden (161 geslaagd, 1 overgeslagen), 1870 tests
    (1867 geslaagd, 3 overgeslagen), in één keer groen, gedraaid ná de twee regeneraties op een verder lege
    machine.** +2 BESTANDEN sinds E-4 (`goldenCasus2.test.ts` 14 claims,
    `optimizer/softInductanceBound.test.ts` 5; `casus2.fixture.ts` is geen test) en netto +23 tests, en die
    telling sluit alleen mét de corpusgrootte erin — voor de zoveelste keer: 14 + 5 nieuw, +1 in `corpusPairing`
    (de C-2-claim), +4 in `goldenClassification` (de casus-2-describe), en **−1 uit de `it.each` over casus 1b's
    netlists, dat van drie naar twee ging** toen die casus meegeregenereerd werd en haar corpus van twee naar
    één netlist kromp. 24 − 1 = 23. Geteld met `grep -c '^\s*it('` per bestand tegen dezelfde telling op HEAD.
    GEEN nieuwe referentie: de V43-waarde van 289 s blijft staan.
    **Ná E-4 (07-09-2026) gemeten op 411 s — 160 bestanden (159 geslaagd, 1 overgeslagen), 1847 tests
    (1844 geslaagd, 3 overgeslagen), in één keer groen, alleen gedraaid.** +1 bestand
    (`optimizer/coilSnapCeiling.test.ts`, 5 claims) en +16 claims: die vijf, +5 E-4-claims in
    `frozenNetlistGates` (de inversie-divergentie), +4 in `coilDcr.test.ts` (het snapplafond van een
    gestelde familie) en +2 in `shortlist.test.ts` (de noot bij overvloed). **De delta is ENUMEREERD
    en niet afgeleid** (`npx vitest list -t '^(?!.*\[live\])'` op HEAD tegen dezelfde lijst op E-4):
    elf namen erbij in de drie gewijzigde bestanden, nul verdwenen, plus de vijf van het nieuwe
    bestand — samen zestien, precies de claims hierboven. **Eén losse eindje, gemeten en niet
    weggepoetst:** HEAD lijst vandaag 1828 en zou dus 1831 draaien, waar de P-1-regel hieronder 1830
    noteert. Eén test verschil met een record van een vorige sessie; niets in LP-1 of E-4 raakt een
    test die dat verklaart. GEEN nieuwe referentie: de V43-waarde van 289 s blijft staan.
    **Ná P-1 (07-09-2026) gemeten op 415 s — 159 bestanden (158 geslaagd, 1 overgeslagen), 1830 tests
    (1827 geslaagd, 3 overgeslagen), in één keer groen, alleen gedraaid.** GEEN nieuw bestand; +10 claims, alle
    tien in `xoWindow.test.ts` (23 → 33). **De delta is ENUMEREERD en niet afgeleid:** `npx vitest list -t
    '^(?!.*\[live\])'` op HEAD tegen dezelfde lijst op de fix geeft 1818 → 1828, en de diff bevat precies de
    tien P-1-claims en verder niets — geen test verplaatst, verdwenen of bijgekomen. (Die lijstgetallen liggen
    twee onder de RUN-telling: `vitest list` somt de overgeslagen tests binnen een overgeslagen describe niet op.
    Het verschil is aan beide kanten hetzelfde en valt in de diff weg; wie de twee tellingen naast elkaar legt
    moet ze niet verwarren.) GEEN nieuwe referentie: de V43-waarde van 289 s blijft staan.
    **Ná E-3b (06-09-2026) gemeten op 421 s — 159 bestanden (158 geslaagd, 1 overgeslagen), 1818 tests (1815 geslaagd,
    3 overgeslagen), in één keer groen, gedraaid naast een browsersessie (zie de meetregel hieronder: dit is dus GEEN
    referentie); de telling erna is 159 bestanden en 1821 tests, want de bewaarde tweewegrun bracht drie claims meer.**
    +1 bestand (`optimizer/scanRequest.test.ts`, 21 claims) en +26 tests: die 21 plus vijf E-3b-claims in
    `selection.test.ts` (de bronscan op de tweewegtak van `App.tsx`). `toggleRegression` blijft op 10 — zijn
    vóórstart-bewaker veranderde van vorm, niet van aantal. GEEN nieuwe referentie: de V43-waarde van 289 s blijft staan.
    **Ná E-3 (06-09-2026) gemeten op 409 s — 158 bestanden (157 geslaagd, 1 overgeslagen), 1795 tests (1792 geslaagd,
    3 overgeslagen), in één keer groen, gedraaid ná de casus-1b-regeneratie en de recorder, alleen.** +2 bestanden
    (`goldenCasus1b.test.ts` 14, `casus1bV2Candidates.test.ts` 5 waarvan één `[live]`) en +26 tests: die 19, +4 E-3-claims in
    `chainChoices.test.ts`, +3 in de casus-1b-describe van `goldenClassification.test.ts`. **De derde overgeslagen test is
    de derde `[live]`-run** (casus 1b door `v2ChainOne`, ~95 s in de volle run). GEEN nieuwe referentie: de V43-waarde
    van 289 s blijft staan.
    **Ná E-2 (06-09-2026) gemeten op 564 s — 156 bestanden (155 geslaagd, 1 overgeslagen), 1769 tests (1767 geslaagd,
    2 overgeslagen), in één keer groen, gedraaid ná de browserrun van 34 minuten en de replay, met de dev-server en de
    headless Chrome gestopt.** +4 bestanden (`predesign/fieldMode.test.ts` 10, `v2Settings.test.ts` 13,
    `optimizer/runExport.test.ts` 9, `components/engineV2Panel.test.tsx` 2) en +53 tests: die 34, +13 in
    `candidates.test.ts` (drie E-2-blokken), +5 in `schematicEdit.test.ts`, +1 in `networkReadiness.test.ts`. GEEN nieuwe
    referentie: de V43-waarde van 289 s blijft staan — `f4cRegression` en `candidateRoute` melden elk 240 s en de vier
    nieuwe bestanden kosten samen onder de seconde, dus wat er beweegt is de machine. De volle run is bij E-2 NIET
    gedraaid: geen engine-, poort- of corpuswijziging, de volle veldmodus keyt byte-identiek aan het F4d-verzoek en de
    corpusgenerator leest `casus1Field` ongewijzigd, dus de twee live ketenruns toetsen niets dat hier bewoog.
    **Ná E-1 (06-09-2026) gemeten op 411 s — 152 bestanden (150 geslaagd, 1 rood, 1 overgeslagen), 1716 tests
    (1713 geslaagd, 1 rood, 2 overgeslagen), gedraaid direct ná de recorder-herhaling en NOOIT ernaast.** Geen nieuw
    bestand; +6 tests: 1 in `casus1V2Candidates` (de looptijd-/goedkoopste-onderwerp-claim), 1 in `barrierSource`
    (de vijfde bron), 4 in `candidates.test.ts` (het gestelde plafond en de kooi). De ene rode claim was de V33-bronscan
    in `frozenNetlistGates` ("de barrière leest door de gedeelde functie"): zij zocht de regel `const ohm =
    systemMinImpedanceOhm(` en E-1 splitste die regel in een verdichte en een grove lezer — de scan pint sindsdien beide
    lezers binnen de `barrierShortOhm`-closure plus de twee `minImpedanceAt`-aanroepen in de verdichte lezer; gerepareerd
    vóór de volle run. GEEN nieuwe referentie: de V43-waarde van 289 s blijft staan.
    **Ná A5e.3c (06-09-2026) gemeten op 386 s — 152 bestanden (149 geslaagd, 2 rood, 1 overgeslagen), 1710 tests
    (1705 geslaagd, 3 rood, 2 overgeslagen), gedraaid vlak ná de samenvoeging van de shards en de recorder.** +1 bestand
    (`optimizer/derivedGateRefusal.test.ts`, 9 claims) en +15 tests: die negen, +1 in `corpusPairing` (de A5e.3c-claim),
    en **+3 uit de `it.each` over het levende corpus, dat van ZEVEN naar TIEN ging** — de corpusgrootte in de testtelling,
    opnieuw; plus twee herankerde claims in `frozenNetlistGates` die niet als nieuw tellen. De drie rode claims waren de
    meetopstelling (`vloer_zoekdoel_bron` leest sinds A5e.3b `'safety-extended'` en dit was de eerste regeneratie erop),
    de V33-resolutieclaim (KAND_V2_1 leest 2,63 Ω op het barrièreraster tegen 2,55 op de poortsweep — een resolutieverschil
    op een smalle dip bij 415 Hz, sindsdien geboekt in `v33_barriere_raster.resolutie_boven_speling`, de V30-vorm) en de
    V38-fix-rangclaim, die A5e.3-veld met een COMPLEMENT had geankerd en die de zeven bevroren `A5E3VELD_KAND_*` het anker
    binnen liet stappen (rang 75 van 150 — de V47/V48-les voor de tweede keer op dezelfde claim; sindsdien een benoemde
    verzameling). Alle drie gerepareerd en de bestanden apart groen. GEEN nieuwe referentie: de V43-waarde van 289 s
    blijft staan.
    **Ná A5e.3b (05-09-2026) gemeten op 359 s — 150 geslaagd + 1 overgeslagen bestand, 1695 geslaagd +
    2 overgeslagen tests, in één keer groen, gedraaid nadat de ablatie-armen klaar waren.** Geen nieuw
    bestand; +5 tests, precies de vijf nieuwe claims (1 in `levelWork` (c)3, 1 in `chainChoices` voor de
    vierde ketensleutel, 1 in `barrierSource` voor `'safety-extended'`, 2 in `frozenNetlistGates`: de
    (b)3-vóórmeting en de wezen-consistentie). GEEN nieuwe referentie: de V43-waarde van 289 s blijft staan.
    **Ná A5e.3-veld (04-09-2026) gemeten op 357 s — 150 geslaagd + 1 overgeslagen bestand, 1690 geslaagd +
    2 overgeslagen tests, in één keer groen, alleen gedraaid op een lege machine ná de volle run en de herhaling van
    `casus1V2Candidates`, en NOOIT ernaast.** Geen nieuw bestand; +14 tests (zes A5e.3-veld-blokken in
    `frozenNetlistGates`, +1 in `corpusPairing`, +7 uit de `it.each` over het levende corpus, dat van NUL naar ZEVEN
    ging — de corpusgrootte in de testtelling, nu weer terug). GEEN nieuwe referentie: de V43-waarde van 289 s blijft
    staan, dit is dezelfde laag op dezelfde machine.
    **Ná A5e.3 (04-09-2026) gemeten op 342 s — 150 geslaagd + 1 overgeslagen bestand, 1676 geslaagd +
    2 overgeslagen tests, in één keer groen, alleen gedraaid op een lege machine ná de volle run en NOOIT ernaast.**
    +2 bestanden (`coilDcr.test.ts` 12, `optimizer/coilDcrRoute.test.ts` 2 — twee ketenruns, 47 s) en +14 tests,
    exact die twee; het corpus is niet geregenereerd, dus de `it.each` over het levende corpus staat op nul. Het
    langste bestand blijft `lowestWayLevelWork` (341 s), dan `threeWayChain` (289 s) en `frozenNetlistGates`
    (277 s). GEEN nieuwe referentie: de V43-waarde van 289 s blijft staan.
    **Ná M-1 (04-09-2026) gemeten op 348 s — 148 geslaagd + 1 overgeslagen bestand, 1662 geslaagd +
    2 overgeslagen tests, in één keer groen, alleen gedraaid op een lege machine ná de volle run en
    NOOIT ernaast.** +1 bestand (`ingest/mergeBlock.test.ts`, 11 claims) en netto +8 tests (zie de
    regel bij `npx vitest run`: 11 + 1 + 1 + 1 − 6 uit de `it.each` over het levende corpus, dat van
    ZES naar NUL ging). Het langste bestand is sinds V51 `lowestWayLevelWork` (348 s, vier ketenruns op
    de kleine fixture) en niet meer `threeWayChain` (298 s); de laag IS dus dat ene bestand. GEEN nieuwe
    referentie: de V43-waarde van 289 s blijft staan, dit is dezelfde laag op dezelfde machine.
    **De CI-laag (`npm run test:ci`) in dezelfde sessie, direct erna: 348 s — 148 geslaagd +
    1 overgeslagen bestand, 1653 geslaagd + 11 overgeslagen tests.** Die elf zijn 2 `[live]` +
    10 `[bytes]` − 1 die beide tags draagt, precies wat `ciLayer.test.ts` sinds V50 bewaakt; M-1
    hernoemde twee `[bytes]`-namen (het M-1-oordelenblok van `f4cRegression`) en voegde er geen toe.
    **Ná V51b (03-09-2026) gemeten op 398 s — 147 geslaagd + 1 overgeslagen bestand, 1654 geslaagd +
    2 overgeslagen tests, in één keer groen, alleen gedraaid, direct ná de regeneratie van 41 min.**
    Geen nieuw bestand; +13 tests: 1 in `levelWork.test.ts`, 5 in `optimizer/lowestWayLevelWork.test.ts`
    (162–165 s, vier ketenruns op de kleine fixture), 1 in `frozenNetlistGates` (de HUIDIG-sanity),
    1 in `corpusPairing` (V50 → V51, nul paren), en **+5 uit de `it.each` van `casus1V2Candidates`,
    die over het levende corpus loopt en van ÉÉN naar ZES netlists ging** — de corpusgrootte in de
    testtelling, voor de zoveelste keer. GEEN nieuwe referentie: 398 s tegen de 289 s van V43 is
    dezelfde laag op dezelfde machine, en `lowestWayLevelWork` (165 s) en `frozenNetlistGates` zijn
    de bestanden die gegroeid zijn; wie de laag wil hermeten doet dat op een leeg systeem en niet vlak
    na een regeneratie.
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
    **Gemeten 09-09-2026 (B-1), lokaal op arm64/Node 26: 166 bestanden (165 geslaagd,
    1 overgeslagen), 1992 geslaagd, 12 overgeslagen, 459 s** — die twaalf zijn 3 `[live]` +
    11 `[bytes]` − 2 die beide dragen, precies wat `ciLayer.test.ts` sinds E-3 bewaakt.
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
  `casus1V2Candidates.test.ts` bewaakt met een bronscan dat er precies DRIE getagde blokken
  bestaan, met naam — één sinds de splitsing van 01-09-2026 twee werd, drie sinds E-3 (06-09-2026:
  casus 1b's live run door de tweewegroute, `casus1bV2Candidates.test.ts`) — en `ciLayer.test.ts`
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
  vast dat het er precies TWEE zijn, met naam (DRIE sinds E-3, zie de tagregel hierboven). **Vóór/ná op één leeg systeem, 01-09-2026:
  1761,09 s (29 min 23) → 1254,43 s (20 min 55), dus 506 s eraf (−29 %).**
  **De winst is kleiner dan het verschil tussen de twee runs, en dat is de eerlijke helft van de
  meting:** naast elkaar draaien kost élke run tijd. De byte-run ging van 1119,6 naar 1244,3 s
  (+11 %), de verwerpingsrun van 637,7 naar 924,2 s (+45 %), en `threeWayChain` — dat er
  onveranderd naast staat — van 285,8 naar 517,4 s. De totale CPU-tijd steeg van 3615 naar
  4306 s. Wandkloktijd is dus gekocht met rekentijd; een voorspelling op `max(1120, 638)` ≈ 950 s
  was te optimistisch en de gemeten 1254 s is wat er staat.
- **DE TWEE LIVE KETENRUNS KIEZEN SINDS E-1 (06-09-2026) HET GOEDKOOPSTE ONDERWERP.** De byte-reproductie
  (`casus1V2Candidates.test.ts`, `[bytes]`) reproduceert de geleverde netlist met de LAAGSTE geregistreerde looptijd, de
  verwerpingsrun (`casus1V2Refusal.test.ts`) de goedkoopste verwerping — één regel, `liveSubjects()` in
  `casus1Corpora.fixture.ts`, deterministisch (looptijd, dan label) en in de testnaam. De looptijd per kandidaat schrijft
  de generator sinds E-1 in `casus1_v2_herkomst.json` (`kandidaat_uitkomst[].looptijd_s`, uit de shard; voor het
  A5e.3c-corpus eenmalig uit de shards ingevuld); een herkomst zonder looptijd laat `liveSubjects` gooien in plaats van
  raden. Tot E-1 nam elke run de EERSTE van zijn lijst, en op het A5e.3c-corpus was dat KAND-V2-1 — de duurste
  kandidaat van het veld (8671 s in de generator, 7182 s live), dus de volle suite kostte twee uur voor een claim die
  élke geleverde netlist evengoed draagt. Sinds E-1: KAND-V2-8 (313,2 · 1647, 1787 s in de generator) en de verwerping
  455,7 · 2304 (topologie, 1410 s). De inventaris in `ciLayer.test.ts` draagt de nieuwe `[bytes]`-naam.
- `npx vitest run` — volledige testsuite. **GEMETEN 09-09-2026 (U-1): 167 bestanden, 2020 tests,
  1525 s (25 min 25), niets overgeslagen, in één keer groen, alleen gedraaid met `nohup` ná de snelle
  laag en ná de browsercontrole (dev-server en headless Chrome gestopt).** +1 bestand
  (`v1Carryover.test.ts`, 16 claims) en +16 tests — hetzelfde getal, want het corpus is niet
  geregenereerd. **Wat deze run bewijst is precies dat U-1 niets van de zoektocht raakt:** de DRIE
  live ketenruns reproduceren op hun onveranderde corpora (casus 1 in 1518 s, de verwerping 889 s,
  casus 1b 302 s), beide byte-baselines (`f4cRegression` 96 s, `workerRouteRegression` 99 s)
  reproduceren, en `toggleRegression` staat — die laatste rendert `App.tsx` niet, dus de invariant
  is per constructie ongemoeid gebleven en dat is nagemeten in plaats van beredeneerd.
  (De stand ervoor: **GEMETEN 08-09-2026 (I-2): 164 bestanden, 1944 tests, 1557 s
  (25 min 57), niets overgeslagen, in één keer groen, alleen gedraaid met `nohup` ná de browsercontrole
  (dev-server en headless Chrome gestopt) en ná de snelle laag.** +1 bestand (`nfMerge.test.ts`, 56 claims)
  en +56 tests — hetzelfde getal, want het corpus is niet geregenereerd. **Wat deze run bewijst is precies
  dat I-2 niets van de zoektocht raakt:** de drie live ketenruns reproduceren op hun onveranderde corpora
  (casus 1 in 1550 s, casus 1b 305 s, de verwerping 892 s), beide byte-baselines (`f4cRegression`,
  `workerRouteRegression`) reproduceren, en casus 2's acceptatie ook. De ENE ingreep die iets buiten de
  nieuwe module raakt is de v1-merge-blok-lezer, die er een VELD bij kreeg (`spliceGainDb`) zonder dat een
  bestaand veld beweegt — `xoWindow.test.ts` en `sourceMeta.test.ts` staan.)
  (De stand ervoor: **GEMETEN 08-09-2026 (C-2): 162 bestanden, 1870 tests, 1557 s
  (25 min 57), niets overgeslagen, in één keer groen, alleen gedraaid met `nohup` ná de snelle laag en NOOIT
  ernaast.** +2 bestanden en +23 tests (zie de `test:fast`-regel; de telling sluit alleen mét de corpusgrootte
  erin). **Wat deze run bewijst is precies wat C-2 verandert:** de drie live ketenruns draaien op DRIE opnieuw
  opgewekte corpora — casus 1 (16 kandidaten, budget 16, tweezijdige kooien, zacht A5d.6-plafond, verdichte
  barrière), casus 1b (meegeregenereerd, van twee naar één netlist) en casus 2 (nieuw) — en alle drie
  reproduceren. De wandkloktijd IS de byte-reproductie van casus 1 (`casus1V2Candidates` 1550 s op KAND-V2-10 =
  437,3 · 1744,8, de goedkoopste geleverde op looptijd); de verwerping ernaast kostte 905 s, casus 1b's live run
  308 s, `frozenNetlistGates` 421 s, `lowestWayLevelWork` 393 s en `threeWayChain` 338 s — alles in de schaduw.
  **De byte-baselines (`f4cRegression`, `workerRouteRegression`) reproduceren:** de zachte grens en de verdichte
  bron zijn afwezig op élke v1-route, en dat is wat P2 hier betekent.)
  (De stand ervoor: **GEMETEN 07-09-2026 (E-4): 160 bestanden, 1847 tests, 1593 s
  (26 min 33), niets overgeslagen, in één keer groen, alleen gedraaid met `nohup` ná de snelle laag en
  NOOIT ernaast.** +1 bestand (`optimizer/coilSnapCeiling.test.ts`, 5 claims) en +16 claims (zie de
  `test:fast`-regel; de delta is met `vitest list` geënumereerd). **Wat deze run bewijst is precies het
  punt van E-4: de nieuwe keuze-sleutel kan geen netwerk verplaatsen.** Casus 1 en casus 1b draaien met
  `catalogSnap: false` — geen enkele van de 129 spoelen in het levende casus-1-corpus en geen enkele van
  casus 1b draagt een catalogus-onderdeel — dus het familieplafond raakt een snap die nooit gebeurt, en
  de byte-baselines (`f4cRegression`, `workerRouteRegression`) plus alle DRIE de live ketenruns
  reproduceren. De wandkloktijd is onveranderd de byte-reproductie van KAND-V2-8 (1581 s); casus 1b's
  run kostte 138 s en verdwijnt in de schaduw.)
  (De stand ervoor: **GEMETEN 06-09-2026 (E-3b): 159 bestanden, 1821 tests, 1608 s (26 min 48),
  niets overgeslagen, in één keer groen, alleen gedraaid met `nohup` ná de browsercontrole en NOOIT ernaast.** +1 bestand
  (`optimizer/scanRequest.test.ts`, 21 claims) en +26 tests: die 21 plus vijf E-3b-claims in `selection.test.ts`. De
  wandkloktijd is onveranderd de twee live casus-1-ketenruns; E-3b raakt geen engine-, poort- of corpuscode, dus wat de
  volle run hier bewijst is precies dat: **de byte-baselines (`f4cRegression`, `workerRouteRegression`) en alle DRIE de
  live ketenruns reproduceren onder de E-3b-app** — de extractie van vierhonderd regels uit `runVfOptimize` heeft geen
  enkel netwerk verplaatst. (De casus-1b-run kostte 142 s en verdwijnt in de schaduw; `threeWayChain` 327 s.))
  (De stand ervoor: **GEMETEN 06-09-2026 (E-3): 158 bestanden, 1795 tests, 1573 s (26 min 13),
  niets overgeslagen, in één keer groen, alleen gedraaid met `nohup` ná de snelle laag en NOOIT ernaast.** +6 bestanden en
  +79 tests sinds E-1 (E-2's vier bestanden en 53 tests, E-3's twee bestanden en 26 tests — zie de `test:fast`-regels).
  **De wandkloktijd is nog steeds de byte-reproductie van KAND-V2-8 (1565 s), de verwerping 455,7 · 2304 ernaast
  1240 s; de DERDE live ketenrun — casus 1b door `v2ChainOne` (`casus1bV2Candidates.test.ts`) — kost 137 s en verdwijnt
  in de schaduw** (`frozenNetlistGates` 373 s, `lowestWayLevelWork` 373 s). Het casus-1-corpus reproduceert byte-voor-byte
  onder de E-3-worker (de polariteitsvouw en de vijfde ketensleutel zijn op het LR4-veld de identiteit — gemeten, niet
  aangenomen).)
  (De stand ervoor: **GEMETEN 06-09-2026 (E-1): 152 bestanden, 1716 tests, 1609 s (26 min 49),
  niets overgeslagen, in één keer groen, alleen gedraaid met `nohup` ná de reparatie van de V33-bronscan en NOOIT
  ernaast.** Geen nieuw bestand; +6 tests (zie de `test:fast`-regel). **Van 7194 s naar 1609 s zonder één test minder, en
  dat is POST 1 van E-1 en niet de suite:** de byte-reproductie kiest sinds E-1 de GOEDKOOPSTE geleverde netlist
  (KAND-V2-8 = 313,2 · 1647: 1596 s live, 1787 s in de generator onder acht processen) en de verwerpingsrun de goedkoopste
  verwerping (455,7 · 2304, topologie: 1256 s live, 1410 s in de generator), waar A5e.3c KAND-V2-1 nabouwde — de duurste
  kandidaat van het veld (7182 s live). De wandkloktijd IS weer de byte-reproductie (1601 s voor het bestand); de rest
  draait in de schaduw (`lowestWayLevelWork` 377 s, `frozenNetlistGates` 375 s, `threeWayChain` 320 s,
  `derivedGateRefusal` 102 s). Het cijfer beweegt met WELKE kandidaat de live reproductie treft — de V42/V43/V44-les,
  nu als regel: de goedkoopste, deterministisch, uit de herkomst.)
  (De stand ervoor: **GEMETEN 06-09-2026 (A5e.3c): 152 bestanden, 1710 tests, 7194 s
  (1 u 59 min 54), niets overgeslagen, in één keer groen, alleen gedraaid met `nohup` ná de recorder en de drie
  guard-reparaties en NOOIT ernaast.** +1 bestand (`optimizer/derivedGateRefusal.test.ts`, 9 claims) en +13 tests sinds
  A5e.3b: die negen, +1 in `corpusPairing`, en **+3 uit de `it.each` over het levende corpus, dat van ZEVEN naar TIEN
  ging** — de corpusgrootte in de testtelling, opnieuw. **De wandkloktijd IS weer de byte-reproductie: KAND-V2-1
  (377,8 · 1948) kostte 7182 s live door de route** (in de generator 8671 s onder belasting van acht processen, 647 971
  evaluaties — de duurste kandidaat van het veld, en de shortlist zet hem vooraan), de verwerpingsrun van 147,9 · 1647
  ernaast 2136 s; de rest draait in de schaduw (`lowestWayLevelWork` 379 s, `frozenNetlistGates` 358 s, `threeWayChain`
  317 s). Dat de suite van 359 s (A5e.3b) naar 7194 s ging is niet de suite maar de PIN: bij A5e.3b waren beide live
  ketenruns gedateerd geparkeerd, sinds A5e.3c draaien zij weer — en welke kandidaat de byte-reproductie treft zet de
  wandklok (de V42/V43/V44-les, nu op het duurste ontwerp van het veld). **De volle run bewijst weer wat hij hoort te
  bewijzen: dat de route de bevroren netlist byte-voor-byte levert, onder de worker die sinds A5e.3c op de eigen
  kruispunten weigert.**)
  (De stand ervoor: **GEMETEN 05-09-2026 (A5e.3b): 151 bestanden, 1697 tests, 359 s
  (5 min 59), niets overgeslagen, in één keer groen — en die tijd is TIJDELIJK die van de snelle laag, want de
  twee live ketenruns zijn gedateerd geparkeerd** (hun kandidaat bestaat niet meer in het A5e.3b-veld en de
  route zou drie van de zeven nu zelf weigeren; zie de A5e.3b-guards). +5 tests, dezelfde vijf als in de snelle
  laag; het langste bestand is `lowestWayLevelWork` (349 s). **De volle run bewijst tot de regeneratie navenant
  minder — de regeneratie is de EERSTE stap van de volgende sessie, mét Sanders keuze uit de ablatietabel.**
  (De stand ervoor: **GEMETEN 04-09-2026 (A5e.3-veld, ná de regeneratie en de NAD-arm, alleen
  gedraaid met `nohup`): 151 bestanden, 1692 tests, 1360 s (22 min 40), niets overgeslagen — 150 bestanden groen en
  ÉÉN rode claim, de `[bytes]`-reproductie in `casus1V2Candidates`, en die was GEEN byte-verschil:** de V34-assert
  "de probe landt ONDER het ketenraster" was het bewijs op het 200 Hz-raster en is sinds M-1 (raster vanaf 20,5 Hz,
  f_p een binnenpunt) onwaar geworden zonder dat iemand het zag, want de claim draaide tussen M-1 en A5e.3-veld nooit
  (leeg corpus, 24 ms). Zij zegt nu wat zij sinds M-1 is (de probe landt binnen één veiligheidsrasterstap van f_p) en
  het bestand is apart opnieuw gedraaid: **`casus1V2Candidates.test.ts` alleen, 18 tests, 596 s, groen** — de
  byte-reproductie van KAND-V2-1 reproduceert. +14 tests: zes A5e.3-veld-blokken in
  `frozenNetlistGates`, +1 in `corpusPairing`, +7 uit de `it.each` over het levende corpus (van NUL naar ZEVEN — de
  corpusgrootte in de testtelling, weer terug), en de byte-reproductie treft KAND-V2-1 (549,7 · 1495, 674 s live;
  de verwerping 147,9 · 1294 ernaast). Het corpus is GEREGENEREERD (7795 s, `V2_JOBS=8`, twintig kandidaten; één
  kandidaat opnieuw onder de gerepareerde worker en samengevoegd met `V2_MERGE=1`): zeven van twintig geleverd.)
  (De stand ervoor: **04-09-2026 (A5e.3, ná M-1-diagnose): 151 bestanden,
  1678 tests, 1152 s (19 min 12), niets overgeslagen, in één keer groen, alleen gedraaid op een lege machine met
  `nohup` ná de arm `m1+dcr` en NOOIT ernaast.** +2 bestanden (`coilDcr.test.ts` 12 claims,
  `optimizer/coilDcrRoute.test.ts` 2 claims, twee ketenruns op de kleine fixture) en +14 tests, exact die twee
  bestanden; het corpus is NIET geregenereerd en blijft leeg, dus de `it.each` over het levende corpus beweegt
  niet. De wandkloktijd is nog steeds die van de VERWERPINGSRUN alleen (1118 s op kandidaat 1); `lowestWayLevelWork`
  347 s en `threeWayChain` 298 s ernaast. GEEN nieuwe referentie: dezelfde laag op dezelfde machine.
  (De stand ervoor: **04-09-2026 (M-1): 149 bestanden, 1664 tests,
  1187 s (19 min 47), niets overgeslagen, in één keer groen, alleen gedraaid op een lege machine met
  `nohup`.** +1 bestand (`ingest/mergeBlock.test.ts`, 11 claims) en netto +8 tests: 11 daar, 1 in
  `gates.test.ts` (de reflexvormige tegenproef op de beschermingsregel), 1 in `corpusPairing` (V51b → M-1,
  nul paren), 1 in `casus1V2Candidates` (de lege-corpus-bewaker), en **MIN 6 uit de `it.each` over het
  levende corpus, dat van ZES naar NUL ging** — de corpusgrootte in de testtelling, nu naar nul. **De
  wandkloktijd is die van de VERWERPINGSRUN alleen (1154 s op kandidaat 1, `177,6 LR2 · 1294 LR4`):**
  de byte-reproductie in `casus1V2Candidates` heeft sinds M-1 geen netlist om te reproduceren en keert
  meteen terug (24 ms voor het hele bestand), dus van de twee live ketenruns draait er nog één. Het corpus
  is bij M-1 GEREGENEREERD op de gemergede meetset (22 713 s, `V2_JOBS=8`, derde run — zie de
  generatorregel); nul van 115 geleverd.
  (De stand ervoor: **03-09-2026 (V51b): 148 bestanden, 1656 tests,
  1182 s (19 min 42), niets overgeslagen, in één keer groen, alleen gedraaid op een lege machine met
  `nohup`.** Geen nieuw bestand sinds V51; +13 tests (zie de `test:fast`-regel: 8 nieuwe claims en +5 uit
  de `it.each` over het levende corpus, dat van ÉÉN naar ZES ging). Het corpus is bij V51b GEREGENEREERD
  (2487 s, `V2_JOBS=8`, tweede run — zie de generatorregel) met serieweerstand tot 1,0 Ω op de laagste
  weg toegestaan; zes van vijftien geleverd. De wandkloktijd ligt ONDER V51 hoewel het corpus zesmaal zo
  groot is, om de reden die V42–V51 al noteerden: de byte-reproductie treft een ANDERE kandidaat —
  `466,5 · 2283,5` kostte 1177 s in de volle run (in de generator 1261 s), de verwerpingsrun ernaast
  1067 s.)
  (De stand ervoor: **03-09-2026 (V51): 148 bestanden, 1643 tests,
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
  **SINDS E-1 SCHRIJFT DE GENERATOR DE LOOPTIJD PER KANDIDAAT IN DE HERKOMST** (`kandidaat_uitkomst[].looptijd_s`, uit de
  shard, `withRuntime`): de twee live ketenruns kiezen er hun onderwerp op (`liveSubjects`). Tot E-1 stond hij alleen in
  de shard (gitignored) en in de A5e.3c-tabel; voor het A5e.3c-corpus is hij eenmalig uit de shards ingevuld (24 regels,
  verder byte-identiek).
  **BIJ A5e.3c GEMETEN OP 17 884 s (4 u 58) MET `V2_JOBS=8` VOOR 24 KANDIDATEN (1410–14 690 s per kandidaat; de drie
  duurste 10 961, 11 634 en 14 690 s zijn geleverde kandidaten met een lage W-M-kruising en 700 000–900 000 evaluaties),
  op het A5e.3b-veld (8 × 3), de barrière op `'safety-extended'`, de spanwijdte-cap 22,0 mH. Veertien geleverd, tien
  geweigerd — en DRIE van de veertien zijn daarna opnieuw gedraaid (`V2_ONLY=8`, `14`, `20`; 2637 / 9797 / 10 192 s, drie
  tegelijk) onder de worker die sinds A5e.3c een geleverd netwerk weigert dat op de eigen kruispunten een poort mist,
  en met `V2_MERGE=1` samengevoegd: dezelfde tune (evaluatietelling en spoelen exact gelijk), daarna de weigering. De
  reparatie raakt aantoonbaar alleen die drie (de elf andere geleverde halen M-C ook op de eigen kruispunten, de tien
  geweigerde waren al geweigerd vóór zij leest). De shortlist bevroor TIEN van de ELF — de eerste keer dat de
  shortlist-grootte (`DEFAULT_SHORTLIST_SIZE`) kleiner is dan het geleverde veld; het gedropte netwerk (549,7 · 2304)
  bestaat alleen in de shards.**
  **BIJ M-1 GEMETEN OP 22 713 s (6 u 19) MET `V2_JOBS=8` VOOR 115 KANDIDATEN (mediaan 1455 s per
  kandidaat, 48,8 CPU-uur), en dat was de DERDE run.** Het veld is sinds M-1 115 in plaats van vijftien:
  de W-M-as onthoudt zich van een orde (LR2 én LR4, 10 + 13 posities) en de M-T-as houdt orde 4 (5
  posities). De eerste run is na acht kandidaten afgebroken en de tweede (115, 6 u 13) is in zijn geheel
  weggegooid, allebei om dezelfde reden: de woofer werd op de gemergede set als HOOGDOORLAATBESCHERMD
  geclassificeerd en M-C weigerde hem (8 van 8, daarna 52 van 115) — de beschermingsregel probete een halve
  octaaf onder de bandvloer in de reflexpieken van de gemeten impedantie. Dat is de ENE poortwijziging van
  M-1 (zie de M-1-guards), en de shards van beide weggegooide runs staan als bewijsmateriaal in de scratch
  van die sessie. **Een run van zes uur is een run waarvan je de eerste golf leest** (de V51b-les hieronder,
  nu op 115): acht shards zijn na ~25 min klaar, en wat daar aan classificatie of weigeringsreden niet klopt
  kost dan een half uur in plaats van een werkdag.
  **BIJ V51b GEMETEN OP 2487 s (41 min) MET `V2_JOBS=8`, en dat was de TWEEDE run: de eerste is na
  acht kandidaten (~25 min) afgebroken omdat de shards twee gebreken lieten zien — de vijf
  396,7-kandidaten kregen géén serie-R (de synthese stelde hem alleen voor bij een trim onder
  −0,5 dB) en Y was op elke vloerweigering `null` zonder reden. LEES DE SHARDS
  (`test-fixtures/.casus1-v2-shards/cand-*.json`) ZODRA DE EERSTE GOLF KLAAR IS: elk kind schrijft zijn
  uitkomst mét de niveauwerk-kolom en de weigeringsreden, en een gebrek dat daar zichtbaar is kost
  25 minuten in plaats van 65. En WIJZIG GEEN ENGINEBRON TERWIJL HIJ LOOPT: elk kind is een nieuw
  proces dat de bron opnieuw laadt, dus een reparatie halverwege levert een corpus uit twee versies.**
  De kinderen printen sinds V51b op hun samenvattingsregel ook de serieweerstand op de laagste weg en Y.
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
- **DE GEMERGEDE MEETSET (M-1, 04-09-2026) — wat de v2-route sinds M-1 leest, en hoe zij is gemaakt.**
  De fixture kent TWEE meetsets: `casus1Manifest(golden)` = `casus1Manifest(golden, 'merged')` is de
  STANDAARD (de on-axis ver velden van woofers en mid zijn NF/FF-merges met een geldigheidsblok:
  woofer geldig vanaf 20,5 Hz, mid vanaf 60 Hz; `manifest_en_geometrie.gemergde_set`), en
  `casus1Manifest(golden, 'gated')` is de sessie van 22-08-2026 zoals gemeten (gate-vloer 396,7 Hz op
  alles). **Een test die de HEADER-VLOER zelf toetst (1/T, 2/T, de adviserende FF/NF-detector, het
  handmatige venster, de V38-fix-demonstratie, de gedateerde corpusPairing-claims) leest `'gated'` en
  zegt dat bij de aanroep; al het andere leest de standaard.** `corpusBank(golden, set)` idem.
  - `npx vite-node scripts/annotate-casus1-merge.ts <bron.frd> <doel.frd> <woofer_up|woofer_down>` —
    seconden. Zet het gestructureerde merge-/geldigheidsblok (`Merge = NF/FF`, `Valid from = … Hz`,
    `Merge … = …`) op Sanders gemergede wooferbestand; kopieert de datarijen LETTERLIJK en telt ze na.
    De proza-kop van Sander blijft erboven staan. Geen proza-parser: `parseArtaHeader` leest veldnamen
    (UI-1-les). `Valid to` is het einde van de sweep en NIET Sanders "geldigheidsplafond 550 Hz" — dat
    is het kruisplafond (breakup / 3) dat de engine zelf afleidt en dat verdwijnt als het bestand op
    550 Hz ophoudt geldig te zijn; het staat als `Merge usable ceiling` in het blok (documentatie).
  - `npx vite-node scripts/merge-casus1-mid.ts` — seconden. Merget de mid met dezelfde stappen als
    Sanders woofer-merge (NF op het FF-raster, shelf 6 dB @ 440 Hz als MINIMUM-FASE op het NF-deel,
    geen poort, splice gefit in 500–800 Hz door `mergeNearFar` van de app), schrijft
    `test-fixtures/casus1/Koan_M_merged.frd` mét blok (geldig vanaf 60 Hz, uit de pod) en drukt de
    DRIE CONTROLES af: splice-band-residu, stap-vorm tegen die van de woofers in 150–400 Hz, sweep
    ongewijzigd. **Gemeten 04-09-2026:** splice mediaan 0,40 dB / p95 1,37 (dezelfde orde als Sanders
    "rest −1,57..+1,77"), stap-vorm gemiddeld +0,4 dB ondieper dan de shelf met 0,6 dB spreiding (de
    fijne NF-rimpel die zijn merge ongegladd overneemt), `mid.lim` onaangeraakt. NIET binnen ±0,5 dB
    per punt, en niet gecorrigeerd: 6 dB @ 440 Hz is Sanders gestelde model.
  - `npx vite-node scripts/record-casus1-merge-set.ts` — seconden. Schrijft
    `manifest_en_geometrie.gemergde_set` (welk bestand welk gepoort bestand vervangt) en het
    V15-parameterblok `merge_parameters` UIT DE BESTANDSKOPPEN (via `parseArtaHeader`), nooit overgetypt.
  - `npx vite-node scripts/record-casus1-m1-references.ts` — seconden, geen tune. Schrijft de
    klasse-A-referenties van de gemergede set (merge-vloeren, breakup-scans, `kruisvensters` per orde,
    `verankerde_gaps_dB` met vlak plateau) en de responsafhankelijke klasse-B-velden van de drie
    referentiefilters (W-M-fase, lobing-fracties, F3-venster/RMS), elk met de GEPOORTE lezing als brug
    (`_gepoort_tot_M1`, reproduceerbaar met set `'gated'`). De corpora schrijft de gewone recorder.
- **De vóór/ná-tabel tussen twee corpora**: `npx vite-node scripts/compare-corpora.ts [vóór] [ná]` —
  seconden, geen ketenrun. Corpora: `v30`, `v32`, `v33sweep`, `v33`, `v34`, `v37`, `v38fix`,
  `v41`, `v42`, `v43`, `v44`, `v45`, `v47`, `v48`, `v49`, `v50`, `v51`, `v51b`, `a5e3arm`, `a5e3veld`, `live`; default `v51b live`, wat
  de M-1-tabel is (`a5e3veld live` is de A5e.3c-tabel — nul paren op label, de leesregel in haar uiterste vorm; `v51 v51b` is de V51b-tabel; `v50 v51` de V51-tabel; `v49 v50` was de V50-tabel — de
  identiteit; `v48 v49` is de V47b-tabel, `v47 v48` de V48-tabel). **SINDS M-1 meet de bank op de
  GEMERGEDE set** — beide helften door hetzelfde pad, óók een gedateerd corpus dat op de gepoorte set is
  opgewekt; de gedateerde claims van `corpusPairing.test.ts` lezen daarom expliciet `'gated'`. **Sinds V51b twee kolommen erbij:** `serie-R laagste weg Ω
  (R + DCR = totaal)` — de serieweerstand die de driver van de laagste weg in zijn pad ziet, GESPLITST
  in discrete R en spoel-DCR (`describeSeriesResistance`), want de gestelde variant `series-r-max`
  oordeelt op de SOM en de splitsing is de bouwkeuze — en `heetste R W bij oordeelvermogen` (de watt
  van M-A/part bij het thermisch ontwerpvermogen, naast de kolom bij het continue vermogen); met een
  corpusregel eronder (gemiddelde, gepaard, hoeveel netlists binnen de eis) en per verwerping de regel
  `serie-R laagste weg (V51b)`: wat de geweigerde tune droeg (R + DCR = totaal) tegen het maximum, en
  Y — wat de VLOER op die weg vraagt (`vloer_vraagt_serie_R_ohm`, bisectie met een weerstand direct
  voor de driver, geoordeeld door dezelfde M-B/|Z|-poort), boven of binnen het maximum.
  **Sinds V51 twee kolommen erbij:** `serie-L per weg` (de totale seriespoel PER WEG
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
- **Waar het |Z|-minimum zit en welk element het houdt (M-1-diagnose, 04-09-2026)** — twee scripts, en de
  volgorde is de reden dat het er twee zijn:
  - `M1_JOBS=<n> npx vite-node scripts/measure-m1-diagnose-arms.ts` — **ELF KETENRUNS** (15–45 min per stuk,
    `M1_JOBS` tegelijk; gemeten: acht armen in 2553 s met acht tegelijk, de drie paren in 3238 s met drie
    tegelijk), `M1_ARM=<naam>` draait er één, `M1_DRY=1` drukt alleen de payload per arm af (seconden — DOE DAT
    EERST, het is de controle dat elke arm precies één factor verzet), `M1_REDO=1` overschrijft bestaande
    armbestanden. Schrijft per arm één JSON in `test-fixtures/casus1_m1_diagnose/`: zaad, geleverd of
    GEWEIGERD netwerk, weigering, de poortweigeringen van de tuner, vóór/ná. **Het geweigerde netwerk is hier
    voor het eerst leesbaar:** `runCandidate` wist `rejectedParts` vóór het resultaat de worker verlaat (V31),
    en dit script legt een OBSERVATOR op de keten-export `runThreeWayChain` (de vite-node-module-namespace is
    configureerbaar; het script controleert dat de observator vuurde) — dezelfde route, hetzelfde resultaat,
    een kopie ervóór. Geen engine-wijziging. De drie `m1-*`-armen reproduceren de generator byte-voor-byte op
    de weigering (1,23 / 2,31 Ω en de topologie-weigering van cand-110). De V51b-parameters (band 397–19500,
    raster 200–20k/96, plateau 2,5, serie-R-max 1,0, gepoorte set) staan bovenaan als benoemde constanten met
    hun bron (de herkomst op ca4b4fe).
  - `npx vite-node scripts/measure-m1-diagnose.ts [SLEUTEL ...]` — seconden, geen tune. Per netlist (casusboek-
    sleutels én elk armbestand): de topologie per tak (`decompose` uit `v38-groups.ts`), |Z| per tak ALLEEN aan
    de generator en van de som over 20 Hz–20 kHz, in welke tak het som-minimum zit, en per groep de ablatie
    (serie → draad, shunt → open) met het nieuwe minimum — de HOUDER (ablatie tilt op) en de BESCHERMER (ablatie
    laat zakken; poolelementen tellen niet mee, want een kortgesloten seriespoel zegt niets over de vloer). Op
    een netwerk dat de vloer mist ook de PROBE: per falende tak een pad aan de kop (`withSeriesResistanceInFront`,
    de V51b-Y-probe op een andere weg), een R in serie met elke shunt-pool en de R van elke val, gebisecteerd
    tot de tak alleen de vloer haalt (`meetsAmpFloor`, tolerantie erin), met de kost in de takoverdracht; en de
    gecombineerde lezing, opgeschaald tot het SYSTEEM de vloer haalt. Schrijft `samenvatting.json` naast de
    armen. De vloer wordt uit het manifest gelezen (`casus1AmpMinLoadOhm`), nooit getypt.
- **Wat een DCR-model doet op de netlists die er liggen (A5e.3, 04-09-2026)**:
  `npx vite-node scripts/measure-a5e3-dcr.ts [SLEUTEL ...]` — seconden, geen ketenrun en geen tune. Zonder
  argumenten HUIDIG, de drie V51b-netlists met een M-1-tegenhanger en élk arm-netwerk uit
  `test-fixtures/casus1_m1_diagnose/`. Drie tabellen: de FITS per spoelfamilie van de catalogus die
  `driverkaart.spoelfamilie.catalogus` noemt (k, A, bereik, n, residu); per netlist vóór/ná stempelen min |Z| van
  som en takken, DCR-totaal, serie-R op de woofer (R + DCR = totaal) met de ruimte in V51b's 1,0 Ω, Q_es× (M-E), lift
  en opslingering (M-D) uit `buildReport`; en per spoel weg, L, model-DCR en of één enkel onderdeel van de familie
  de waarde dekt. **Leest de families als VOORSTEL** (`gesteld_door: null`) en stelt niets. Gemeten 04-09-2026: de
  geweigerde M-1-tune van 429,1·1994,6 gaat van 1,63 naar 2,82 Ω (tweeter alleen 1,99 → 2,81), drie van vier
  geweigerde `'none'`-tunes halen de vloer, de zaden nergens (1,3–1,6 Ω); V51b-netlists +0,1–0,5 Ω, Q_es× +0,15–0,23,
  lift +0,9–1,0 dB, opslingering omlaag; 0,33–0,42 Ω van de 1,0 Ω blijft over voor een component, de M-1-zaden
  dragen 1,35–1,57 Ω koper op de wooferweg. **De arm ernaast:** `M1_ARM=m1+dcr npx vite-node
  scripts/measure-m1-diagnose-arms.ts` — één ketenrun (429,1·1994,6 met M-1's instellingen plus het model),
  bestand `casus1_m1_diagnose/m1+dcr.json`, leesbaar door `measure-m1-diagnose.ts` en `measure-a5e3-dcr.ts`.
  **Gemeten 04-09-2026: GELEVERD in 2012 s — zaad 1,32 → 2,62 Ω (vloer gehaald, minimum bij 1159 Hz in de
  W-M-overlap in plaats van 337 Hz in de tweeter-HP), rimpel 2,36 dB, M-K 14,3°/12,6°, M-C −34,6/−37,8 dB,
  M-A/part 1,34 W, woofer 0,94 Ω puur koper zonder R of pad; waar M-1 dezelfde kandidaat verliesvrij op 1,23 Ω
  weigerde. Geen nieuw element: de gedempte shunt-pool van de M-1-diagnose is op deze kandidaat overbodig.**
- **Het A5e.3-veld: de tabel per kandidaat, de vergelijking met V51b en HUIDIG, en de NAD-vloer-arm
  (A5e.3-veld, 04-09-2026)** — drie scripts:
  - `npx vite-node scripts/register-a5e3-arm.ts` — seconden. Registreert het GELEVERDE netwerk van de arm
    `m1+dcr` als gedateerd blok (`A5E3ARM-KAND-1.adsfilter.json`, `manifest_en_geometrie.a5e3_arm_corpus`),
    omdat het M-1-corpus leeg was en `freeze-live-corpus.ts` dus niets te bevriezen had. Kopieert, verplaatst
    niet, overschrijft nooit; de klasse-B-referenties schrijft de recorder (die schrijft sinds A5e.3-veld ook
    het blok van een gedateerde netlist die nooit geleefd heeft, met de reden uit `DATED_REASON`).
  - `npx vite-node scripts/measure-a5e3-field.ts [SLEUTEL ...]` — seconden, geen tune. Zonder argumenten de zeven
    A5e.3-veld-netlists (**sinds A5e.3c uit het GEDATEERDE corpus `a5e3veld`** en niet meer uit het levende — de
    `compare-corpora`-les van V33: een script met zijn ná-helft hard op het levende corpus maakt na de eerste regeneratie
    stilletjes een ándere tabel), de zes V51b-netlists, de arm en HUIDIG door ÉÉN meetbank (`corpusBank`, gemergede set,
    gesteld DCR-model): de volle vector (de netlist, DCR per spoel tegen de fit), min |Z| met de TAK die het
    draagt en de frequentie, TWEE RMS-kolommen (de volle oordeelband vanaf f_p, en vanaf de tweeter-gate op
    397 Hz — anders is V51b, gezocht op de gepoorte set, niet vergelijkbaar), M-K per paar, M-C per weg met
    grens, opslingering/lift, Q_es×, dissipatie, heetste R bij 10 W en bij 100 W, M-L, EPDR, lobing-synthese,
    serie-R op de woofer (R + DCR = totaal). Gepaard op het DICHTSTBIJZIJNDE V51b-kruispunt, met naam — een
    anekdote per rij en geen corpusdelta (`corpusPairing` zegt n = 0 op label); HUIDIG staat erin als "met pad"
    op zijn eigen 360 Hz. Schrijft `test-fixtures/casus1_a5e3_veld_tabel.json`.
  - `A5E3_JOBS=<n> npx vite-node scripts/measure-a5e3-nad-floor.ts [LABEL ...]` — ÉÉN KETENRUN PER LABEL
    (15–45 min), drie tegelijk; `A5E3_DRY=1` drukt alleen de payload af, `A5E3_ARM=<label>` draait er één.
    Zonder labels de DRIE levende kandidaten met de laagste RMS op de volle band (een gestelde SELECTIE voor
    deze arm, geen rangschikking van de shortlist). Dezelfde payload als de generator met ÉÉN factor verzet:
    de vloer op de FABRIEKSOPGAVE van de NAD (`gestelde_eisen.versterker_nad_min_last_ohm`, 4,0 Ω) op alle drie
    de plaatsen waar hij reist (settings, gates, verklaring). Halen ze hem, en zo niet met hoeveel: het
    geweigerde netwerk (observator, zoals `measure-m1-diagnose-arms.ts`), min |Z| van de geweigerde tune, en
    Y (`floorNeedsSeriesOhm`, V51b). Schrijft `test-fixtures/casus1_a5e3_nad/<label>.json`. **Gemeten
    04-09-2026 (787–1652 s per arm, drie tegelijk): geen van de drie haalt 4,0 Ω — 549,7 · 1495 komt met de
    waardetune op 3,93 (binnen de 2 %-tolerantie!) en verliest dan de tweeter met 0,1 dB; 229,1 · 1727 op 3,90
    plus mid en tweeter; 229,1 · 2304 op 3,35; Y is op twee van drie ONOPLOSBAAR (het minimum zit niet in de
    woofer, dus een actieve LF-tak lost het niet op). Alle drie `verdict.ok: true` op het niveauwerk.**
  **Het veld zelf** (`casus1Field` in `casus1V2.fixture.ts`): orde 4 gesteld op beide overnames (M-1 liet de
  W-M-as zich onthouden; LR2 gaf dezelfde weigeringen met 1–2 dB slechtere RMS), de W-M-vloer op de
  AANDRIJFVLOER van de mid (A5d.3(ii) omgekeerd met het excursieplafond van V49: `f_s · 2^(|plafond|/(6·orde))`,
  148 Hz in plaats van k·f_s = 124; `kruisvensters.parameters.aandrijfvloer`), positiebudget 24 → 20 geleverd
  (4 × 5: de generator dunt posities op de breedste as één voor één en 5 × 5 = 25 zit er nog boven). De M-T-as
  beweegt niet: de aandrijfvloer van de tweeter (1184 Hz) ligt onder k·f_s (1294). **`measure-m1-diagnose-arms.ts`
  herbouwt sinds A5e.3-veld het M-1-VELD expliciet** (vensterinvoer zonder aandrijfvloer, W-M onthoudt zich,
  geen budget), zodat zijn armbestanden reproduceerbaar blijven en `M1_DRY=1` nog zegt wat er gedraaid is.
- **Casus 1b — casus 1's mid en tweeter als TWEEWEG door de v2-worker (E-3, 06-09-2026)** — drie scripts en één
  fixture (`src/lib/engine2/casus1b.fixture.ts`; het referentiebestand `test-fixtures/casus1b/golden_refs_casus1b.json`,
  de bestanden uit `test-fixtures/casus1/` via `bestanden_map`):
  - `npx vite-node scripts/derive-casus1b-huidig-mt.ts` — seconden. Leidt `test-fixtures/casus1b/HUIDIG-MT.adsfilter.json`
    af uit casus 1's HUIDIG (het wooferpad eruit: dertien onderdelen; elk overblijvend onderdeel byte-gelijk); weigert een
    afwijkend bestaand bestand te overschrijven.
  - `npx vite-node scripts/record-casus1b-references.ts` — seconden, geen tune. Klasse A (mid/tweeter mét de V15-blokken
    `_re_parameters`, `_spl_scan_parameters`, `_excursie_parameters`; het venster `kruisvensters.mid_tweeter_orde4` mét het
    verkenningsveld; `verankerde_gaps_dB`), klasse B op `HUIDIG_MT` en élke `KAND_V2_n` die op schijf staat (het manifest
    wordt uit de bestanden gesynchroniseerd, wezen-blokken worden gesnoeid), en de pointer `v2_herkomst`. Draai hem ná de
    generator.
  - `npx vite-node scripts/generate-casus1b-v2-candidates.ts` — **de verkenning (E-2-modus: budget 8, centre-first, één
    uitlijning) door `handleV2Request` kind `v2ChainOne` → `runDesignChain` onder de hook**; shards
    (`test-fixtures/.casus1b-v2-shards/`, gitignored), `V2_ONLY=<n>` / `V2_JOBS=<n>` / `V2_MERGE=1` zoals de
    casus-1-generator; schrijft `KAND-V2-n.adsfilter.json` en `test-fixtures/casus1b_v2_herkomst.json` (mét
    `looptijd_s` per kandidaat). **Gemeten 06-09-2026: 3 kandidaten (1735,4 / 1947,9 / 2186,5 Hz LR4), 415 s met drie
    tegelijk; twee geleverd (1,42 dB / 2,6° en 3,76 dB / 13,8°, beide op de vloer 2,60 Ω), één geweigerd op M-C (tweeter
    −16,1 dB).** De live reproductie (`casus1bV2Candidates.test.ts`) kiest de goedkoopste geleverde op `looptijd_s`.
  **De app stuurt een tweewegverzoek nog naar de v1-worker** (`runChainScan`); deze route is de tweewegroute door de
  v2-worker en niet de knop — casusboek E-3, "wat niet gedaan is".
- **Casus 2 — de SYNTHETISCHE drieweg met grondwaarheid (C-2, 08-09-2026)** — vier scripts, één model en één
  vaste volgorde. `scripts/casus2-model.ts` is het MODEL en dus de grondwaarheid: T/S per driver, een reflexkast
  (woofer, f_s 34, f_b 38) en een gesloten pod (mid, f_c 460), een dome met hoge f_s (tweeter, 1500), de gekozen
  poort (3,0/7,0 ms → 1/T = 250 Hz op de kop), de GEDOCUMENTEERDE meetspanning (2,83 V op 1 m) en de breakups.
  Elk getal is bewust anders dan casus 1.
  - `npx vite-node scripts/generate-casus2-measurements.ts` — seconden. Schrijft `test-fixtures/casus2/`: drie
    ZMA-sweeps, twee nabij-velden, zes ver-velden (FRD met ARTA-header) en `grondwaarheid.json`. Eén keten
    natuurkunde: `Z_mech = R_ms + sM_ms + 1/(sC_ms) + S_d²·Z_ab`, daaruit de impedantie, de conussnelheid, de
    uitgestraalde volumesnelheid (poortsplitsing op de reflexkast), het verre veld (kolvenkarakteristiek ×
    baffle-step × breakups) en het nabije veld. Breakups zijn analoge peaking-secties, dus de gestelde hoogte IS
    de piekwinst.
  - `npx vite-node scripts/sync-casus2-project-input.ts` — seconden. Kopieert het model naar de projectinvoer
    (driverkaart, geometrie, headerblok, de drie versterkergetallen). **Een eigen script en geen stap in de
    recorder**, want de fixture leest haar constanten bij IMPORT: een recorder die het bestand halverwege zijn
    eigen run bijwerkt meet nog steeds met de oude kaart. Dát is precies wat er misging — de eerste run meldde de
    excursieroute 42/51/35 % naast de grondwaarheid, en alle drie waren een kaart uit een eerdere afstemming.
  - `npx vite-node scripts/record-casus2-references.ts` — seconden, geen tune. Schrijft klasse A (élke grootheid
    met grondwaarheid ERNAAST, het verschil en de tolerantieklasse; `soort` scheidt ACCEPTATIE van CONTROLE), de
    bevindingen mét reden, de vensters, het anker, en klasse B op élke netlist die op schijf staat. Draai hem ná
    de generator en ná de sync.
  - `V2_JOBS=<n> npx vite-node scripts/generate-casus2-v2-candidates.ts` — ÉÉN KETENRUN PER KANDIDAAT (gemeten
    803–2361 s), `V2_ONLY` / `V2_MERGE` zoals de casus-1-generator. De verkenning (E-2, budget 8) door
    `handleV2Request` kind `v2Chain3One`.
  **DE VOLGORDE IS BINDEND**: measurements → sync → generator → recorder. En de tolerantieklassen zijn die van
  casus 1, ONGEWIJZIGD overgenomen: zij zijn voor gemeten data met ruis gekozen, dus een synthetische casus hoort
  ze met marge te halen — waar zij dat niet doet is dat een bevinding over de schatter en geen tolerantie die
  opgerekt moet worden.
- **EEN BROWSERRUN EN DE DEV-SERVER: BEWERK TIJDENS DIE RUN GEEN ENKEL BESTAND DAT DE SERVER
  DIENT (LP-1, 07-09-2026).** `index.html` (de landing) en `app/index.html` zijn twee entries van
  ÉÉN Vite-build, dus een bewerking van de landing stuurt de app-pagina een full-reload — en een
  lopende v2-run verdwijnt daarmee SPOORLOOS: 0 van 6 kandidaten na 452 s, geen melding, geen
  shortlist, geen stempel. Het vite-log is de enige aanwijzing (`page reload index.html`). De
  volgorde is dus: eerst de bestanden, dan de run, dan de screenshots. **Pollen met
  `page.evaluate` stoort een run NIET** — dat is nagemeten, niet aangenomen: de verkenning
  reproduceerde onder een poll van elke 60 s op 2102 s tegen E-2's 2032 s. De oudere notitie
  "leave the page alone, cause not established" is hiermee vervangen; de oorzaak is HMR en niet
  het screenshotten. Bij het screenshotten zelf: het SPL-paneel is `position: sticky` bovenin
  `.analysis-pane` en dekt af wat je eronder scrolt — ontpin het met zijn 📌-knop, of neem
  volle-venster-opnamen (wat `public/shots/*.jpg` sowieso zijn).
- **Een app-run naspelen in de repo (E-2, 06-09-2026)**: `npx vite-node scripts/replay-app-run.ts <export.json>
  [--set merged|gated|demo|casus1b] [--run]` — seconden zonder `--run`. De invoer is wat de knop **"Export run (JSON)"** onder de
  run-stempel van de app schrijft (`runExport.ts`, formaat `crossover-studio-run/1`): de gestelde eisen, de
  run-instellingen, de VELD-instellingen (modus, budget, uitlijningen, de per-paar-afleidingsinvoer), de vensterinvoer en
  de orde-afleidingen waarop het veld stond, élke kandidaat (label, positie, kooi, orde, uitlijning, venster), de
  stempel en de shortlist. Twee lagen: **laag 1** herbouwt het veld uit het blok alleen (de generator op de
  geëxporteerde vensterinvoer — een zuivere functie, dus exact, en het bewijs dat het blok volstaat; de
  `choices`-component van de stempel wordt herberekend en vergeleken); **laag 2** herbouwt het rapport op de
  casus-1-set van de REPO (`merged`, de standaard sinds M-1, of `gated`, de sessie van 22-08-2026 waarvan de
  demobundel een herbemonstering is) met de geëxporteerde rapportinstellingen — hersleuteld van de driver-id's van de
  app naar die van de repo — leidt het veld dáárvan af (met de eigen gemeten krommen van de repo voor de
  natural-slope-fit) en vergelijkt kandidaat voor kandidaat; waar zij verschillen worden de vensterinvoer-velden
  benoemd die het verschil maakten. `--run` tunet élke nagespeelde kandidaat door `handleV2Request` zoals de generator
  (minuten voor een verkenning, uren voor een vol veld) en zet de shortlist naast de geëxporteerde. **Kandidaten, geen
  bytes (V46):** een veld is een veld op elke machine; een getuned netwerk reproduceert byte-voor-byte alleen per
  (machine, runtime). Exitcode 0 alleen als beide lagen SAME zeggen. **`--set demo`** neemt de demobundel van de app
  (`src/demo3way.ts`) door de adapter van de app (`buildEngineV2Input`), precies zoals de browser hem neemt — op
  dezelfde bestanden moet de repo tot op het laatste cijfer hetzelfde veld afleiden. **Gemeten 06-09-2026 op de
  bewaarde browserrun `test-fixtures/casus1_e2_verkenning_run.json` (een verkenning op casus 1 met de gestelde eisen,
  2032 s in een headless Chrome, 6 kandidaten, 1 gekwalificeerd): laag 1 SAME (digest 299ef5e7 = de stempel), laag 2
  `--set demo` SAME (6 van 6, de vensterinvoer verschilt alleen in float-ruis op 1e-10..1e-14), laag 2 `--set gated`
  DIFFERENT — de demobundel is een herbemonstering op 500 punten en de posities schuiven 0,2 Hz (W-M) en 1,3–1,8 Hz
  (M-T); het script benoemt de breakup-hoogten, de geometrie (382,4 tegen 261 mm) en de directiviteit (0–60° tegen één
  hoek) als de verschillen.** Het bewaarde blok draagt nog geen `geometry` (het is geschreven vóór het blok het
  droeg); het script zegt dat en neemt dan de demokast. **`--set casus1b` (E-3b) is de TWEEWEGHELFT**: het script leest
  het aantal overnames van de export zelf (`exp.field.windowInputs.length` — één per aangrenzend paar, dus 1 = tweeweg)
  en WEIGERT een tweewegexport tegen een driewegset en omgekeerd, bij naam, in plaats van een diff af te drukken die
  niemand kan lezen. Laag 1 had nooit een set nodig en was N-neutraal vanaf het begin; laag 2 bouwt op casus 1b
  (`casus1bManifest`, `HUIDIG_MT` als geladen filter, casus 1b's geometrie) en `--run` gaat door `v2ChainOne` met
  `casus1bChainInputFor` en `casus1bV2Declaration`, precies zoals de casus-1b-generator. **`tsconfig.scripts.json` kent sinds E-2 ook `vite/client`
  als type** (`types: ["node", "vite/client"]`), omdat het replay-script `demo3way.ts` importeert en die module
  Vite's `?raw`-imports draagt — zonder die declaratie 21 TS2307-fouten in `tsc -b`. **`tsconfig.test.json`
  kent hem sinds U-3 óók**, om precies dezelfde reden één project verder: `demoBundle.test.ts` importeert
  beide demobundels.
- **DE TWEE DEMOBUNDELS (U-3, 09-09-2026)** — twee scripts, en de eerste is de diagnose:
  - `npx vite-node scripts/measure-u3-demo-bundles.ts` — seconden, geen ketenrun en geen tune. Tabel 1: wat
    élk meetbestand van élke demobundel over zijn eigen geldigheid zegt, door BEIDE lezers van de app
    (`readGateHeader`/`readMergeBlock` van de v1-laag — die `sourceMeta` en dus `refuseIfUnverified` voedt —
    en `parseArtaHeader` van engine2, op veldnaam). Tabel 2: welke I-1-registervelden een bundel kan dragen
    (zesendertig) en welke elke bundel draagt. Schrijft `test-fixtures/demo_u3_bundels.json`; de kolom
    "tweeweg vóór U-3" is een GEDATEERD record, want die lader bestond uit `setState`-regels in `App.tsx`
    en is vervangen. **Gemeten 09-09-2026: de tweewegdemo droeg twaalf headerloze exports van het
    KOAN-prototype van 2023 — `absent` op alle twaalf, dus de Filter-sectie weigerde de run met de eigen
    eerlijke melding van de app — en negen van de zesendertig registervelden, waarvan NUL van de vijftien
    oordeelsvelden. De driewegdemo staat op 18 van 18 leesbaar maar draagt de oordeelsvelden evenmin
    (0/15): het gat is niet eigen aan de tweeweg.**
  - `npx vite-node scripts/build-demo2way.ts` — seconden. Bouwt de tweewegbundel uit casus 1b: leest casus 1's
    eigen bestanden, herbemonstert ze op het rooster van de driewegdemo (500 punten ver veld, 250 nabij veld)
    en schrijft de ORIGINELE headers WOORDELIJK terug met één provenance-regel erbij. Dat verbatim is het hele
    punt: een venster terugschrijven in een bestand dat er nooit een droeg is een meting verzinnen (A3h), dus
    de reparatie is een ándere sessie en niet een andere header. Eén commentaarregel wordt gedropt, de
    KOLOM-header die ARTA als commentaar schrijft. De impedanties gaan door `limToZmaText`, de eigen omzetter
    van de app. **Vier van de zes bestanden zijn byte-identiek in hun datarijen aan die van de driewegdemo —
    dezelfde luidspreker, dezelfde sessie — en `demoBundle.test.ts` pint dat, want een kopie van een meting is
    een bestand dat kan wegdrijven.**
- **De barrière-resolutie op smalle dips, gemeten vóór er gekozen is (E-1, 06-09-2026)**:
  `npx vite-node scripts/measure-e1-barrier-resolution.ts` — seconden, geen ketenrun en geen tune. Over ÉLKE bevroren
  netlist (161): min |Z| op de poortsweep (1600 punten) tegen het verlengde barrièreraster (394, wat `'safety-extended'`
  leest), naast de DIP-BREEDTE (de octaafspanne rond het sweep-minimum waarover |Z| binnen één vloerspeling van de bodem
  blijft — de bestaande conventie, geen nieuwe tolerantie) en de celbreedte van het raster ter plekke; dan drie
  verdichtingen met de eigen punten van de sweep (`refinedSystemMinImpedanceOhm`, `dipCellsOf`): rond het grove globale
  minimum, rond élk grof lokaal minimum, en overal waar het grove raster onder 2× de vloer leest (die factor staat alleen
  in het script, als meetarm); en de kosten per evaluatie in de V33-vorm. **Gemeten 06-09-2026: twee van 161 boven de
  speling op het verlengde raster (KAND_V2_1 0,081 Ω, V28_KAND_2 0,073), beide met een dip smaller dan één cel (0,021 en
  0,014 oct tegen 0,042), geen enkele bredere dip erboven; de verdichting rond het globale minimum alleen sluit beide
  (grootste rest 0,0089 Ω op KAND_V2_5, 128 van 161 bit-identiek aan de sweep, 12 extra punten, 2,98 → 3,07 ms per
  evaluatie op HUIDIG: +3 %); rond élk lokaal minimum 146 van 161 bit-identiek voor 73 punten mediaan (+14–29 %); onder
  2× de vloer 696 punten, bijna de sweep zelf.** De engine leest de eerste (`BARRIER_DIP_REFINEMENT`, de vijfde waarde van
  de V33-sleutel: `'safety-extended-refined'`); de route leidt nog `'safety-extended'` af — omschakelen is één woord in
  `candidateDeclaration.ts` en één regeneratie. Schrijft `test-fixtures/casus1_e1_barriere_verdichting.json`.
- **Wat de app-merge produceert naast de twee merges die al bestaan (I-2, 08-09-2026)**:
  `npx vite-node scripts/measure-i2-appmerge.ts` — seconden, geen ketenrun en geen tune. Bouwt met
  `nfMerge.ts` de merge van casus 1's mid en beide woofers uit hun eigen NF + FF, met de band en het
  stapmodel UIT HET BLOK van de referentie (een merge reproduceren betekent het model gebruiken dat
  zij stelt), en legt hem band voor band naast het referentiebestand; schrijft
  `test-fixtures/casus1_i2_appmerge.json`, dat `nfMerge.test.ts` uit een verse meting laat
  reproduceren. **DE MID IS DE STRENGE** (zelfde NF, zelfde FF, zelfde band, geen poort): de
  MAGNITUDE reproduceert `Koan_M_merged.frd` binnen de afronding van het bestand zelf (max 0,0005 dB)
  en de splice-gain exact. **De FASE niet, en dat is een bevinding over M-1:**
  `scripts/merge-casus1-mid.ts` leest `atan2(Im, Re)` van het log-spectrum waar de minimumfase `Im`
  is (174,55° bij 20,5 Hz, 139,9° bij 801, tegen een echte shelf-minimumfase van 3,6°–12,6°), dus de
  gemergede fase onder de splice wijkt 28,9° af bij 20–40 Hz, 17,8° bij 80–150 en 0,00° boven 800 Hz
  — precies onder de splice en nergens anders. **NIET gerepareerd:** dat vraagt casus 1's mid opnieuw
  mergen en verplaatst élk corpus dat op de meetset rust; de eerstvolgende regeneratie is de plek.
  `src/lib/minphase.ts` (de ene implementatie van dit project) nam altijd al `Im` en is wat
  `nfMerge.ts` leest — nagemeten 0,08° van de exacte analytische cepstrum in de band die telt.
  **DE WOOFERS kunnen niet exact gereproduceerd worden en hun eigen kop zegt waarom**
  (`LF = eigen nearfield + 0.5 x poort, g=0.41`; die poortmeting bestaat hier niet en er een
  verzinnen is verboden), dus de DIVERGENTIE is gepind: 5,3 dB rms bij 20–40 Hz, 1,0–1,4 bij
  150–500, 0,4–0,5 in de fitband, 0,00 boven 800 Hz. **De poort is NIET verwaarloosbaar in de
  fitband** — de niveaufit verschuift 1,36 en 0,99 dB, want een 600 mm neerwaartse poort resoneert
  als orgelpijp bij 500–800 Hz. Dat corrigeert de lezing die "without the port ~80 Hz" uitlokt.
- **Welk impedantiemodel elke gemeten sweep draagt, en of zijn exponent een meting is (B-1, 09-09-2026)**:
  `npx vite-node scripts/measure-b1-motional-model.ts` — seconden, geen ketenrun en geen tune. Per sweep van
  élke casus in het boek BEIDE armen van de motionele fit naast elkaar: (a) `R_e + Σ takken` en (b) idem plus
  de half-machts lekterm `K·(jω)^n`, met R_e, residu, de lekfractie op de bandtop, de exponent, en wat de
  keuze met f en Q van de fundamentele tak doet — plus de grondwaarheid ernaast waar die bestaat (casus 2).
  Daarnaast twee tabellen: wat er BINNEN de HF-fitband van `z-semi-inductance` zit naast de spoel (de
  motionele staart — de gecorrigeerde oorzaak van C-2/B1), en de STROOMAFWAARTSE tegenfeitelijke: wat model
  (a) zou kosten aan Q_ms, x/V, M-C-plafond en vensteraandrijfvloer, gemeten door de R_e van elke arm als
  lezing in te voeren. Schrijft `test-fixtures/casus1_b1_modelkeuze.json`; `motionalModel.test.ts` reproduceert
  hem uit een verse meting. **Gemeten 09-09-2026: de lekterm wordt op alle elf de sweeps GEHOUDEN — casus 2
  beslecht dat (lek-arm 6,185/5,400/4,100 tegen een grondwaarheid van 6,2/5,4/4,1; kale arm 0,08–0,23 Ω
  ernaast, tegen een klasse van 0,03 Ω) — en de EXPONENT wordt alleen op casus 2's twee gesloten wegen
  gepubliceerd, waar hij exact is; op de vented weg en op alle drie de casus-1-wegen verschuift hij 8,9–34,4 %
  over de vergelijkingsbanden en onthoudt de fit zich. De stroomafwaartse prijs van model (a) is hoogstens
  0,115 dB op een M-C-plafond en 0,1 Hz op een vensteraandrijfvloer.**
- **Is de A5d.6-inversie de inverse van de M-D-metriek? (E-4, 07-09-2026)**:
  `npx vite-node scripts/measure-e4-inversion.ts [SLEUTEL ...]` — seconden, geen ketenrun en geen
  tune. Per bevroren netlist: de totale seriespoel van de laagste weg, de padweerstand die de
  driver ziet (discreet plus het koper van diezelfde spoelen, `levelWork.ts`), M-D GEMETEN op het
  echte netwerk, wat de kale-RL-inversie (`lfBumpForSeriesRL`, H = Z/(Z+R+jωL)) daar voorspelt, en
  het plafond dat `maxSeriesInductanceFromBump` bij die padweerstand oplevert. Schrijft
  `test-fixtures/casus1_e4_inversie.json`; met sleutels als argument draait hij een deelverzameling
  en schrijft niets. **Gemeten 07-09-2026: 161 netlists, Δ (inversie − metriek) van −0,856 via
  mediaan 1,737 tot 8,701 dB; NEGENENZESTIG staan boven hun plafond én binnen het budget en NUL
  andersom — de doos is op deze sets systematisch te streng en nergens permissief.** Alle tien de
  levende netlists dragen 3,8–6,3 mH tegen een plafond van ~2,5 mH en meten −0,4..−2,9 dB tegen
  een budget van 1,4. **DE LEESREGEL: het plafond is een ZOEKGRENS (A5d.6) en M-D is de POORT
  (V45/V48), dus boven het plafond en binnen het budget is geen schending maar een te strenge
  doos.** Twee verklaringen zijn als NIET-oorzaak vastgelegd: poort en rapport lezen hetzelfde
  raster (`frozenNetlistGates` assert dat sinds V45), en de meetset doet niets — HUIDIG leest
  `resonantDb` −0,939 op de repo-set en −0,924 door de adapter van de app op de demobundel, want
  het wooferveld verschilt ~5,7 dB en `resonantDb` is een verschil. Repareren vraagt het echte
  netwerk per evaluatie, dus een andere zoekdoos en een ander corpus: casusboek E-4 draagt de twee
  opties en de meting die ze scheidt.
- **De M-T-bovengrens: wat de bovenkant weet, wat de tuner ermee doet, het veld onder een gesteld plafond (E-1)**:
  `npx vite-node scripts/measure-e1-mt-ceiling.ts` — seconden, geen ketenrun en geen tune. Vier tabellen: (1) élke grens
  die de bovenkant van het M-T-venster kent (breakup 2304 Hz bindt; directiviteit −6 dB@30° van de mid 5388 Hz bindt
  niet; niets gesteld) met de lobing-zones als VOORKEUR ernaast (V20a); (2) per geleverde netlist (levend, de niet-bevroren
  549,7 · 2304 uit de shards, A5e.3-veld) de gestelde positie, de kooi, het kruispunt volgens het rapport én volgens de
  poortroute (de V32-vorm — op het levende corpus binnen enkele Hz gelijk), en of het de kooi verliet; (3) het ruwe
  niveauverschil mid − tweeter op het veiligheidsraster met zijn lokale minimum BINNEN het venster; (4) het veld onder
  de strengste bekende grens (ongewijzigd: 8 × 3 = 24, alle tien bevroren erbinnen) en onder een GESTELD plafond op de
  gemeten landing (2052 Hz: M-T 1647/2052, W-M twaalf posities, 12 × 2 = 24; zeven bevroren binnen, drie buiten —
  KAND_V2_2/_6/_7). **Gemeten 06-09-2026: elke geleverde plafondpositie (2304) kruist 61–255 Hz lager (2049, 2050, 2052,
  2243), drie van vier verlaten de kooi 2119–2304 omlaag; vijf van achttien geleverde M-T-kruispunten liggen binnen 0,02
  octaaf van het lokale minimum van mid − tweeter in het venster (−4,98 dB bij 2056 Hz: de +0,4 dB-piek van de tweeter
  tegen de −1,1 dB-stap van de mid) — een responskenmerk, geen grens.** Schrijft `test-fixtures/casus1_e1_mt_bovengrens.json`.
- **De A5e.3c-tabel: het veld onder de A5e.3b-grenzen, per kandidaat, met de verwerpingen en de shortlist-grootte als
  derde toestand (A5e.3c, 06-09-2026)**: `npx vite-node scripts/measure-a5e3c-field.ts` — seconden, geen ketenrun en
  geen tune. Élke kandidaat van het levende veld in generatorvolgorde — GELEVERD met de volle vector, GEWEIGERD met de
  grond en wat de geweigerde tune nog mat (min |Z|, RMS, M-C, Y, de spoelen van het geweigerde netwerk), of GELEVERD
  MAAR NIET BEVROREN (de shortlist houdt `DEFAULT_SHORTLIST_SIZE` = 10 en kiest op spreiding; zulke netwerken bestaan
  alleen in de shards `test-fixtures/.casus1-v2-shards/`, gitignored, en staan als volle rij in de tabel als zij er
  zijn) — plus het gedateerde A5e.3-veld, de A5e.3b-ablatie-arm "bouwbare val" (`casus1_a5e3b_ablatie/bouwbaar.json`)
  en HUIDIG. Kolommen: uitkomst met grond, de TUNER-RIMPEL en -fase (`net.after.rippleDb`/`.phaseDeg` — het getal dat de
  generator-monitor afdrukt, géén RMS), de looptijd per kandidaat (uit de shards, in het JSON bewaard), kruispunt gesteld → geleverd, min |Z| met tak, twee RMS-kolommen, M-K, M-C
  per weg, opslingering/lift, Q_es×, dissipatie, heetste R bij 10 W, KOPER PER WEG, grootste spoel op de laagste weg
  tegen de spanwijdte, de VAL (L/C/f₀/demping), lobing, onderdelen, BOM uit de catalogus (goedkoopste realisatie ±5 %
  per onderdeel; spoelen uit de gestelde familie van hun weg, stapel van twee als één onderdeel niet dekt — en dan zegt
  de kolom dat; ONDERGRENS als een onderdeel geen realisatie heeft). Gepaard tegen A5e.3-veld op label waar het kan
  (nul van elf) en anders op het dichtstbijzijnde kruispunt met de octaafafstand; de twee vragen van de sessie als
  samenvatting (per W-M-positie de uitkomst en de grootste wooferspoel; wie alles haalt, gesorteerd op RMS). Schrijft
  `test-fixtures/casus1_a5e3c_veld_tabel.json`.
- **De A5e.3b-vóórmeting: het veld onder de nieuwe grenzen, de barrière-uitgestrektheid, de wezen
  (A5e.3b, 05-09-2026)**: `npx vite-node scripts/measure-a5e3b-voormeting.ts` — seconden, geen ketenrun en
  geen tune. Drie tabellen: (b)3 het veld met de gestelde M-T-vloer (1647 Hz) en budget 24 (8 × 3 = 24 uit 36;
  vijf van de zeven geleverde binnen), (c)2 min |Z| per raster op de zeven (veiligheid / verlengd / poort, met
  het opslinger-plafond als controle die NIET beweegt), (c)3 de resonantieloze shunt-ketens per levende netlist
  met het oordeel dat level-work/1.2 erover velt.
- **De ablatie van de val op KAND_V2_5 (A5e.3b (a))**: `npx vite-node scripts/measure-a5e3b-ablatie.ts` —
  vier armen, waarvan twee WAARDEN-ONLY hertunes (~250 s per stuk, parallel als kindproces; bestaande
  armbestanden in `test-fixtures/casus1_a5e3b_ablatie/` worden gelezen, `A5E3B_REDO=1` overschrijft,
  `A5E3B_DRY=1` is de rookproef zonder tune). De tune-armen oogsten de ECHTE worker-opties via
  `hooks.tuneOptionsFor` op een eigen zaad (een stomp op `runThreeWayChain`), bewust zonder `staged` en
  `branchTargets` (de v38-bank-les); de audit blijft aan. BOM in euro's uit de catalogus die de familie stelt.
  **De meting ving een bound-bug:** de eerste bouwbare-val-arm leverde 31,59 mH door een hard plafond van 22,0 —
  `valueCeilings` boven de ZACHTE rand (15 mH voor spoelen) werd stil genegeerd; sinds A5e.3b klemt zo'n plafond
  ook daarboven (`capLg` in `netOptimizer.ts`) en de herhaalde arm leverde exact 22,00 mH.
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
  is daarmee 2 `[live]` + 10 `[bytes]` − 1 die beide draagt = ELF — **sinds E-3 (06-09-2026): 3 `[live]` + 11 `[bytes]` − 2
  die beide dragen = TWAALF** (de zevende bytes-naam en de derde live-naam zijn dezelfde test: casus 1b door `v2ChainOne`). (4) **SINDS 01-09-2026 een LIVE-inventaris ernaast, in dezelfde
  vorm en om dezelfde reden: precies TWEE blokken, met naam (DRIE sinds E-3).** De splitsing van de twee live
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

### M-1-guards (de gemergede meetset, het plateau op 0 dB, het veld met LR4 én LR2)
- `src/lib/engine2/ingest/manifest.ts` — **`parseArtaHeader` leest sinds M-1 het merge-/geldigheidsblok**
  (`Merge = NF/FF`, `Valid from/to = … Hz`, `Merge NF source`, `Merge FF source`, `Merge FF window`,
  `Merge splice band`, `Merge splice fit`, `Merge step model`, `Merge port model`, `Merge prediction`,
  `Merge floor reason`, `Merge status`) op VELDNAAM, in dezelfde `Naam = waarde`-vorm als een ARTA-header
  (`ArtaHeader.merge`, `.statedValidity`, type `MergeBlock`). Geen proza-parser (UI-1-les). Het FF-venster
  reist als MERGE-veld en niet als `Reference time`/`Right window`, anders zou de gate-vloer van de FF-helft
  over de hele merge gelden.
- `src/lib/engine2/ingest/validity.ts` — **een verklaarde merge neemt een eigen pad** (`mergedValidity`):
  de vloer is de gestelde `Valid from`, provenance `merge-block` (een vierde regel in de rangorde van A5b.1:
  bindend zoals een header-vloer, niets versoepelt hem, een gesteld plafond vernauwt alleen); de adviserende
  FF/NF-detector ONTHOUDT ZICH (het bestand IS de merge — een fit van het recept tegen zijn ingrediënten);
  fijnstructuur vanaf 2/T van de FF-helft; `Valid from` op een GEPOORT bestand blijft data (A5b.1(i) niet
  via de achterdeur); een merge zonder `Valid from` heeft een ONBEKENDE vloer. `validity-header` 1.0 → 1.1.
  `ingest/mergeBlock.test.ts` draagt de claims (parser, vloer, onthouding mét de tegenproef dat dezelfde fit
  op een gepoort bestand de vloer WEL optilt, `Valid to` vernauwt alleen, de twee meetsets op de echte
  bestanden). Geen metriek, poort of inversie is aangeraakt.
- `src/lib/engine2/casus1.fixture.ts` — **twee meetsets**, `casus1Manifest(golden, 'merged' | 'gated')`,
  standaard `'merged'`; de gemergede bestanden nemen de PLAATS in van de gepoorte on-axis bestanden die zij
  vervangen (`gemergde_set.bestanden[*].vervangt`). **Een gestelde plateau-diepte van 0 is de vlakke
  referentie** (`casus1BassPlateauDb` accepteert 0; `casus1TargetCurve` → `FLAT_TARGET`);
  `casus1TargetCurveAt(depth)` bouwt de gedateerde curve voor de bruggen. `max_serie_R_laagste_weg_ohm` is
  `null` (ingetrokken bij M-1, met reden) → de regel is weer `'none'`.
- `src/lib/engine2/casus1V2.fixture.ts` — **oordeelband en ketenraster zijn AFGELEID**: de vloer is de hoogste
  van de geldigheidsvloer van de laagste weg en haar f_p (52,4 Hz; `CASUS1_V2_BAND_SOURCE` zegt welke), het
  raster begint op de GELDIGHEIDSVLOER (20,5 Hz) met de resolutie van het precedent (143 punten over
  20,5–20 000 Hz). **Het raster begint bewust ONDER de band, en dat is gemeten:** met het raster vanaf f_p
  las `isHighPassProtected` de WOOFER als hoogdoorlaatbeschermd — de regel prikt een halve octaaf onder de
  doorlaatbandvloer, dat is dan het reflexdal, en de eigen impedantie van de driver trekt de overdracht
  daar 2,5–3,9 dB omlaag tegen een drempel van 1,0 dB — waarop M-C de woofer op f_p oordeelde (+2,9 dB tegen
  afgeleid −7,6) en de eerste M-1-regeneratie acht van acht kandidaten weigerde. Met het raster op de
  geldigheidsvloer landt de probe op 10–14 Hz (−0,2..−1,2 dB) en is de woofer op de bevroren netlists wat
  V49 zegt: geen hoogdoorlaat, geen eis — maar het ZAAD van een LR2-kandidaat op 201 Hz las nog +3,2 dB in
  20–29 Hz (de laagdoorlaatspoel resoneert met de onderste motionele piek van de woofer op 16,5 Hz) en werd
  alsnog geweigerd, en met de last resistief gemaakt nog steeds 52 van 115 (het zaad van een LR2 op 259 Hz
  piekt +1,6 dB in 20–29 Hz in een resistieve last: zijn LC-ladder van 12,5 + 16,7 + 26,2 mH tegen 687 en
  214 µF resoneert in de twintig hertz). **Daarom is de regel bij M-1 gecorrigeerd — de ENE poortwijziging
  van deze sessie, en een reparatie, geen herdefinitie — in twee helften:** (1) `isHighPassProtected` leest
  de overdracht van het FILTER in een RESISTIEVE last (de doorlaatband-mediaan van |Z| van de weg, via
  `resolveWithLoad`) in plaats van in de gemeten impedantie, zodat de eigen resonanties van de driver niet
  als hoogdoorlaat kunnen lezen; (2) de drempel is AFGELEID en niet getypt: één filterorde over de
  probe-afstand (`HP_PROTECTION_MIN_RISE_DB = DB_PER_OCTAVE_PER_ORDER × HP_PROTECTION_PROBE_OCTAVES` = 3 dB)
  in plaats van 1,0 dB — een resonantiebult haalt dat niet, elke hoogdoorlaat en elke shelf van een paar dB
  wél. Een derde vorm (de verzwakking moet een halve octaaf lager DOORGAAN) is geprobeerd en ingetrokken: zij
  ontnam zeventien casusboek-mids met een −12 dB-shelf onder hun doorlaatband hun M-C-oordeel, en een shelf
  van twaalf dB is bescherming die M-C moet blijven oordelen. **Gemeten over het hele casusboek (149 netlists,
  447 wegen): de nieuwe regel classificeert GEEN ENKELE weg anders dan het V47-blok** — de reparatie raakt
  precies de LC-bult van een woofer met een lage overname en niets anders. Byte-baselines (`f4cRegression`,
  `workerRouteRegression`) reproduceren; `gates.test.ts` draagt de tegenproef (een impedantie in de vorm van
  een reflexwoofer — dal onder, piek in de doorlaatbandvloer — op de laagste weg van het tweewegfixture: de
  oude lezing stijgt, de regel zegt nee, de echte hoogdoorlaat van de tweeter blijft ja);
  `casus1ChainInput(…, chainGrid?)` voor een gedateerd raster. **Het veld** (`casus1Field`): de W-M-as
  onthoudt zich op de orde (geen gestelde orde, geen gewapende regel → elke bouwbare orde een eigen
  kandidaat) met de bibliotheek beperkt tot de twee LR-uitlijningen (`CASUS1_FIELD_ALIGNMENTS`, Sanders vraag:
  LR4 en LR2); de M-T-as houdt orde 4. 13 + 10 posities × 5 = 115 kandidaten. `casus1Field.test.ts` pint dat.
- `src/lib/engine2/goldenCasus1.test.ts` — de klasse-A-referenties op de gemergede set mét brug: `FF_vloer_merge`
  (merge-block) naast `FF_vloer_header` (reproduceert op `'gated'`); `kruisvensters.woofer_mid_orde4` (124–550,
  vloer `fs`) en `_orde2` (178–550) met `_gepoort_tot_M1` (397–548, `validity`); `verankerde_gaps_dB` met vlak
  plateau (0,896 / 3,544) en DRIE bruggen in `_waarden_gepoort_tot_M1` — gepoort + plateau 2,5 (1,328 / 2,818),
  gepoort vlak (0,895 / 3,444), gemergd + plateau 2,5 (1,980 / 2,754: de tegenproef dat een doelcurve de gaps
  nog beweegt al stelt M-1 er geen); de doelcurve-parameters zijn `flat`/0 en de gedateerde curve leidt haar
  overgang nog uit de kast af.
- `src/lib/engine2/frozenNetlistGates.test.ts` — de V45-blokken lopen op de GEDATEERDE curve
  (`casus1TargetCurveAt(2.5)`, want een curve van diepte 0 kan haar mechanisme niet tonen); het V51-plateaublok
  zegt "flat: niets te oordelen" en meet ernaast dat de gedateerde curve in het RAPPORT nog steeds niet
  beoordeeld wordt (gezamenlijke band 397+, de tweeter draagt de gate) en op de ZOEKBAND wél (3,08 octaaf onder
  de overgang); de V34-probe houdt de V34-bevinding op het V34-raster (200–20 000/96) en assert de M-1-lezing
  ernaast (f_p is een binnenpunt van het M-1-raster: beide randregels accepteren, en de lezing is een meting die
  binnen een rasterstap met het veiligheidsraster overeenkomt); de V38-fix-demonstratie
  loopt op haar eigen raster, band én meetset (`'gated'`) — op de gemergede set landt het slechtst beoordeelde
  ontwerp in het MIDDEN van de zoekmaat-rangorde en niet in de betere helft, en een claim over een gladdingskern
  aan een bandrand wordt niet scherper door hem te hermeten op een set waarvan die rand verschoof.
- `coverage`, `manualWindowAndLobing`, `versionAndCapability` (de stempel), `borderFacts` (lek 2),
  `newMeasurement`, `corpusPairing` (de gedateerde claims) — lezen `'gated'`, met de reden bij de aanroep.

### A5e.3-veld-guards (de families gesteld, de aandrijfvloer, het veld op het echte doel)
- `src/lib/engine2/predesign/xoWindow.ts` — **de AANDRIJFVLOER: A5d.3(ii) omgekeerd.** Regel (ii) van de
  orde-afleiding deelt de verzwakking die M-C op de resonantie van de bovenliggende driver vraagt door de
  octaafafstand tot het kruispunt en antwoordt met een orde; bij een GEGEVEN orde antwoordt dezelfde regel met
  een frequentie: `f_vloer = f_s · 2^(|plafond| / (DB_PER_OCTAVE_PER_ORDER · orde))`. De invoer is het
  EXCURSIEPLAFOND van M-C v2.0 (V49, `ceilingDbReInput`, klasse A per driver — driverkaart, versterkerpiek,
  sweep), via `XoWindowInput.upperDriveCeilingDb`, dat `report.ts` uit `metrics.driveExcursion` vult; het
  GESTELDE M-C-getal wordt met opzet NIET gelezen (passband-relatief, een projectconventie en geen
  drivereigenschap; de orde-afleiding leest het al als eis). Rule-tag `'drive'`; k·f_s blijft ernaast als
  conventie en de HOOGSTE vloer bindt. Asymptotische helling, doorlaatband op de ingang — de strengste eerlijke
  lezing: een pad maakt de eis makkelijker en een vloer die een pad aanneemt neemt een ontwerp aan. Absent =
  geen vloer (P4): elke synthetische venstertest is onaangeraakt, en `newMeasurement`/`coverage` lezen wat zij
  lazen. Gemeten op casus 1: W-M 148 Hz (bindt; k·f_s 124 als brug `_k_fs_tot_A5e3veld`), M-T 1184 Hz (bindt
  niet; k·f_s 1294 blijft). **Waarom 124 Hz nooit een zinnige positie was:** een LR4 op 124 Hz verzwakt de mid op
  88,8 Hz asymptotisch 24·log2(124/88,8) = 11,6 dB tegen een plafond van 17,7 — M-1 weigerde vier van de vijf
  kandidaten op die positie op M-C (mid).
- `src/lib/engine2/goldenCasus1.test.ts` — het W-M-venster staat op `'drive'` met de inversie nagerekend op de
  metriek (bij de vloer is `6 · orde · log2(f/f_s)` exact het plafond), de k·f_s-brug reproduceert met
  `upperDriveCeilingDb: null`, en het M-T-venster draagt de aandrijfvloer als LIMIET die ÓNDER k·f_s ligt —
  zonder die tegenproef is "M-T bewoog niet" niet te onderscheiden van "de vloer bereikt de M-T-as niet".
- `src/lib/engine2/predesign/casus1Field.test.ts` — leest sinds A5e.3-veld de excursie-instellingen mee (zonder
  bouwt een rapport M-1's veld), pint 4 × 5 = 20 uit 12 × 5 = 60 onder budget 24 mét de thinning-zin, orde 4
  gesteld op beide assen, de laagste positie op de vloer, `'drive'` op W-M en `'fs'` op M-T.
- `src/lib/engine2/frozenNetlistGates.test.ts` — **zes A5e.3-veld-blokken.** De families zijn GESTELD (naam en
  datum, motivering noemt de shunts) en elke weg lost op; élke LEVENDE netlist en de arm dragen DCR ALS
  GEMODELLEERD (elke spoel exact `roundDcr(dcrOf(L_geschreven))`, geen weg zonder familie, en het rapportblok
  leest dezelfde inventaris — één implementatie); de TEGENPROEF: HUIDIG draagt zijn EIGEN catalogus-DCR (een
  andere gauge, aantoonbaar niet de fit) en het V51b-corpus niets; het opgeschreven `a5e3_spoel_dcr`-blok
  reproduceert per netlist en per spoel; P2: zonder de spoelinstellingen zijn alle poortoordelen byte-identiek
  (de DCR zit in het BESTAND, de instelling beschrijft hem alleen); en geen levende positie ligt onder de
  aandrijfvloer, met het budget uit de herkomst. `BASE` spreidt sinds A5e.3-veld `CASUS1_COIL_DCR_SETTINGS`,
  net als de meetbank, de recorder, de generator en beide live reproducties.
- `src/lib/engine2/corpusPairing.test.ts` — de M-1-claim is HERANKERD op `casus1_m1_herkomst.json` (corpus-id
  `m1`, `DATED_HERKOMST` in `casus1Corpora.fixture.ts`: een corpus van uitkomsten zonder bestanden, want een
  regeneratie die niets levert laat niets te bevriezen), en de A5e.3-veld-claim ernaast: V51b → levend heeft
  op LABEL geen enkel paar en de tabel paart daarom op het dichtstbijzijnde kruispunt, met naam.
- `src/lib/engine2/casus1V2Candidates.test.ts` — **de V34-assert in de `[bytes]`-reproductie is bij A5e.3-veld van
  vorm veranderd zonder van claim te veranderen:** "de probe landt ONDER het ketenraster" bewees op het 200 Hz-raster
  dat de probe het veiligheidsraster las; sinds M-1 begint het raster op 20,5 Hz en is f_p een binnenpunt, dus de
  assert zegt nu dat de probe binnen één veiligheidsrasterstap van f_p landt (en bóven de rasterbodem). Zij ging stil
  stuk bij M-1 en viel pas bij A5e.3-veld om, want een `[bytes]`-claim op een LEEG corpus keert in 24 ms terug —
  **een claim die niet draait kan niet verouderen, en dat is geen geruststelling.** Verder noemt de meetopstelling
  het ELFDE besluit (`spoel_dcr_model`,
  `spoel_dcr_gesteld`, `spoel_dcr_families`, `spoel_dcr_herkomst`): de sleutel `coilDcrModel` is verklaard én
  het blok zegt dat de families GESTELD waren en niet voorgesteld — een run op het voorstel zou hetzelfde
  model dragen en een andere bewering doen.
- `scripts/record-casus1-v2-references.ts` — `DATED_KAND` is `^[A-Z][A-Z0-9]*_KAND_\d+$` (een gedateerd corpus
  hoeft geen `V<n>`-bevriezing te zijn), schrijft het klasse-B-blok van een gedateerde netlist die nooit
  geleefd heeft op hetzelfde pad als het levende corpus (`classBBlock`, één bouwer, twee aanroepers), en het
  afgeleide blok `a5e3_spoel_dcr` (per netlist en per spoel: gedragen DCR, fit, bereik, "als gemodelleerd").
  **`v33_barriere_raster` draagt sinds A5e.3-veld per rij de FREQUENTIE van het sweep-minimum en of die binnen
  de uitgestrektheid van het barrièreraster ligt, plus de lijst `minimum_buiten_barriere_uitgestrektheid`** —
  zie de V33-guard hieronder.
- `src/lib/engine2/frozenNetlistGates.test.ts` — **de V33-guard maakt sinds A5e.3-veld onderscheid tussen
  RESOLUTIE en UITGESTREKTHEID.** De sweep waarop M-B/|Z| oordeelt begint waar de impedantie gemeten is (10 Hz),
  het veiligheidsraster van de barrière waar de RESPONSEN geldig zijn (20,5 Hz op de gemergede set); een
  systeemminimum daartussen is geen grovere lezing maar een blinde vlek. Gemeten: KAND_V2_2 (229,1 · 1727)
  heeft zijn minimum op 10,07 Hz in de woofertak — `L5+R7`, een shunt L+R naar massa, de wees van een gedempte
  val waarvan de audit de C verwijderde — 2,55 Ω op de sweep tegen 2,85 op het veiligheidsraster (0,30 Ω tegen
  een speling van 0,052), en de poort liet hem door binnen de tolerantie (2,5499 ≥ 2,548). De gap-claim gaat
  sindsdien over de netlists waarvan het sweep-minimum BINNEN de barrière-uitgestrektheid ligt; de andere
  moeten bij naam in het opgeschreven blok staan (de V30-vorm: boekhouding die leeg hoort te raken), de sweep
  moet er de strengere lezer zijn, en beide rasters moeten hetzelfde OORDEEL vellen. De uitgestrektheid van de
  barrière en de wezen van de audit zijn open punten van A5e.3-veld. **De V38-fix-rangclaim** ("het slechtst
  beoordeelde ontwerp landt op de zoekmaat in de betere helft") is GEANKERD op de gedateerde verzameling: een
  rangorde is een corpusgrootte, en acht levende netlists plus de arm schoven `V37_KAND_10` van 75 naar 77 op 159
  zonder dat de zoekmaat bewoog (de V47/V48-les).
- `scripts/generate-casus1-v2-candidates.ts` — **`V2_MERGE=1` voegt BESTAANDE shards samen zonder te draaien.**
  Voor de reparatie van ÉÉN kandidaat: A5e.4 zegt dat een kind op dezelfde machine en runtime byte-identiek
  reproduceert, dus na een engine-wijziging die aantoonbaar één kandidaat raakt (de worker-reparatie hierboven:
  de zeven andere geleverde droegen `binnen_eis: true`, de twaalf geweigerde waren al geweigerd vóór (a) leest)
  draait alleen díé opnieuw (`V2_ONLY=9`, 2566 s) en zijn de negentien andere shards wat een herhaling zou
  opleveren. Elke shard moet er zijn; wie élke kandidaat opnieuw wil zien draait zonder de vlag.

### P-1-guards (een prozaregel met "=" in een merge-header is geen vensterregel; v1-bugfix)
- `src/lib/xoWindow.ts` — **de v1-vensterlezer herkent sinds P-1 alleen ECHTE ARTA-vensterregels; het
  gestructureerde merge-blok wordt eruit gefilterd vóór de parse ÉN vóór de claim-detector**
  (`MERGE_FIELD_LINE`, `withoutMergeBlock`, het gedeelde `HEADER_SCAN_CHARS` waar drie lezers elk hun eigen
  `slice(0, 4000)` hadden). **De bevinding komt uit E-3b en is in de draaiende app gereproduceerd, op HEAD, vóór
  er iets veranderd was:** `readGateHeader` matchte het kale woord "gate" in `* Merge floor reason = … FF gate
  floor 396.7 Hz` (de woofers: "the far-field gate (1/T = 396.7 Hz) applies only above the splice"), vond geen
  "ms" op die regel en antwoordde `unparseable` — dus `verified: false`, dus `refuseIfUnverified` en de knop gaf
  **"Cannot optimise yet — low: the window in "Koan_W_up_merged_ingespeeld_mild.frd" could not be read"**.
  **ALLE DRIE Sanders gemergede bestanden, niet alleen de mid** (E-3b noemde de mid; de twee woofers dragen
  dezelfde regel). `parseArtaHeader` in engine2, dat op VELDNAAM matcht, las dezelfde bestanden zonder klacht.
  **Het is de UI-1-les in spiegelbeeld:** daar las de engine veldnamen en de v1-parser proza — en proza liet een
  willekeurige commentaarregel een geldigheidsvloer zetten; hier loopt diezelfde proza-heuristiek stuk op een blok
  dát juist geen proza is. Het antwoord is beide keren hetzelfde: matcht op de NAAM.
- **De regel die er het meest toe doet is niet de regel die de melding gaf.** Het blok citeert het venster van de
  VER-VELDHELFT waaruit de merge gemaakt is — `* Merge FF window = reference 2.5 ms, right 5.021 ms, Tukey 0.25`,
  dus 455 Hz. Gelezen als het venster van dít bestand zet dat de merge terug op de poort waar hij omheen gebouwd
  is, en het zou volkomen plausibel lezen: het juiste getal, van de juiste meting, op het verkeerde bestand — de
  A3h-val ("een plausibel fout getal is gevaarlijker dan een absurd"). De huidige spelling matcht toevallig niet,
  dus de test pint het ook in ARTA's eigen spelling: het is het FILTER dat het tegenhoudt en niet het toeval.
- `src/lib/xoWindow.ts` + `src/lib/sourceMeta.ts` — **de geldigheid komt dan, net als op v2, uit het blok.**
  Alleen filteren repareert de MELDING en niet het SYMPTOOM: `absent` is óók `verified: false` ("states no
  measurement window"), dus Optimize bleef geblokkeerd — gemeten, niet aangenomen. Daarom `readMergeBlock`
  (veldnaam-gebaseerd, `Merge = …` verplicht) en `declaredMergeValidity`: de vloer is de gestelde `Valid from`,
  door de eigen uitgestrektheid van de data alleen omhoog te brengen, `Valid to` vernauwt en verruimt nooit, en
  een merge ZONDER gestelde vloer is UNKNOWN en blijft onverifieerd — "gemerged, dus wel goed" is precies de
  aanname waar niets achter zit. **Waarom een GESTELDE vloer hier wél het antwoord mag zijn terwijl A3h een hele
  ronde besteedde aan "een getypt getal mag nooit voor de eigenschap van een bestand invallen": er valt niets in.
  Een merge HEEFT geen eigen poort** — 2/T beschrijft de ver-veldhelft — dus er wordt geen gemeten getal
  verdrongen; het bestand is de autoriteit over zijn eigen constructie. Dezelfde regel die engine2 sinds M-1
  toepast, waar de herkomst van die vloer niet voor niets `merge-block` heet.
- **`Valid from` alleen is GEEN merge** (`readMergeBlock` eist `Merge = …`): een gepoorte export die toevallig
  zo'n regel draagt kan langs deze deur niet onder zijn eigen poortvloer stappen. A5b.1(i) houdt zijn voordeur.
- `src/App.tsx` — twee lezers, en allebei moesten het weten. (1) `sourceMeta` beantwoordt een verklaarde merge
  vóórdat de gepoorte tak eraan toekomt. (2) `dataFloorOf` óók — anders klapt regel 1 op precies deze bestanden
  stil naar `null` en clampt niet meer, de PERMISSIEVE richting, wat dit hele bestand nu juist wil voorkomen. De
  kruispuntvloer wordt daar de door het blok gestelde SPLICE-BAND (`Merge splice band = 500-800 Hz` → 800 Hz), de
  tegenhanger van `splice × 2^(blend/2)` op de eigen merge van de app — **en met opzet NIET de geldigheidsvloer**:
  op 20,5 Hz zou dat een overname drie octaven binnen de blend toestaan. Waar mag geloofd worden en waar mag een
  kruispunt zitten zijn twee vragen, zoals de tak erboven al zei. Een blok zonder splice-band zegt dat in de
  readout in plaats van een getal te verzinnen.
- `src/lib/xoWindow.test.ts` — **tien claims, op de ECHTE bestanden en niet op kopieën ervan.** Het blok erboven
  gebruikt met reden inline strings ("regex work against invented examples is how this was introduced"); dit niet,
  want de bevinding IS dat déze drie bestanden niet te optimaliseren waren, en een inline kopie kan naar de code
  toe gecorrigeerd worden zonder dat de bestanden bewegen. De vijf gepoorte bestanden staan er als
  onveranderlijkheid naast (5,021 ms / Tukey 0,25) plus de drie nabij-velden (1000 ms). **De tegenproef draagt
  het blok:** dezelfde zin als gewone commentaarregel leest nog steeds `unparseable` — zonder die claim is de
  eerste ook waar voor een detector die uitgezet is. **Twee lezers van ÉÉN conventie:** v1 en engine2 worden op de
  echte bestanden tegen elkaar gepind (soort, `Valid from`/`Valid to`, splice-band, FF-bron), want de v1-laag mag
  engine2 niet importeren (de dependency-pijl van de toggle-invariant) — de VELDNAMEN zijn gedeeld, de
  implementaties niet, en een testbestand mag beide importeren. Plus de E-3b-vorm: een BRONSCAN op `App.tsx` dat
  de app het ook echt aanroept, in de goede volgorde, en niet achter `engineV2Enabled`. **Nagemeten dat elk van
  die guards kán falen** (filter uitgezet: drie rood, en de ARTA-spelling van de FF-vensterregel parseert dan
  inderdaad als 5,021 ms; app-koppeling weggehaald: de bronscan rood).
- **DE TOGGLE-INVARIANT IS NIET GERAAKT, en dat is gemeten en niet beredeneerd.** `toggleRegression` is groen,
  inclusief de byte-identieke referentierun: die run leest helemaal geen header (hij gaat rechtstreeks van
  `parseFrd` naar `optimizeNetworkValues` op de koan-3way-fixtures), dus **er is geen nieuwe baseline om
  gedateerd vast te leggen** — de baseline bewoog niet. Ook `f4cRegression` en `workerRouteRegression` (de twee
  byte-baselines) reproduceren. Wat er wél verandert verandert in BEIDE motorstanden gelijk: dit is een
  v1-bugfix, geen v2-lek, en het gedrag beweegt uitsluitend waar een bestand een merge-blok DRAAGT.
- **BROWSERCONTROLE, en zij is de reden dat dit als af geldt.** Headless via de Browser-pane op de dev-server,
  casus 1's bestanden door de echte invoervelden geladen (gepoorte tweeter + gemergede mid + gemergede woofer,
  elk met impedantie). **Op HEAD:** twee `src-unverified`-badges met de "Merge floor reason"-regel woordelijk in
  hun title, en de knop weigert met "Cannot optimise yet — …". **Met de fix:** geen enkele badge, en de optimizer
  LOOPT ("W-M sweep — round 1 of 2–3"). De evaluatieband leest sindsdien *"evaluated on 455–20000 Hz (bottom set
  by high (gated far field), top by low (near-field merged))"* — de ondergrens komt van de tweeter, die echt
  gepoort is, en niet meer van een merge waarvan de vloer onbekend heette.
- **EEN v1-BEVINDING DIE HIERMEE NIET WEG IS.** De drie gemergede bestanden komen binnen als
  `dataSource: 'nearfield-merged'` terwijl de app zelf niets gesplitst heeft. Dat is het bestaande vocabulaire en
  het klopt (het IS een NF/FF-merge), maar het onderscheid "door deze app gesplitst" versus "elders gemerged en
  het zegt het zelf" leeft nu alleen in `derivation` en in de reden-zin, niet in het type. Benoemd, niet
  gerepareerd: een nieuwe `DataSource` raakt `DATA_SOURCE_LABEL`, `describeSources` en het projectbestand, en dat
  is geen bugfix meer.

### U-1-guards (v1 verdwijnt uit de UI; de vlag blijft, programmatisch; alleen UI)
- **`engineV2Enabled` STAAT SINDS U-1 AAN EN IS NIET MEER BEDIENBAAR VANUIT DE INTERFACE**
  (`App.tsx:1974` `useState(true)`, `App.tsx:7507` `applyProject` opent élk bestand op v2). De
  checkbox onder "Engine" is WEG — niet `disabled`, want een uitgezet vinkje leest nog steeds als
  een keuze — en er staat een zin voor in de plaats die zegt welke motor draait. **Geen v1-code
  verwijderd:** de v1-guided-wandeling (`!engineV2Enabled`), `guidedStages`, `runChain3Scan` en
  `runChainScan` staan er nog en zijn onbereikbaar omdat hun guard nooit meer waar wordt. De
  volledige inventaris — élke plek waar de UI v1 toonde, met regelnummers vóór en ná en met
  weg/blijft-intern/blijft-als-referentie per rij — staat in casusboek U-1.
- **DE VLAG BESTAAT NOG, EN DAT IS DE ACCEPTATIE ZELF.** `toggleRegression.test.ts` bewijst de
  invariant door `false` te KIEZEN: een referentie-optimalisatierun byte-voor-byte met en zonder de
  v2-modules in de graaf, plus de importscan. Een vlag die niemand vanaf het scherm kan omzetten is
  niet hetzelfde als een vlag die niet meer bestaat, en het verschil is wat die byte-identieke run
  een uitspraak over DEZE app houdt in plaats van over een verwijderde tak. `selectEngine` en
  `ENGINE_V1_ONLY` (`engine2/facade.ts`) zijn ONAANGERAAKT; `setEngineV2Enabled` heeft precies één
  aanroeper.
- **WAT ALS REFERENTIE BLIJFT, met naam:** de v1-RANGLIJST naast de shortlist ("v1 reading — not
  the route that made this run", `App.tsx:19753`), de per-rij v1-noot ("v1 note (not applied on
  this route)", `App.tsx:19873`) en de lege-shortlist-zin ("the v1 ranking below has no knowledge
  of your gates", `App.tsx:19620`). Vergelijkingen, geen routes; alle drie zeggen zelf dat zij
  niets beslissen — de zinnen die UI-1 schreef toen de bovenste rij wél geladen werd. De vijf
  v1-knoppen blijven óók staan, mét hun I-1-badge (`App.tsx:17576, 17715, 17731, 17897, 18540`,
  plus `designLevelNote` op 18871): zij zijn niet dood, want `bomCapEur` ordent die leestabel nog.
- `src/lib/v1Carryover.ts` + `v1Carryover.test.ts` (16 claims, nieuw) — **wat een oud project
  draagt dat de v2-route niet leest, als zuivere functie, en er gebeurt niets mee.** Twee helften,
  allebei FEITEN OVER HET BESTAND: het bestand zegt dat het op v1 bewaard is (`engineV2Enabled`
  afwezig of `false` — afwezig en false zijn hier één ding, precies zoals `selectEngine` ze leest),
  of een v1-knop staat op iets anders dan de startwaarde van de app. **Niets gemigreerd, niets
  omgezet, niets gewist:** de velden worden hersteld zoals zij geschreven zijn en zo weer
  opgeslagen, en de melding staat één keer op het paneel waar het bestand geopend is
  (`App.tsx:16209`). **Drie van de vijf v1-knoppen zitten in het projectbestand, twee niet**
  (`errorSmoothOct`, `scan3Mode` en `bomCapEur` leven in `localStorage`), en de test noemt dat gat
  als claim zodat een latere sessie die er één verhuist hier langskomt.
  **`V1_FIELD_DEFAULTS` is één huis met drie lezers** — drie `useState`-initialisatoren en drie
  `??`-terugvallen in `App.tsx` — want een vierde kopie is hoe "onveranderd" en "gedragen" het
  oneens raken over hetzelfde project. De LABELS komen uit het register (I-1) en worden nergens
  overgetypt; de twee sleutels die één registerrij delen krijgen een DISCRIMINATOR ("high
  crossing" / "low crossing") en geen tweede label.
  **De UI-helft is een BRONSCAN op `App.tsx`** (het UI-1-idioom: een functietest kan niet zeggen of
  de app een control RENDERT), en de twee claims trekken met opzet tegen elkaar in — geen route
  door de zichtbare UI bereikt v1, én de v1-motor is er nog en is nog bereikbaar in code. Bewijs
  alleen de eerste en een latere sessie gooit de tak weg waartegen `toggleRegression` vergelijkt;
  bewijs alleen de tweede en het vinkje kruipt terug. Elke scan is tegen een opzettelijke breuk
  gemeten vóórdat hij opgeschreven is (vinkje terug 2 rood, oude laadregel terug 2 rood, literale
  default terug 1 rood, guarded v1-tak eruit 1 rood).
- `src/lib/v2InputRegister.test.ts` — twee I-1-claims van vorm veranderd zonder van claim te
  veranderen. De koppen-in-volgorde-claim telt er DRIE in plaats van vier (de vierde was de kop van
  de v1-lade, en een kop die "v1" aanbiedt IS een route); de lade-claim is omgekeerd — de lade is
  weg én élke v1-knop draagt nog zijn badge. Beide helften moeten er staan: de lade laten vallen
  zonder de badges verliest het antwoord op "waarom doet deze knop niets", en allebei houden zet de
  kop terug die dit bestand net gestopt is te verwachten.
- **ONGEWIJZIGD EN GROEN, en dát is de acceptatie die telt:** `toggleRegression`, `p6Lint` (beide
  scopes), `ciLayer`, `v2Guided`, `v2Settings`, `selection`, `browserSafe`, `noAppWideFloor`.
- **HANDMATIGE CONTROLE (headless Chrome op de dev-server, 09-09-2026).** Verse localStorage:
  guided opent met ZES stappen inclusief "What it must meet". Expert → Filters → ⚙ Settings: nul
  engine-checkboxen, nul `details.v2-legacy`, nul koppen die met "v1 " beginnen, drie
  `Engine v2 — n.`-koppen, en zes v1-badges nog op hun knoppen. Een project met
  `engineV2Enabled: false`, `hpLpPrefLow: 'LR4'` en `excursionSpl: '90'` opent met de melding die
  beide velden bij naam noemt; "Got it" laat hem verdwijnen, een tabwissel brengt hem niet terug,
  en de twee waarden staan daarna nog ONGEWIJZIGD in het formulier. De demobundel-verkenning loopt
  door de v2-route en is uitgedraaid: zes kandidaten (2 × 3, het E-2-veld), 902 s, ZES VAN ZES
  gekwalificeerd, met de veldregel "Exploration field — 6 of 15 derived candidates" onder de
  shortlist.

### U-3-guards (een demo mag zijn eigen route niet blokkeren; alleen demobundel/laadpad)
- `src/lib/demoBundle.ts` + `demoBundle.test.ts` (21 claims, nieuw) — **een demobundel is DATA, in één
  vorm, en `demoBundleState` is wat beide laders toewijzen.** De driewegdemo was al een datamodule; de
  tweeweg was twaalf `?raw`-imports en veertig regels `setState` in `App.tsx`, en wat een test niet kon
  lezen was tweemaal weggedreven. (1) **Zijn twaalf bestanden droegen geen enkele header**, dus
  `readGateHeader` antwoordde `absent` en `refuseIfUnverified` weigerde de run — een demo die zijn eigen
  route blokkeert, met de eigen eerlijke melding van de app. (2) Hij stelde geen enkele eis die de
  v2-route sinds E-3 leest, en de driewegdemo evenmin: samen 9 en 11 van de 36 draagbare registerrijen
  en NUL van de vijftien oordeelsrijen.
- **GUARD 1 — élk meetbestand van élke bundel stelt een geldigheid die de app kan lezen.** De test
  reproduceert de ECHTE beslissingsboom van `sourceMeta` (mergeblok eerst — P-1 —, ARTA-venster tweede —
  A3h) en niet een lossere of strengere. Met de TEGENPROEF ernaast: de twaalf prototype-exports staan nog
  in de repo als parser-fixtures en falen hem alle twaalf; zonder die claim is "alles groen" niet te
  onderscheiden van een controle die niet kan vuren. Plus: de DRIE lezers van één conventie moeten het per
  bestand eens zijn — v1, engine2, en de drie regels die `demoBundle.ts` zelf draagt omdat bundelcode
  `engine2/` niet mag importeren (de dependency-pijl van de toggle-invariant; dezelfde vorm als P-1).
- **GUARD 2 — wat de bundel draagt landt, wat hij niet draagt toont LEEG en niet afwezig.** De toestand die
  `demoBundleState` teruggeeft is VOLLEDIG: elke rol, elke `V2_SETTING_KEYS`-sleutel, elk
  `V2_MEASUREMENT_KEYS`-veld, met `''` of `null` waar de bundel zwijgt. Dat is de helft die telt: een
  ONTBREKENDE sleutel is een sleutel die niemand wist, en precies zo hield de oude tweeweglader de nabije
  velden, de losse impedanties, de verificatielijst en de bestandsnotities van de vorige demo vast (vijf
  setters die hij nooit aanriep — `setNearField`, `setZStandalone`, `setVerifyList`, `setVerifyIx`,
  `setFileNotes`). De tien rijen die de tweewegbundel NIET draagt staan **bij naam en niet als telling** —
  de V47/V48-les, preventief.
- **De getallen van de bundel zijn die van het casusboek, gelezen en niet overgetypt.** De guard opent
  `golden_refs_casus1b.json` en vergelijkt élke eis, élk driverkaartveld en élk geometriegetal ermee, dus
  een eis die dáár beweegt faalt hier in plaats van de demo stil een versie achter te laten (de V33-les).
- **Een BRONSCAN op `App.tsx`** (het UI-1-idioom: een functietest kan niet zeggen of de app haar AANROEPT,
  en dat is precies wat hier misging) pint dat beide laders door `applyDemoBundle` gaan, dat die de vijf
  overgeslagen setters bevat, dat de versterkervloer alleen geschreven wordt als de kijker er geen heeft
  (een voorkeur, geen projectdata), en dat het woord `mettape` nergens meer in `App.tsx` voorkomt.
- **Nagemeten dat zij kunnen falen**: de gemergde mid vervangen door een headerloos bestand → 4 rood;
  `setNearField` uit de applier → 1 rood; `resistorClassW` uit de bundel → 2 rood.
- `src/lib/v2Settings.ts` — **`V2StatedBy`: WIE een veld stelde, als het niet de kijker was.** Een demo stelt
  sinds U-3 zeven eisen over een echte luidspreker, en het paneel schreef élke gestelde waarde toe met
  "stated by you". Additief op de draad (een project zonder blok leest precies als vroeger), en de EERSTE
  bewerking van een veld wist de naam — dan is het getal wél van de kijker. **De twee bestaande E-2-bronscans
  gingen hierop rood** (zij pinnen de vorm van `statedMark` en `restoreV2Settings`, die er een argument bij
  kregen) en zijn bijgewerkt zonder van claim te veranderen.
- `src/lib/v2Measurement.ts` — het A5a-meetblok heeft sinds U-3 een eigen huis buiten `App.tsx`, omdat de
  guard de HELE vorm moet kennen: welke velden een bundel zwijgt is de helft van wat hij beweert.
- **Wat de herbouw KOST, en dat wordt niet weggepoetst:** de directiviteitsset 0–75°, het VituixCAD-project
  en de montagediepte van 17,3 mm. Casus 1b mat de mid op 0° en 30° en de tweeter alleen op de as; hoeken
  bijmaken om de oude vorm te halen zou metingen verzinnen. `acousticCentre` is de enige registerrij die de
  bundel verloor.
- **DE VOLLE RUN IS BIJ U-3 NIET GEDRAAID**, met de I-1/I-3/B-1-afweging: geen engine-, poort-, budget-,
  venster- of corpuswijziging, en de twee byte-baselines die dát bewaken (`f4cRegression`,
  `workerRouteRegression`) draaien in de snelle laag en reproduceerden. De drie live ketenruns zouden een
  corpus reproduceren dat deze sessie niet aangeraakt heeft. **Wat er WEL nagemeten is:**
  `replay-app-run.ts --set demo` op `casus1_e2_verkenning_run.json` zegt nog steeds SAME op BEIDE lagen, dus
  de driewegbundel leidt tot op het laatste cijfer hetzelfde veld af als vóór U-3.

### I-1-guards (elke invoer gelabeld; het paneel geordend op die labels; alleen UI/ordening)
- `src/lib/v2InputRegister.ts` — **het REGISTER: élke invoer die de v2-route kan bereiken, gefiled onder EXACT
  vier labels** (NOODZAKELIJK / OORDEEL-WAPENEND / NICE TO HAVE / V1-ERFGOED), met per rij waar hij staat, hoe hij
  reist (state → payload → lezer), wat leeg betekent en waar de ontwerper het getal vandaan haalt. Data en geen
  documentatie, in de vorm die `choices.ts` één laag lager al draagt: het paneel leest er zijn koppen, zijn
  leeg-hulptekst en zijn v1-lade uit, de test leest er zijn claims uit, en een sleutel die aan het formulier
  wordt toegevoegd zonder rij breekt de build. Geen engine-import (de toggle-regressiescan laat alleen de
  UI-instappunten in `engine2/`). **De inventaris is tegen de CODE gecontroleerd** — `worker.ts` en
  `scanRequest.ts` zijn de autoriteit over wat de grens oversteekt, nooit een commentaar.
- **VIJF v1-KNOPPEN DIE DE v2-ROUTE NIET LEEST, en vier ervan waren ongemarkeerd** (E-2 markeerde alleen
  "Design for … dB", V49). (1) **Error smoothing** — de kandidaat verklaart `errorSmoothOct` ONVOORWAARDELIJK
  als `SEARCH_SMOOTHING_OCTAVES` (0) en `withDeclaredSearchSmoothing` schrijft die waarde op de tweewegroute
  óók terug in de ketensettings, dus de select bereikt geen enkele lezer (V38-fix). Dat is de ergste van de
  vier: **V38-fix MAT die sleutel op tot 2,45 dB geleverde rimpel** — daarom verhuisde hij van POLISH naar
  CHOICE — en de app wist het al op één plek (`v2Smoothing`, de F3c-gladdingsregel, leest sinds V38-fix
  `SEARCH_SMOOTHING_OCTAVES` zodra v2 gekozen is), twaalfduizend regels van het veld vandaan. (2) **HP/LP
  preference** (laag én hoog) — `chainInputFor` overschrijft `structureLow/High` met de uitlijning die A5d.3
  afleidde, dus de `??`-terugval vuurt nooit zolang er een kandidaat is (F4d). (3) **Scan strategy** —
  overgeslagen mét een notitie, maar die notitie staat in de RUN, ná de klik. (4) **BOM cap per channel** —
  bereikt uitsluitend `rankChain3Results` en dus de v1-scantabel; geen v2-poort, -budget, -eis of shortlist
  leest ooit een prijs. **Alle vier gelden zolang er een A5d.3-veld gegenereerd wordt**; in de terugval waar
  geen venster afgeleid kan worden reist er geen verklaring mee en leest de run ze alsnog — die terugval
  schreeuwt zichzelf al uit in de run-notities.
- **TWEE BESTAANDE CLASSIFICATIES ZIJN HET NIET EENS, en dat is BENOEMD in plaats van gladgestreken.** E-2's
  `V2_JUDGEMENT_KEYS` is de GHOST-regel (welk veld geen getal mag tonen dat het niet draagt); dit registers
  klasse `judgement` is de WAPEN-regel (welk veld iets scherpstelt). Twee sleutels staan op E-2's lijst als
  rapportageschaal en één daarvan wapent tóch: `amplifierPowerW` is sinds V51 het vermogen waarbij M-A/part
  OORDEELT zodra er geen thermisch ontwerpvermogen gesteld is (gefiled als OORDEEL-WAPENEND, de strengste
  lezing), `verticalWindowDeg` is een kolom en nooit een poort geweest (V20a, gefiled als NICE).
  `GHOST_KEYS_FILED_AS_NICE` pint dat als BENOEMDE VERZAMELING en niet als telling — de V47/V48-les,
  preventief: een complement groeit mee met het formulier. `JUDGEMENT_KEYS_WHERE_BLANK_DEFERS` doet hetzelfde
  voor de ENE oordeelssleutel waar leeg niet ontwapent maar DELEGEERT (`resistorThermalPowerW`: M-A/part
  oordeelt dan bij het continue vermogen, V50, en de poortregel zegt bij welk vermogen hij las).
- `src/lib/v2InputRegister.test.ts` (18 claims) — twee helften. De DATA-helft: élke formuliersleutel heeft een
  rij, élke rij één van vier labels, ids uniek, élke oordeelsrij NEGEERT iets en belooft nergens een default
  (met de tegenproef dat de run-instellingen, géén oordeelsrijen, juist wél een gepubliceerde standaard noemen),
  élke v1-rij draagt haar notitie en géén andere klasse doet dat, en de notitie is null op v1. De PANEEL-helft
  is een BRONSCAN (het `v2Settings`/`selection`-idioom, en de UI-1-les één laag hoger): de vier koppen in de
  volgorde van het register, de vijf oude koppen weg, de v1-lade een `<details>` ZONDER `open` binnen
  `{engineV2Enabled && (`, `{v2Empty(key)}` bij élk veld met een rij, `{v1Legacy(id)}` bij élke v1-knop.
  **Nagemeten dat de scans kunnen falen:** één `v2Empty` weg, één `v1Legacy` weg en `open` op de lade geeft
  drie rode claims met naam.
- **In `App.tsx`: `v2Empty(key)` toont de leeg-betekenis ALLEEN terwijl het veld leeg is** — een ingevuld
  paneel zegt niets dat het niet hoeft te zeggen, een leeg veld zegt precies wat zijn leegte kost; het is
  dezelfde zin die het register aan de tests geeft. `v1Legacy(id)` is de generalisatie van `designLevelNote`,
  dat er precies één markeerde; de rij `excursionSpl` LEEST die functie in plaats van haar zin over te typen
  (één huis, twee lezers), zodat `v2Settings.test.ts`' pin blijft staan. **De v1-velden zijn NIET naar de lade
  verplaatst en NIET `disabled`:** verplaatsen zou één veld op twee plaatsen zetten afhankelijk van een vlag
  (de faalvorm die dit project herhaaldelijk betaald heeft), en uitzetten zou onwaar zijn in de terugval waar
  drie van de vier alsnog gelden.
- **`V2_MINIMAL_SET` — de kortste route naar een eerste verkenning:** de zeven NOODZAKELIJK-rijen plus ÉÉN
  gestelde versterkervloer. De verwachte set (metingen + posities + diameters + één vloer) klopt, met één
  toevoeging die de code afdwingt: de MEETVENSTERS — zonder geldigheidsvloer weigert v1 de run ronduit (P-1)
  en berekenen de verankerde gaps niets (UI-1). Wat de verkenning dan wél en niet oordeelt staat in casusboek
  I-1 §3, en de shortlist zegt het zelf (`describeFieldMode` leest de modus van het VELD af, de niet-gestelde
  eisen drukken "— no requirement stated" af, en de poortkolom scheidt `off` / `not judged` / `inside`).
- **DE VOLLE RUN IS BIJ I-1 NIET GEDRAAID**, met de E-2/E-3b-afweging: geen engine-, poort-, budget-, venster-
  of corpuswijziging, en de twee byte-baselines die dát bewaken (`f4cRegression`, `workerRouteRegression`)
  draaien in de snelle laag en reproduceerden. De drie live ketenruns zouden een corpus reproduceren dat deze
  sessie niet aangeraakt heeft.

### I-2-guards (de NF/FF-merge in de app; alleen app-/ingest-laag)
- `src/lib/nfMerge.ts` + `nfMerge.test.ts` (56 claims) — **de merge als BESTAND, en dat is het hele
  verschil met de live splice die er sinds de tweewegdagen naast staat.** `mergeNearFar` is de
  splice; wat het niet doet is zeggen welk bestand het nabije veld is, een band uit de twee
  geldigheidsgrenzen afleiden, het stapmodel een fase geven, zichzelf controleren, of iets opleveren
  dat je kunt bewaren. Woont in `src/lib/` en niet in `engine2/ingest/` om de reden die
  `impedanceFloor.ts` al draagt: een gemergede meting is een meting, moet met de vlag uit werken, en
  niets buiten de UI-instappunten mag `engine2/` importeren. **De VELDNAMEN zijn de gedeelde
  conventie** (P-1's vorm): dit bestand schrijft namen, en de test pint dat `parseArtaHeader`
  (engine2) en `readMergeBlock` (v1) hetzelfde teruglezen — soort, bronnen, band, gain, `Valid from`
  — en dat `declaredMergeValidity` er een vloer uit haalt, wat de tak van `unverified` af haalt.
- **De herkenning is AFGELEID en niet getypt:** ligt 1/T binnen de band die het bestand zelf toont?
  Casus 1's ver velden lezen 397 Hz tegen data vanaf 20,5 (`gated`), de nabije velden 1,01 Hz tegen
  data vanaf 5,13 (`ungated`). Nergens een hertz-drempel. **De app wijst de rollen nooit zelf toe** —
  het slot is het antwoord van de ontwerper en de app controleert het tegen de kop; `ungated` is óók
  een groundplane of een dode kamer, dus zij VRAAGT (`ask: true`) in plaats van te raden.
- **De splice-band leest de vloer van HET BESTAND** (`dataFloorFromGateMs`, 2/T getaperd = 455 Hz op
  casus 1) en niet `cabinetInfo.reliable.fromHz` (1/gate op een kastbreed veld, 199 Hz): de band is
  waar niveau en vertraging GEFIT worden, dus de fijnstructuur telt en het bestand is de autoriteit
  (A3h). Voorstel: woofer 455–576 Hz, mid 455–1107. **Sanders eigen band (500–800) reikt 224 Hz boven
  0,95 × ka = 1 op de woofer** — een ontwerpersoordeel dat gemeld en niet overruled wordt, en de test
  pint dat het voorstel er ONDER ligt, want een voorstel dat er stilzwijgend mee instemde zou nergens
  uit afgeleid zijn.
- **`portWeight` heeft GEEN default en noemt het ontbrekende veld.** Keele weegt met de diameter, en
  diameter en oppervlak zijn één grootheid; `gedeeld door N` is de tweede helft en een poort tussen
  twee woofers draagt de helft van zichzelf bij aan elk. Nagerekend: mond 74 mm tegen conus 180,2 mm
  = g 0,411, gehalveerd 0,205 — Sanders `g=0.41, 50/50`. Een poort zonder weging wordt NIET
  meegesommeerd en de merge zegt dat; een poort die wél gewogen kan worden verplaatst de fit
  (anders is het veld decoratie).
- **`suggestValidFrom` weigert voor een reflexkast waarvan de poort niet gemeten is.** Niet f_b en
  geen veelvoud: op de afstemming staat de conus op zijn MINIMUM en draagt de poort de uitgang, dus
  de conus-alleen-fout is daar het grootst en valt niet af in een richting die een factor kan vangen.
  Gesloten, en reflex mét de poort erin, leveren de reikwijdte van het nabije veld — precies waarom
  Sanders woofers 20,5 Hz verklaren waar hij zonder poort ~80 noteert.
- **De drie controles, en falen KLEURT (F0).** (1) Splice-band ±0,5 dB op p95 — **en álle drie de
  merges in dit project falen hem** (mid 1,37, woofer 1,53 en 2,58 dB; Sanders eigen kop noteert een
  rest van −1,57…+1,77). Dat is de bevinding en geen reden om het getal te verplaatsen; de test pint
  dat hij ook KAN slagen (een bestand met zichzelf gemerged leest nul). (2) De stap tegen die van de
  andere gemergede drivers op hetzelfde front, teruggewonnen als `merged − NF − de gain uit hun blok`
  — waarvoor `readMergeBlock` sinds I-2 ook `Merge splice fit` leest. Twee lezingen die iets
  verschillends zeggen: **1,63 dB tegen Sanders augustus-woofers** (zijn empirische stap draagt de
  poort en de inspeel-predictie) en **0,01 dB tegen de woofer die de app zelf mergede**. NIET VAN
  TOEPASSING is een echt antwoord en het gewone. (3) De sweep byte-identiek vóór en ná — een
  structureel feit dat niemand meet is hoe een stille koppeling binnenkomt (M-1 deed het met
  `git status`).
- **In `App.tsx`, en een BRONSCAN pint elk van deze** (het UI-1-idioom, want wat een functietest niet
  bereikt is of de app haar aanroept): de merge woont bij de meting-upload en niet in het
  Filter-paneel; `runNearFieldMerge` bouwt alléén een preview en raakt geen enkele respons-setter aan;
  de respons verandert uitsluitend in `acceptNearFieldMerge` en `undoNearFieldMerge`; het ver veld
  waarop gemerged is blijft bewaard (`far`), zodat niets overschreven wordt en een HERMERGE datzelfde
  bewaarde bestand leest in plaats van de merge op de merge te stapelen; en de live-splice-memo slaat
  een respons over die zelf een merge verklaart (`if (readMergeBlock(loaded.raw)) continue;`).
  **Nagemeten dat de scans kunnen falen**: de guard weghalen en `ranked`-achtige directe toepassing
  invoeren zetten er elk één op rood.
- **Vier registerrijen in `v2InputRegister.ts`, alle NICE TO HAVE** — zonder merge werkt alles, met
  een smaller venster, en de app zegt dat naast het slot.
- **HET OPEN PUNT, en het is het belangrijkste van I-2: de app heeft nu TWEE merge-paden voor
  dezelfde tak en het oude vuurt nog op het moment van laden.** Gemeten op casus 1 met dezelfde twee
  bestanden en dezelfde kast: mid LIVE gespliced (500 Hz, blend 1 oct) geeft `low → mid` **LEEG**,
  mid GEMERGED (455–1107, geaccepteerd) geeft **124,3–2051,6 Hz · floor: fs**. De live regel is sinds
  I-2 als zodanig gelabeld (`live preview, not a file: …`) en verder niet aangeraakt: hem intrekken
  verandert het gedrag van élk project met een nabij veld en raakt `sourceMeta`, `dataFloorOf` en de
  grafieken — eigen sessie, mét de toggle- en byte-regressies ernaast.

### B-1-guards (welk impedantiemodel een sweep draagt, en wanneer zijn exponent een meting is)
- `src/lib/engine2/ingest/motionalFit.ts` — **de half-machts lekterm `K·(jω)^n` wordt sinds B-1 GETOETST in
  plaats van aangenomen.** Beide modellen worden op élke sweep gefit en beide staan in het resultaat
  (`arms`, `residualRatio`, `modelReason`); de term wordt overal GEHOUDEN, en casus 2 is waarom — haar
  lek-arm levert de model-R_e terug en de kale arm zit er 0,08–0,23 Ω naast tegen een klasse van 0,03 Ω.
  **Er is met opzet GEEN modelkiezer:** hij is gebouwd, gemeten en weer weggehaald omdat de lekterm een
  SPONS is (hij absorbeert wat de takken niet verklaren, en fit op een sweep met één ongeseede mode een
  spoel van 0,10 % van |Z| op 8,95 %, 93× te groot, met een residuverhouding van 1,434 die dat als verdiend
  leest). Termgrootte en residu zijn dus bewijs van ontbrekende structuur en niet van een spoel — een schakelaar met
  één bereikbaar antwoord is erger dan geen schakelaar (V23), en dit is de meting die dat vaststelt.
- **De EXPONENT is alleen een meting als de fitband hem niet verzet.** `coefficientK` en `exponentN` zijn
  `null` — nooit nul (F0) — tenzij de spreiding van `n` over de vergelijkingsbanden binnen dezelfde limiet
  valt die deze fit al voor R_e publiceert (`RE_FIT_MAX_BAND_SENSITIVITY_FRACTION`). Geen nieuwe constante en
  geen extra solve: die refits liepen al voor de bandgevoeligheid van R_e. **De grondwaarheid geeft de toets
  gelijk:** casus 2's twee gesloten wegen bewegen 0,0 % en lezen exact, de vented weg beweegt 8,9 % en leest
  15 % ernaast, casus 1 beweegt 12,6–34,4 % op alle drie de wegen. **Dat is C-2/B2 gerepareerd** — de rij
  staat sindsdien onder `onthoudingen` met het getal er nog in, en met een gedateerde errata-regel eronder.
  `z-re` ging 1.1 → 1.2: de vorm groeide en de exponent kan zich onthouden, maar geen enkel getal bewoog.
- `src/lib/engine2/ingest/motionalModel.test.ts` — 20 claims, en het PAAR draagt het bestand: een schone
  spoelsweep identificeert de exponent en leest 0,7, en dezelfde sweep met ÉÉN mode erbij (2 Ω op een 6 Ω
  R_e, dus onder de 1,6·R_e-classificatiedrempel, dus ongeseed) onthoudt zich. Zonder dat paar zijn "de
  exponent wordt gepubliceerd waar hij klopt" en "de toets vuurt nooit" hetzelfde groen. Verder: de spons
  als meting, de lek-arm als LAGERE R_e op élke sweep van het boek (de lekterm draagt positieve
  weerstand, dus de kale arm is een bovengrens en het verschil is een grootheid), de geneste
  residuverhouding ≥ 1, casus 2's grondwaarheid beide kanten op (de lek-arm exact, de kale arm 8,19 % naast
  Q_ms op de tweeter), A5e.4 op de keuze, en de reproductie van `casus1_b1_modelkeuze.json`.
- `src/lib/engine2/goldenCasus2.test.ts` — VIJF semi-inductantierijen in plaats van zes, met de onthouding,
  het bewaarde getal (`exponent_op_primaire_band` 0,5947) en de errata-regel ernaast; plus een blok dat
  vastlegt dat de lekterm op élke weg gehouden is en waarom (lek-arm binnen de ohm-klasse, kale arm erbuiten).
- `src/lib/engine2/goldenClassification.test.ts` — het nieuwe V15-blok `afgeleide_parameters._re_fit_parameters`
  wordt tegen de engine gehouden (V19: een parameterblok dat niemand toetst is decoratie): model, primaire
  band als multiple van het fundamenteel, de vergelijkingsbanden, en dat casus 1 zich op alle drie de wegen
  onthoudt — wat de reden is dat `semi_inductantie_n` daar die van de HF-fit is en blijft.
- `src/lib/engine2/versionAndCapability.test.ts` — de z-re-versie wordt sindsdien uit de REGISTRY gelezen in
  plaats van uit een met de hand bijgehouden kopie. Die stond bij B-1 op 1.1 terwijl de tabel al 1.2 zei;
  een pin op "de versie die de app nu draagt" hoort die versie niet zelf over te typen.
- **CI VING DE V46-PRECISERING VOOR DE DERDE KEER, en dit is de derde keer dat hij op dezelfde vorm valt:
  een EXACTE float-vergelijking op een AFGELEID getal.** De reproductieclaim van `motionalModel.test.ts`
  legde de verse fit op negen decimalen naast het opgenomen bestand; linux/x64 leest 25,489439719233413
  waar darwin/arm64 onder Node 26 25,48943973418001 opschreef — 1,49e-8 absoluut, **6e-10 relatief**, op
  de bandspreiding van de casus-1-woofer. Lokaal groen, CI rood, precies zoals bij V49. De drift zelf is
  KLEIN (V46 zag op een vast netwerk het vijfde significante cijfer bewegen; deze iteratieve fit blijft tot
  in het negende gelijk), maar negen decimalen op 25,49 vraagt elf significante cijfers en zoveel geeft
  geen LM-fit over twee runtimes. Sindsdien leest de claim de TOLERANTIEKLASSEN van de casus zelf — R_e in
  `ohm`, residu en lekfractie in `fit_kwaliteit_pct`, exponent en spreiding in `exponent_pct` — en het
  model en het exponentoordeel exact, want een string en een boolean driften niet. **Regel: wie een gefit
  getal in een test zet die in CI draait, leest het in zijn klasse en niet op decimalen.**
- **De VOLLE RUN is bij B-1 niet gedraaid**, met de I-1/I-3/E-2-afweging: geen engine-, poort-, budget-,
  venster- of corpuswijziging, model (b) is byte-identiek aan wat er vóór B-1 draaide, en de twee
  byte-baselines die dat bewaken (`f4cRegression`, `workerRouteRegression`) draaien in de snelle laag en
  reproduceerden. Wat wél beweegt is de vingerafdruk (`estimators=` met z-re 1.2);
  `casus1_v2_herkomst.json` is niet herschreven en draagt dus nog de C-2-vingerafdruk, met casusboek B-1 als
  de reden (de V49-precedent).

### U-3d-guards (de polariteit zit in de netlist; niemand mag hem twee keer toepassen; alleen UI)
- **EEN REGRESSIE VAN E-3, OP DE ENE LEZER DIE E-3 NIET AANRAAKTE.** E-3 vouwt de polariteit die de
  ontwerpstap kiest in het `Driver`-onderdeel zodat "everything downstream reads the netlist", en zijn
  eigen notitie zegt dat de adjust van de keten de keten nooit verlaat. Hij verliet hem wél, via één
  regel in `App.tsx`: `applyScanCandidate` zette het vinkje **Invert polarity** uit `r.vf.inverted`
  (en de twee driewegvinkjes uit `r.midInverted` / `r.tweeterInverted`). De solver past
  `Driver.inverted` toe op de takoverdracht (`network.ts:194`) en `combine` telt er via
  `adjustPhaseDeg` nog eens 180° bij — **twee onafhankelijke vermenigvuldigingen met −1 op hetzelfde
  netwerk.** Een geladen kandidaat waarvan de ontwerpstap een weg omkeerde werd gesimuleerd, getekend
  en beoordeeld met 360°: de takken lazen tegenfase waar de tune een paar graden mat, en de som doofde
  uit waar hij hoorde op te tellen. **Gemeten door Sander in de draaiende app (09-09-2026): shortlist
  6,4°, fasegrafiek gemiddeld 173,6° met σ 170° op hetzelfde ontwerp.**
- **Waarom het pas nu opviel, en E-3 voorspelde het letterlijk:** de vouw is op een LR4-veld de
  identiteit, byte voor byte, en het casus-1-veld is LR4-only sinds A5e.3-veld. Casus 1b keert wél om
  (`KAND-V2-1` draagt `inverted: true` op de tweeter) en daar viel het om.
- **De reparatie is dat `applyScanCandidate` de twee vinkjes WIST in plaats van ze te voeden.** Sinds
  U-1 bereikt geen enkele route in de interface de v1-scans, dus élk resultaat dat daar binnenkomt is
  door `handleV2Request` gegaan en is gevouwen; de netlist is de drager, en het vinkje blijft over als
  wat het altijd was — de knop van de ontwerper.
- `src/lib/engine2/optimizer/polarityFold.test.ts` (5 claims) — het bevroren casus-1b-onderdeel draagt
  zijn omkering (de premisse, een feit over een bestand op schijf); de vouw is een XOR, dus tweemaal
  toepassen levert het niet-omgekeerde onderdeel terug; `applyScanCandidate` wist en voedt niet, met
  **de drie verwijderde aanroepen BIJ NAAM** — een test die alleen op `setInverted(false)` let blijft
  groen naast een tweede aanroep die het resultaat voedt, en precies zo kwam dit binnen; de twee
  plaatsen die een polariteit MOGEN toepassen zijn er nog steeds twee. **De scan strippt commentaar
  vóór hij zoekt**, want de notitie die deze fix achterlaat citeert de drie verwijderde aanroepen —
  dezelfde discipline als `noWeights.test.ts`, de claim gaat over CODE.
- **NIET OVER-GEREPAREERD, en dat staat als eigen claim.** Vier andere plekken voeden een polariteit in
  de app-state en alle vier zijn goed omdat hun resultaat NIET gevouwen is: de twee v1-scans
  (`runChainScan`, en de geen-shortlist-tak van de driewegrun), de virtuele-filteroptimizer (daar
  bestaan geen onderdelen) en de vxp-import (die leest de polariteit van het bestand). De eerste twee
  zijn sinds U-1 onbereikbaar en zijn met rust gelaten in plaats van verwijderd — de U-1-regel.
- **Nagemeten dat de guard kan falen:** het vinkje weer uit het resultaat voeden zet de bronscan op
  rood, en de vouw uit de tweewegroute halen zet casus 1b's live byte-reproductie op rood (236 s) —
  wat meteen bevestigt dat de vouw dragend is voor het bevroren bestand.

### U-3c-guards (de datasheetgetallen horen in het standaardbeeld; alleen UI)
- **AANLEIDING, EN ZIJ IS EEN MEETRESULTAAT.** Direct na U-3b liep Sander een tweeweg op de demobundel
  en zag de kandidaten beginnen bij 1372 Hz waar casus 1b's veld op 1735 begint. De rekensom sluit
  exact: zonder gestelde tweetereis kan de aandrijfvloer van A5d.3(ii) niet wapenen en valt de
  vensterbodem terug op k·f_s (1647 → 1294 Hz). De twee laagste posities geven 13,7 en 17,7 dB op de
  tweeterresonantie tegen de 20 die de conventie vraagt — **en niets wijst ze af, want niemand stelde
  de grens.** P4 zoals hij hoort te werken, en tegelijk een bescherming die de demo kwijt was.
- **`S_d`, `X_max`, `Bl` en `M_ms` staan sinds U-3c in ÉÉN rij "Datasheet" in het standaardbeeld van
  de driverkaart.** U-3b had de laatste drie achter de uitklap gezet op grond van hun klasse (`nice`);
  dat was formeel juist en praktisch verkeerd. Sanders regel: *"doorgaans moeten we van generieke data
  uit kunnen gaan"* — een getal dat de ontwerper van een spec sheet overtypt is data die ÉLK project
  heeft, anders dan een metersaflezing, een schakelkeuze of een spoelfamilie, dus het achter een vouw
  zetten is de ene plaatsing die een nieuwkomer werkelijk iets kost. Zij lezen als één rij omdat een
  spec sheet één rij is; de rest van het A5a-blok blijft achter de vouw.
- **HET IS EEN REGEL GEWORDEN EN GEEN DRIE UITZONDERINGEN.** `v2InputPlacement.test.ts` assert dat
  élke rij met `source: 'datasheet'` in een BESTUURD formulier `placement: 'always'` heeft, dat de
  vier die één driver beschrijven op de driverkaart staan, en dat zij in dezelfde rij gerenderd
  worden. `nominalSize` is de ENIGE datasheetrij in een ongereguleerd formulier (de v1-terugval voor
  een ontbrekende S_d) en staat bij naam in de claim — een datasheetrij die later in een ongereguleerd
  formulier verschijnt laat die regel falen, en dat is het moment waarop iemand moet kijken.
  Nagemeten dat hij kan falen: een datasheetrij terug achter de vouw geeft drie rode claims, een
  datasheetveld uit de rij tillen vier.
- **WAT DIT NIET REPAREERT, EN DAT IS DE EIGENLIJKE BEVINDING.** Op deze tweeter verplaatst het
  invullen van alle zes de excursie-invoeren het venster geen hertz: het afgeleide plafond (−8,58 dB)
  levert vloer 1185 Hz, ónder de k·f_s-vloer van 1294. Een dome met X_max 1 mm en f_s 924 Hz komt
  excursiematig nauwelijks in de problemen, terwijl de −20 dB-conventie een thermische en
  vervormingsregel is. **Er BESTAAT een generiek datasheetgetal dat dit wel zegt — de aanbevolen
  minimale kruisfrequentie mét haar orde — en de app leest hem nergens.** Omgerekend
  (`dB = 6·orde·log2(F/f_s)`) is "2000 Hz @ 18 dB/oct" exact 20,0 dB: **de −20 dB-conventie ÍS een
  datasheet-aanbeveling, alleen in een andere eenheid.** De vorm van de reparatie is de spiegel van
  E-1's gestelde plafond: een `statedFloorHz` per paar, herkomst `datasheet`, naast de bestaande
  `'stated'`-regel die alleen een BOVENgrens kent. Dat is een engine-wijziging (nieuwe vensterregel =
  ander kandidaatveld = regeneratiebesluit) en hoort in een eigen sessie.

### U-3b-guards (de demo's kaal, en de invoer-UI achter de I-1-plaatsingsregel; alleen bundel/UI)
- **BEIDE DEMOBUNDELS DRAGEN SINDS U-3b ALLEEN METINGEN EN GEOMETRIE**, en de regel staat als DATA:
  `BUNDLE_CARRIED_ROWS` in `demoBundle.ts`, elf rijen — de zeven NOODZAKELIJKE plus vier die zelf een
  meetbestand of het blok van een gemerged bestand zijn (`nearFieldCone`, `nearFieldPort`, `spliceBand`,
  `mergeValidFrom`). Waar `BUNDLE_BEARABLE_ROWS` zegt wat de VORM kan houden, zegt deze wat een demo MAG
  houden, en de guard leest beide: de gedragen verzameling van elke bundel moet een deelverzameling zijn,
  élke NOODZAKELIJKE rij moet erin zitten, GEEN enkele oordeelsrij mag erop staan, en de exacte
  verzameling per bundel staat BIJ NAAM (tweeweg 10, drieweg 9 van de 36). De tweeweg droeg tot U-3b
  casus 1b's hele eisenblad — tien van de vijftien oordeelsrijen — dus **wie hem laadde had acht poorten
  scherp met de getallen van iemand anders, en het paneel rapporteerde oordelen die de kijker nooit
  geveld had**: P4 stuk op het scherm in plaats van in de engine, dezelfde fout die E-2 uit de
  placeholders haalde.
- `src/lib/demoBundle.test.ts` — **guard 2 is verbreed van blok-voor-blok naar de HELE projectstaat.**
  `stateFields(s)` somt élke scalar van `DemoBundleState` plat op, en de twee dragende claims gaan over
  al die velden en niet over een met de hand geschreven lijst: (1) LOSSLESS — wat de bundel stelt komt
  verbatim in de staat, afgelezen van de BUNDEL zodat een veld dat aan een bundel wordt toegevoegd en in
  `demoBundleState` vergeten wordt hier faalt; (2) NIETS VERZONNEN — élk gevuld staatsveld moet een veld
  zijn dat de bundel werkelijk stelt, en de terugvertaling van pad naar bundel is mechanisch. Een derde
  claim zegt dat een bundel NIETS OORDEELT (elke settingssleutel leeg, geen vloer, geen voicing, geen
  X_max, geen `gateMs`). Nagemeten dat alle drie kunnen falen: één eis terug in `demo2way.ts` geeft drie
  rode claims met de rij erbij, een `?? '8'` in `demoBundleState` zeven met het PAD erbij, en een
  `gateMs: '4.5'` alleen precies één.
- **`applyDemoBundle` heeft zijn `stated`-argument verloren.** U-3 gaf het mee zodat de acht eisen van
  een demo met de NAAM van de demo gemarkeerd konden worden in plaats van met "stated by you". Met geen
  enkele bundel die nog iets stelt kon het alleen nog `null` zijn, **en een parameter met één bereikbare
  waarde is een route die niet bestaat** — dezelfde redenering waarmee U-1 het motorvinkje weghaalde en
  niet uitzette. Beide attributiekaarten worden nu onvoorwaardelijk leeggemaakt. **`V2StatedBy` zelf is
  NIET aangeraakt**: het draagt de attributie van een project van vóór U-3b en `v2Settings.test.ts` pint
  het onveranderd.
- **HET REFERENTIEPUNT VAN DE TWEEWEG IS DE REPARATIE WAAR "de posities kloppen niet" OVER GING.** Casus
  1b stelt er geen, dus de bundel stelde er geen, dus `refFromTopMm` was `''` — en de tekening valt terug
  op `Number(cabinet.refFromTopMm) || 0`, wat een driver op y +64,6 vijfenzestig millimeter BOVEN de
  bovenkant van een 1124 mm-front zet. De posities zelf klopten (±64,6 uit het manifest) en waren
  onleesbaar. Sinds U-3b staat het referentiepunt van dezelfde kast erin (244/900) en assert de guard dat
  élke weg van BEIDE bundels binnen het paneel landt. **Een verschil dat blijft staan en niet is
  gladgestreken:** met 244 mm landt de tweeter op 179,4 mm onder de bovenkant waar de drieweg-demo hem op
  170 zet — casus 1's manifest (±64,6, c-t-c 129,2) en Sanders getypte kast (−66/+74, c-t-c 140)
  verschillen tot 15 mm over dezelfde luidspreker. Elke bundel houdt zijn eigen record; het manifest noemt
  `src/demo3way.ts` zélf als de herkomst van zijn baffle-blok, dus voor die kast is de demo de bron.
- `src/lib/v2InputRegister.ts` — **DE PLAATSINGSREGEL, ALS DATA NAAST DE KLASSE.** `placementOf(row)` =
  `row.placement ?? PLACEMENT_BY_CLASS[row.cls]`, met `required → always`, `judgement → always`,
  `nice → more`, `v1-legacy → more`. Een rij mag de klasse overrulen **maar alleen met een reden**
  (`placementWhy`; de guard weigert een override zonder). Vijf nice-rijen blijven zichtbaar en alle vijf
  om dezelfde soort reden — zij maken de NOODZAKELIJKE getallen ernaast invoerbaar of leesbaar:
  `micDistance`, `baffleHeight`, `referencePoint`, `refDriver`, `sourceCount`. Drie rijen zijn
  CONDITIONEEL, als benoemde verzameling: `gateOverride`, `manualWindow`, `cabinetDepth` — alle drie een
  stand-in voor iets dat een bestand of een kast al weet, en **een permanent zichtbare stand-in nodigt uit
  om hem in te vullen over het ding heen waarvoor hij instaat** (A3h; beide demobundels droegen 4,5 ms
  `gateMs` over bestanden die 5,021 ms zeggen).
- **TWAALF ZICHTBARE BESTURINGSELEMENTEN HADDEN GEEN REGISTERRIJ**, en dat was het gat dat de U-3b-meting
  vond: mic distance, mic elevation, gate used, mic-aimed-at, front panel height, cabinet depth, het
  referentiepunt, de luisterpositie, aantal + tussenafstand, mounting, chamber en het handmatige venster.
  Alle twaalf zijn NICE (een run gebeurt zonder alle twaalf) en hebben nu een rij met wat leeg betekent.
  **Twee correcties die de tabel afdwong:** de rij `validity` beloofde twee dingen tegelijk (de header van
  het bestand én het handmatige veld) en is gesplitst — `validity` is de header, NOODZAKELIJK en niets te
  typen; `manualWindow` is de terugval, nice, want de header wint er altijd van (A5b.1(i)). En de ENIGE
  oordeelsrij op de driverkaart, het M-C-getal per weg, zat middenin het A5a-blok en staat sinds U-3b als
  eigen regel in het standaardbeeld.
- `src/lib/v2InputPlacement.test.ts` (14 claims, nieuw) — **de drift-guard.** `V2_FORM_FIELDS`
  inventariseert élk besturingselement van de drie BESTUURDE formulieren (kast, driverkaart, v2-paneel)
  met de bronregel die het identificeert, en de scan werkt twee kanten op: elk token moet in `App.tsx`
  staan, én **elke `<input>`/`<select>` in een bestuurde regio moet precies één inventaristoken raken** —
  een veld dat aan een van deze formulieren wordt toegevoegd zonder registerrij en zonder
  plaatsingsbesluit breekt de build (de I-1-vorm van `p6Lint`, één laag hoger). Daarnaast: een
  `more`-veld staat achter een uitklap en een `always`-veld nooit achter die van het formulier, en een
  conditioneel veld staat binnen zijn eigen guard — **alle drie per VOORKOMEN getoetst**, en dat is
  aangescherpt nadat de eerste versie het niet zag: **het kastformulier rendert TWEE KEER** (kaarten in
  guided, ledger in expert), dus een guard of een uitklap op één van de twee is een veld dat op de andere
  permanent staat. In guided is elke kaart zélf een `<details>` maar worden de velden als ARGUMENT aan de
  helper `kaart(...)` gegeven, dus tekstueel liggen zij niet binnen een tag; de scan telt een
  `kaart(`-aanroep mee als uitklap **met de premisse ernaast geassert** (`kaart` moet een
  `<details className="cab-card">` ZONDER `open` renderen), want anders past het hele kastformulier in
  dat gat. **Wat de regel NIET bestuurt
  staat BIJ NAAM** (`V2_UNGOVERNED_ROWS`, zestien rijen): de bestandsslots van de Import-tab, de drie
  v2-rijen in Filters-secties die ouder zijn dan het v2-paneel, de vijf v1-knoppen met hun U-1-badge, en
  `ampMinLoadOhm` — **die laatste is een bevinding: de versterkervloer is de ENE oordeelsinvoer van de
  minimale set en staat als enige niet naast de poorten die zij scherpstelt.**
- **Bijvangst, E-2's eigen regel één veld verder:** "Bass plateau depth dB" droeg `placeholder="2.5"` —
  een numeriek spookgetal op een OORDEELSveld. E-2 haalde de zes uit het v2-settingsblok; deze ontsnapte
  omdat de voicing op het ONTWERP leeft en geen `V2SettingKey` is, dus E-2's guard keek er nooit naar.
- **`test-fixtures/casus1_u3b_kale_demo_run.json` — DE VERKENNING OP EEN KALE BUNDEL.** Een verse browser,
  niets getypt, drieweg-demo: 900 s, zes van vijftien afgeleide kandidaten, zes gekwalificeerd, en het
  exportblok draagt `gates: {}`, `budgets: {}`, `requirements: null` — P4 over de hele app. De E-2-export
  ernaast blijft precies waar hij is (dezelfde bundel, mét met de hand ingetypte eisen), dus er staan nu
  **twee gedateerde records van dezelfde demo, één beoordeeld en één niet**. Wat het strippen kostte is
  gemeten met de tweede als tegenproef: de W-M-overname staat waar hij stond (415,8 / 466,7 Hz, zijn
  venstervloer is de eigen poort van de woofer) en de M-T-overname beweegt (1729/1940,8/2178,5 →
  1532,6/1720,3/1931 Hz), want zonder X_max, Bl en M_ms heeft de tweeter geen afgeleid excursieplafond en
  geen gesteld dB-getal, dus de aandrijfvloer van A5d.3 kan niet wapenen en het venster valt terug op
  k·f_s. **Een bundel die niets stelt krijgt het venster dat niets stelt.**
  `replay-app-run.ts --set demo` zegt SAME op beide lagen voor BEIDE exports.
- **DE VOLLE RUN IS BIJ U-3b NIET GEDRAAID**, met de I-1/I-3/B-1/U-3-afweging: geen engine-, poort-,
  budget-, venster- of corpuswijziging, en de twee byte-baselines die dát bewaken (`f4cRegression`,
  `workerRouteRegression`) draaien in de snelle laag en reproduceerden. Wat er WEL nagemeten is:
  `replay-app-run.ts --set demo` op de bewaarde E-2-run zegt nog steeds SAME op beide lagen, dus het
  strippen van kast- en driverkaartvelden heeft geen enkele kandidaat verplaatst.

### I-3-guards (guided is op de v2-route een wizard; alleen UI)
- `src/lib/v2Guided.ts` + `v2Guided.test.ts` (36 claims, nieuw) — **de I-1-inventaris als ROUTE.** Het
  register gaf élke invoer één zin gewone taal en zette die in het EXPERTPANEEL; guided vraagt ze sinds
  I-3 ÉÉN VOOR ÉÉN, in de registervolgorde, met diezelfde zin eronder en een expliciete SLA OVER waarvan
  het gevolg op de knop staat. Het lege veld en de ongewapende poort zijn in beide gevallen identiek — P4
  is nergens versoepeld — maar alleen één van de twee is een besluit dat iemand genomen heeft.
- **VIJFTIEN SCHERMEN EN VEERTIEN EISEN, en dat getal is GEDERIVEERD.** De opdracht vroeg "de veertien
  I-1-zinnen"; de tweeëntwintig oordeelsrijen gegroepeerd naar wat SAMEN iets zegt leveren vijftien
  schermen, waarvan er veertien "leeg = niets beoordeelt dit" zeggen. Het vijftiende is de VOICING, waar
  leeg geen afwezigheid is: vlak is de neutrale referentie en wordt gesteld dóór hem te kiezen (V45,
  A5e.2). `V2GuidedSkipKind` draagt die scheiding in het TYPE, en de test pint de neutrale als benoemde
  VERZAMELING (`['voicing']`) en niet alleen als telling — de V47/V48-les, preventief.
- **DRIE STATUSREGELS, ALLE DRIE DATA.** `all` = deze invoeren stellen alleen SAMEN iets (excursie,
  weerstandstoelating); `any` = het zijn ALTERNATIEVEN en één is een antwoord (het ene M-C-getal of een
  getal per weg; vlak of een plateau); `conditional` = een verfijning die stopt optioneel te zijn zodra
  een ander veld een waarde heeft — er is er precies één, het niveauwerk-maximum, want `series-r-max`
  zonder getal bindt niets en de hele regel leest als niet gesteld (V51b). Zonder die derde regel las een
  scherm met de modus en zonder maximum als BEANTWOORD terwijl de engine niets ontving.
- **DE ZINNEN ZIJN DIE VAN HET REGISTER, GELEZEN.** `skipMeansFor` levert `row.emptyMeans` verbatim en de
  test vergelijkt élke zin met het register; de schermen noemen ROW IDS en nooit woorden. De ENE invoer
  waarvan leeg DEFEREERT (`resistorThermalPowerW`, V50/V51) wordt uit
  `JUDGEMENT_KEYS_WHERE_BLANK_DEFERS` gemarkeerd en apart getoond.
- **GEEN ENKELE PLACEHOLDER IS EEN GETAL.** E-2 haalde de zes spookgetallen uit het paneel; een WIZARD is
  de plek waar zo'n suggestie het meeste schade doet, want zij arriveert wanneer de lezer de minste reden
  heeft om te twijfelen. De test scant de renderer en eist `UNSET_GHOST` op élk veld.
- **ÉÉN PROJECTSTAAT, TWEE WEERGAVEN — en dat is de claim waar de sessie op draait.** Guided schrijft
  `setV2Field`, `setAmpMinLoadOhm`, `setV2Meas` en de `targetCurve` van het ONTWERP: dezelfde setters als
  het expertpaneel. Geen guided-opslag, geen kopie, geen default. Het enige wat de wandeling onthoudt is
  een CURSOR (`ads-v2-req-ix`), bij naam in de test zodat er geen tweede `useState` bij kan komen. Drie
  van de vijftien schermen dragen invoeren die GEEN v2-sleutel zijn (de versterkervloer is ouder dan het
  v2-blok, het M-C-getal per weg staat op de driverkaarten, de voicing hangt aan het ONTWERP) — precies
  waarom de schermen rijen noemen en geen sleutels.
- **DE GRENZEN VAN TWEE WEERGAVEN MOGEN NIET VERSCHILLEN.** Twee inputs over één stuk staat kunnen het
  oneens zijn over wat erin getypt mag worden, en een dissipatie die het paneel op 100 % kapt en de
  wandeling niet is een waarde die maar één van de twee schermen bestaat. `REQUIREMENT_INPUT` is het ene
  huis; de test LEEST de JSX van het paneel uit `App.tsx` en vergelijkt `min`/`max`/`step` per veld. Een
  kopie in een commentaar zou de drift zijn die dit voorkomt; een test die de andere kopie leest kan niet
  wegdrijven, alleen falen.
- **OVERSLAAN WIST, en het etiket zegt het** ("Skip — clear this and leave it unjudged"). Langs een half
  ingevuld scherm lopen laat een waarde staan die niets beoordeelt en er als een antwoord uitziet
  (`partly`); de ene knop die "unjudged" belooft moet dat leveren.
- **DE ROUTE HEEFT ÉÉN HUIS EN DRIE LEZERS.** `guidedStages(engineV2Enabled)` voedt de stappenbalk, het
  commandopalet én de "Volgende"-knop onderaan — die laatste droeg tot I-3 een TWEEDE KOPIE van de route
  inclusief haar vijf etiketten, precies waar het commentaar op `GUIDED_STEP_LABEL` voor waarschuwt, en de
  nieuwe stap zou het eerste zijn geweest dat zo'n kopie kwijtraakte. Met de vlag UIT levert hij de vijf
  stappen die guided altijd had, in dezelfde volgorde en met dezelfde etiketten (in de browser nagemeten
  op verse localStorage); met de vlag AAN staat "What it must meet" op plaats 4, tussen de feiten en de
  run — want daar kan de vraag pas gesteld worden.
- **`V2_REQUIRED_BY_STAGE` — DE NOODZAKELIJKE INVOEREN STAAN OP DE STAP WAAR ZIJ INGEVULD WORDEN.**
  I-1's zeven NOODZAKELIJK-rijen zijn metingen en geometrie, dus het paneel kon er alleen naar WIJZEN;
  een route kan ze zetten waar zij ingevuld worden, met de zin van het register over wat hun
  afwezigheid kost. De vereniging is EXACT `rowsOfClass('required')`, beide kanten op — een nieuwe
  noodzakelijke invoer landt op een stap of de build breekt. `positions` staat op de DRIVERS-stap en
  niet op de kaststap die het register noemt: het register zegt welk FORMULIER een veld draagt, en in
  guided is "Your drivers" waar de posities ingevuld worden (zijn vinkje leest ze).
- **`guidedEngineNote` IS NULL OP v1, en dat is de toggle-invariant en geen verzuim.** Met de vlag uit is
  de app wat zij altijd was, en "exact" dekt de woorden op een tooltip net zo goed als de bytes in een
  netlist (dezelfde reden als `designLevelNote` en `v1NoteFor`). **De prijs is echt:** een guided
  gebruiker met de vlag uit hoort van hieruit niets over v2 en vindt hem waar hij altijd stond.
- **DE VERKENNING IS DE STANDAARD, EN DE PRIJS IS GEMETEN MET HAAR HERKOMST.** `fieldModeOf('')` levert
  hem sinds E-2 al; wat ontbrak was dat iemand het ZEI. Elk cijfer draagt de casus en de datum, zodat het
  niet stil in een belofte veroudert: 2032 s / 6 kandidaten (casus 1, E-2), 496 s / 5 (casus 1b, E-3b),
  17 884 s / 24 in de generator over acht processen (A5e.3c) voor het volle veld. De v1-zin op de guided
  ontwerpstap ("nine complete designs") beschrijft een v1-scan en staat sinds I-3 achter `!engineV2Enabled`.
- **`describeSkipped` — welke eisen onbeantwoord bleven, BIJ NAAM.** De poortkolom zei al `off` per rij en
  de eisenlijst "— no requirement stated" (P4, bij I-1 per veld nagelopen); wat geen rij kon zeggen is
  hoeveel van de gestelde vragen onbeantwoord bleven en welke. `null` zodra alles beantwoord is — "0
  overgeslagen" is ruis. Drie plekken: het samenvattingsscherm, boven de knop (een half uur is lang om te
  wachten op de mededeling dat niets het resultaat beoordeeld heeft) en naast de shortlist.
- `src/lib/help.ts` — `helpSectionForTab` kent de nieuwe tab en landt op `filters`: dezelfde eisen zijn
  daar de oordeelsgroep van het paneel, en een tweede handleidingssectie zou tweemaal geschreven moeten
  worden.
- **DE VOLLE RUN IS BIJ I-3 NIET GEDRAAID**, met de I-1/E-2/E-3b-afweging: geen engine-, poort-, budget-,
  venster- of corpuswijziging, en de twee byte-baselines die dát bewaken (`f4cRegression`,
  `workerRouteRegression`) draaien in de snelle laag en reproduceerden. De drie live ketenruns zouden een
  corpus reproduceren dat deze sessie niet aangeraakt heeft.

### C-2-guards (de synthetische casus, en de drie besluiten van de laatste regeneratie)
- `src/lib/engine2/goldenCasus2.test.ts` (14 claims, nieuw) — **de acceptatie-autoriteit van casus 2, en de enige
  in dit boek met een DERDE kolom.** Elders is een klasse-A-referentie een gemeten getal dat vastligt zodat een
  latere engine ernaast kan meten; hier staat het getal dat het MODEL kende voordat er iets gemeten werd
  ernaast. De poort komt er exact uit (1/T = 250, 2/T = 500 Hz, herkomst `header`), de vergelijkingstabel
  reproduceert rij voor rij uit een verse meting, **de bevindingenverzameling is EXACT gepind** (gelijkheid, geen
  deelverzameling — de E-4-vorm), de twee semi-inductantieschatters lopen aantoonbaar in tegengestelde richting,
  M-C route 1 is conservatief op de reflexkast en exact op de gesloten wegen, route 2 draait en haar verhouding
  IS de baffle-step binnen 2 %, het anker is de stilste weg van het model, de vensters staan op de regels die het
  model voorspelt, het veld ligt buiten élk casus-1-venster, A7 als schaaltest (×1,37 op de frequentie-as: élke
  resonantie exact mee, de Q's NIET, de vensterdrempel twee afleidingen verderop wel), klasse A is klasse A op
  élke netlist, de DCR van élke spoel is die van haar gestelde familie, en manifest ↔ schijf ↔ herkomst.
- `src/lib/engine2/optimizer/softInductanceBound.test.ts` (5 claims, nieuw) — **kooi tegen straf, op één
  fixture.** De premisse (het plafond ligt ONDER de zaadspoel, anders meet niets); `searchBoxFor` filet dezelfde
  bound twee kanten op en NOOIT allebei (een onderdeel staat in `valueCeilings` of in `valueSoftCeilings`, want
  hard filen naast een zachte som zou terugkooien wat de som losliet); P2 op de weggelaten sleutels; de kooi
  houdt de spoel op of onder het plafond en de straf laat haar erboven, met een ander netwerk als gevolg; en de
  straf is EXACT NUL binnen het plafond en verandert de zoektocht erbuiten. **Eén ding dat het opschrijven waard
  is: de straf is nul in het PUNT en niet nul in het PAD** — een zacht plafond binnen het eigen realismevenster
  van de app verandert het geleverde netwerk óók als de levering er ruim onder blijft, want de simplex evalueert
  onderweg punten erboven. Boven die rand doet de sleutel per constructie niets, en dát is de byte-claim.
- `choiceKeyGuard.test.ts` — 52 → 54 sleutels, 37/5/12. `seriesInductanceBound` is CHOICE (de VIJFDE zonder
  polish-tweeling, om V48's reden: de metingen die de inversie leest zijn al polish binnen `valueSumCeilings`) en
  `valueSoftCeilings` is POLISH (dezelfde inversie, de andere filing).
- `casus1Field.test.ts` — het veld is 8 × 2 = 16 uit 22 bij budget 16, en **élke kooi is tweezijdig en ligt
  binnen het venster**, met de buitenste twee rakend aan de rand. `twoSided` reist als VELD op de kandidaat en
  wordt op de ONGEAFRONDE randen bepaald: de printafronding op een tiende hertz is bij 2 kHz al 7e-5 octaaf,
  genoeg om een symmetrische kooi als eenzijdig te laten lezen.
- `frozenNetlistGates.test.ts` — de V33-guard meet sinds C-2 op de VERDICHTE lezing, want dat is wat de route
  leest; `resolutie_boven_speling` is daarmee leeg (grootste rest op het levende corpus 0,0002 Ω tegen een
  speling van 0,052). **En de V49-mid-claim is HERANKERD** op het V47/V48-corpus: zij zei "de afgeleide grens
  ligt op élke netlist van het beoordeelde veld onder −7,3 dB" met "het beoordeelde veld" = het levende corpus,
  en dat is een claim over élk toekomstig veld. C-2 is waar hij vervalt: met de W-M-overname op 156,7 Hz loopt de
  doorlaatband van de mid anderhalf octaaf lager, het gemiddelde zakt en de afgeleide grens STIJGT naar −4,92 dB
  op KAND_V2_7 — ruimer dan de weigering. Niets onveiligs volgt (die netlist leest M-C −17,8 op de mid), en de
  bevinding is echt: hoe streng de afgeleide grens is hangt af van waar de overname ligt. De V47/V48-les voor de
  vierde keer in dit bestand.
- `corpusPairing.test.ts` — de A5e.3c-claim is HERANKERD op `a5e3veld → a5e3c` (beide gedateerd) en de nieuwe
  C-2-claim staat ernaast: `a5e3c → live` heeft opnieuw GEEN enkel paar, want de tweezijdige positieregel
  verspringt per constructie élke positie. De opbrengst van de A5e.3c-run (elf geleverd, tien bevroren) staat
  sinds C-2 in `casus1_a5e3c_herkomst.json` — een feit over de RUN, en de levende herkomst wordt door de
  volgende overschreven.
- `ciLayer.test.ts` — `goldenCasus2.test.ts` staat in `CI_LOAD_BEARING`. Het is de meest portable acceptatie van
  het boek: de metingen zijn gegenereerd, élke referentie is een functie van hen, en geen enkele hangt aan een
  zoektocht of aan een machine.
- `casus1bV2Candidates.test.ts` — de E-4-brug `SINCE_THE_RECORD` is LEEG sinds casus 1b meegeregenereerd is, en
  blijft als lege lijst staan zodat de volgende sleutel die zonder regeneratie arriveert een plek heeft.

### E-4-guards (de inversie gepind, de snap leest het koper van de tuner)
- `scripts/measure-e4-inversion.ts` + `test-fixtures/casus1_e4_inversie.json` +
  **vijf claims in `frozenNetlistGates.test.ts`** — de divergentie tussen de A5d.6-inversie en de
  M-D-metriek als MEETRESULTAAT, niet als reparatie. De verzameling "boven het plafond én binnen
  het budget" is EXACT gepind (gelijkheid, geen deelverzameling en geen complement: de
  V37/V38-fix-les, waarvoor dit casusboek nu driemaal betaald heeft) — een netlist die de
  verzameling verlaat faalt door er nog op te staan, een die erbij komt door er niet op te staan.
  Daarnaast: de opgenomen getallen reproduceren uit een verse meting per netlist; de twee zijn
  aantoonbaar VERSCHILLENDE functies (Δ tot 8,7 dB én ergens vrijwel nul, dus geen offset die
  iemand kan wegkalibreren); er is NUL netlist onder zijn plafond en over zijn budget; en de
  leesregel zelf staat er als code — élke netlist boven zijn plafond heeft nog steeds een
  M-D-oordeel en dát beslist. Nagemeten dat hij kán falen: één naam uit de opgenomen verzameling
  halen zet hem op rood.
- `src/lib/coilDcr.ts` — **`snapDcrCeilingOhm`: het plafond dat een GESTELDE familie de
  catalogus-snap oplegt.** De fit bij de inductie van de spoel, verbreed met de grootste residu van
  die familie. **Verbreed met `exp(maxPct/100)` en niet met `1 + maxPct/100`, en de test vond dat:**
  de residuen zijn LOG-residuen in procent (zo berekent `fitCoilDcrFamilies` ze en zo leest de
  SKU-continuïteitsclaim ze terug), en lineair verbreden is tot eerste orde hetzelfde getal en aan
  de RAND niet — op de v8-catalogus valt precies één SKU (`JAZ-AC-000-0346`, 0,0100 Ω) buiten de
  lineaire band en binnen de logaritmische. Een plafond dat één onderdeel weigert van de familie
  die het beweert te beschrijven is precies het gebrek dat deze functie wegneemt; de test loopt
  daarom élke SKU af in plaats van er een paar te prikken.
- `src/lib/engine2/optimizer/coilSnapCeiling.test.ts` (5 claims, nieuw) — het levende corpus tegen
  de twee plafonds: élke spoel met een gestelde familie draagt méér koper dan het TAKBUDGET
  toelaat (het onderwerp van de reparatie — zonder die claim gaat de rest over niets), het
  FAMILIEPLAFOND admitteert het én levert een échte SKU via `pickCandidates`, het weigert nog
  steeds de verkeerde draaddikte (0,7 mm tegen een 1,4 mm-plafond — geen blanco cheque), en absent
  houdt de snap het plafond dat hij altijd had, met de P4-reden erbij.
- `choiceKeyGuard.test.ts` — de ZESENDERTIGSTE keuze-sleutel `coilSnapDcrCeiling` (52 sleutels,
  36/5/11). De VIERDE zonder polish-tweeling, om dezelfde reden als de sleutel waarvan hij wordt
  afgeleid: de fits reizen binnen `coilDcrModel`. **En de enige keuze-sleutel die geen corpus kán
  bewegen** — de snap draait ná de tune, en dát is wat E-4 toestond hem zonder regeneratie te
  repareren.
- `shortlist.test.ts` (+2) — de lijst zegt sinds E-4 wanneer er méér haalbaar was dan er past
  ("N designs met every requirement; the list holds M, chosen for spread"), en zegt het NIET
  wanneer alles past. Zonder die tweede helft is de noot ruis in plaats van een bevinding. A5e.3c
  was de eerste regeneratie waar het bijt: elf haalbaar, tien bevroren, en de lijst zweeg.
- **In `App.tsx`:** de legenda "Combined-curve color = phase alignment" hangt sinds E-4 aan
  `integration` en niet alleen aan `!soloDriver`. Op een drieweg is `integration` null (het is een
  twee-driver-grootheid) en de somcurve bleef één kleur terwijl de legenda een kleuring beloofde —
  live nagemeten op de LP-1-run vóór de wijziging. Wat een drieweg wél doet stond er al: een score
  per overname in de kop, en de FASE-chart die haar curve wél kleurt.
- **In `EngineV2Panel.tsx`:** de voet meldde dat componentgrenzen "do not follow a catalogue's
  span" terwijl A5e.3b de spanwijdte van de gestelde familie juist een zoekgrens op de laagste weg
  maakte. Hij noemt sindsdien wat er nog open is: de spanwijdte bindt geen andere weg, en de
  stapel is een gestelde uitzondering die niemand gesteld heeft.

### E-3b-guards (de app stuurt N=2 door dezelfde v2-deur als N=3; alleen UI- en clientlaag)
- `src/lib/optimClient.ts` — **`runScanV2`: ÉÉN gepoolde v2-scan, twee routes.** `runChain3ScanV2` en het nieuwe
  `runChainScanV2` verschillen in drie dingen (berichtsoort, hoe de payload zijn kandidaat NOEMT, resultaattype) en in
  niets anders: pooldiscipline, de gethrottlede voortgangstabel, de stop-semantiek, de ⚠gate/⚠Z-glyphregel en de
  aborted-stempel staan één keer. Twee kopieën zouden twee antwoorden zijn op "was deze run compleet", de ene vraag
  waarop A5e.4 zegt dat er geen twee mogen zijn. `V2ChainItem` draagt het label NAAST de invoer, nooit erin
  (`ChainInput` is v1's type en heeft er nooit een gedragen). **Het commentaarblok "NO `runChainScanV2` HERE" is weg en
  zijn reden staat in de nieuwe doc-noot**: hij was juist zolang de enige aanroeper een latere fase was, en E-3b is die
  fase. **Wat NIET meeverhuist is de v1-REDDING** (vrije ketenrun eerst, gepinde vervolgen erachteraan): redding is een
  manier om kandidaten te MAKEN en dat hoort op de v2-route bij A5d — dezelfde reden waarom de driewegroute haar
  as-voor-as-modus overslaat.
- `src/lib/engine2/optimizer/scanRequest.ts` + `scanRequest.test.ts` — **wat de app de v2-worker geeft, voor élk aantal
  wegen, als zuivere functies.** De v2-deur stond één keer geschreven, voor drie wegen, binnen `runVfOptimize`:
  vierhonderd regels lijm tussen React-state en `buildCandidateField` / `factsForWorker` / `declareCandidateChoices` /
  de poort- en budgetblokken / de export / de shortlist. Elf van de zestien stappen zijn N-neutraal (gemeten, zie
  casusboek E-3b), dus die lijm is één implementatie met twee aanroepers geworden in plaats van twee deuren.
  **Niets erin leest React-state**, en dat is de UI-1-les één stap eerder: de laag ná `handleV2Request` lag buiten élke
  test en deed maandenlang het verkeerde; wat de run VAN GEMAAKT wordt is dezelfde soort laag.
  **P4 in elke functie:** een niet-gestelde instelling levert een ONTBREKENDE SLEUTEL, nooit een nul en nooit een
  default — daarom zijn de blokken spreads en geen objectliteralen met optionele velden.
  Achttien claims, in vier groepen. (1) **DE EXTRACTIE VERANDERDE NIETS AAN DE DRIEWEGRUN, gemeten tegen een ECHTE
  OPNAME**: het `run`-blok van `casus1_e2_verkenning_run.json` (E-2's browserrun van 2032 s) wordt sleutel voor sleutel
  gereproduceerd uit dezelfde gestelde grenzen, met `peakInputVolts` als échte afleiding (√(2·160·8)) en niet als
  rondgang. Een fixture die vandaag geschreven wordt kan naar de code gevormd zijn; een opname van gisteren niet.
  (2) N=2 op casus 1b: één vensterinvoer (de rapportlus is `i + 1 < order.length`), de gestelde orde en het EIGEN
  M-C-getal van de bovenste weg (V50: per weg vóór het enkele veld), en de VERKENNING tegen het volle veld — élke
  positie binnen het afgeleide venster, het venstercentrum erbij (dat IS centre-first), beleid in de parameters.
  (3) P4: een leeg formulier levert `{}` voor gates, budgets en determinisme; een piekspanning vraagt BEIDE
  versterkervelden; `reportingPowerW` weigert leeg, nul en onzin en neemt een getal. (4) Een tweewegkandidaat door
  `collectV2Scan` → `buildShortlist` → `selectFromShortlist`, met de UI-1-val ingebouwd: de GEWEIGERDE kandidaat draagt
  de beste RMS van het veld en een lege onderdelenlijst, en de selectie levert de andere.
- `src/lib/engine2/optimizer/selection.test.ts` — **vijf E-3b-claims als BRONSCAN op de tweewegtak van `App.tsx`.**
  De beslissing is hierboven getest zonder browser; wat een test niet bereikt is of de app haar AANROEPT, en dat is
  precies wat de eerste keer misging. Sinds E-3b is dezelfde vergissing op een tweede route beschikbaar, dus: de
  tweeweg-v2-tak bestaat, staat achter de motorkeuze, gaat naar `runChainScanV2` en niet naar `runChainScan`, laadt via
  `selectFromShortlist` + `applyScanCandidate`, en **`ranked[0]` komt er niet in voor** — `ranked` wordt wél berekend
  (het vult de scan-tabel, de tweede lezing die UI-1 bewaarde) maar niets neemt zijn eerste rij. Nagemeten dat de scan
  kán falen: één `void ranked[0];` erin zet hem op rood.
- `src/lib/engine2/toggleRegression.test.ts` — **de vóórstart-bewaker telt sinds E-3b per SOORT in plaats van in
  totaal.** Hij eiste drie `setV2PreStart`-plekken; een totaal dat met het aantal scanroutes meebeweegt is een getal dat
  iemand ophoogt in plaats van een claim die iemand controleert. Sindsdien: twee vensterbewakers, twee ARMS, drie
  CLEARS, arms + clears = alle plekken, en de dichtstbijzijnde voorafgaande bewaker van arm n IS bewaker n. Die vorm kan
  niet vervuld worden door een route toe te voegen die de melding ongewapend zet.
- **In `App.tsx`:** `v2Roles` (de rollen die dit project heeft — één lijst waar er vier uitgeschreven stonden),
  `v2DriveLimitDbByDriverId` en `driveOnFsMaxDbByModel` (dezelfde gestelde M-C-getallen in de twee andere vocabulaires:
  app-rollen, rapport-driver-ids, worker-modellen — drie plaatsen deden hun eigen `find` over `driverIds`),
  `v2MeasuredFacts` als memo, `ScanTableRow` als BENOEMD type (er zijn sinds E-3b twee bouwers en drie lezers; een vorm
  die alleen als inferentie bestaat kan niet het contract van twee bouwers zijn), `chainScanRow` (de tweewegrij, uit de
  v1-`.then` gelicht) en `scanRowOf`, dat op `'vf' in r` splitst zoals `applyScanCandidate` dat altijd al deed.
  `v2Shortlist` is `Shortlist<ChainResult | Chain3Result>` — `buildShortlist` en `selectFromShortlist` waren altijd al
  generiek, alleen deze state zei drieweg.
- **Een v1-BEVINDING, gemeld en niet gerepareerd (buiten de omvang: v1-parser onder de toggle-invariant).** Met Sanders
  gemergede mid (`Koan_M_merged.frd`) weigert `refuseIfUnverified` de run: de v1-vensterlezer
  (`xoWindow.gateHeaderOf`) leest de M-1-regel `* Merge floor reason = sealed pod f_c 88.8 Hz: …` als een vensterregel
  zonder millisecondenlengte. Het spiegelbeeld van de UI-1-les: daar las de engine op VELDNAAM en de v1-parser op proza,
  hier loopt diezelfde proza-heuristiek stuk op een gestructureerd mergeblok. `parseArtaHeader` leest hetzelfde bestand
  zonder klacht.
- **`test-fixtures/casus1b_e3b_verkenning_run.json` — de BEWAARDE TWEEWEGRUN**, naast E-2's
  `casus1_e2_verkenning_run.json` en om dezelfde reden: een browsercontrole die alleen in een sessieverslag bestaat is
  een controle die niemand kan herhalen. Casus 1's mid en tweeter als tweeweg, Engine v2 aan, vloer 2,6 Ω, verkenning,
  vijf kandidaten door `runChainScanV2` (496 s). Naspelen met
  `npx vite-node scripts/replay-app-run.ts test-fixtures/casus1b_e3b_verkenning_run.json --set casus1b`: **laag 1
  SAME** (5 van 5, digest `74f30494` = de stempel), laag 2 DIFFERENT met de invoerverschillen bij naam (geen geometrie
  ingevoerd, en de app draait op haar eigen `.zma`-conversie van `mid.lim`). `scanRequest.test.ts` pint er drie claims
  op, waaronder **P4 over de HELE app**: één gestelde poort in het exportblok en géén verzonnen budget of seed.
- **`scanRequest.test.ts` telt 21 claims in VIJF groepen**: de opname sleutel voor sleutel; de bewaarde tweewegrun;
  casus 1b's ene overname met de verkenning tegen het volle veld; P4 op een leeg formulier; en een tweewegkandidaat
  door `collectV2Scan` → `buildShortlist` → `selectFromShortlist` mét de UI-1-val ingebouwd — de GEWEIGERDE kandidaat
  draagt de beste RMS van het veld en een lege onderdelenlijst, en de selectie levert de andere.

### E-3-guards (de tweewegroute door de worker; vijfde ketensleutel; polariteit in het netwerk; casus 1b)
- `src/lib/engine2/optimizer/worker.ts` — **de `v2ChainOne`-tak leest sinds E-3 de ketenverklaring in het vocabulaire van
  `designChain.ts`** (`withDeclaredChainChoicesTwoWay`: `eqBands` → `eqBandsPerDriver`, `leanTargetDb`, `lowestWayLevelWork`,
  `lowestWayCoilMaxHenry`, `synthesisGrid`), zet de verklaarde zoekgladding op `ChainSettings.errorSmoothOct`
  (`withDeclaredSearchSmoothing` — `vfOptimizer.ts` is de TWEEDE lezer van `errorSmoothOct`, de lezer die V38-fix niet
  bereikte), bouwt de topologiebeschrijving uit de vf-specs (tot E-3 leeg), en **vouwt op BEIDE routes de polariteit die
  de ontwerpstap koos in het `Driver`-onderdeel** (`foldDriverPolarity`: XOR met wat het onderdeel droeg; `parts` én
  `net.parts`). Tot E-3 reisde de omkering als `adjust` en las élke lezer buiten de keten — shortlist, rapport, bevroren
  bestand — de niet-omgekeerde som (casus 1b: ±70 dB in de shortlist, 177° in het rapport, tegen 1,42 dB / 2,6° in de
  tuner). Op het casus-1-veld is de vouw de identiteit (LR4-alleen, nooit omgekeerd): de byte-baselines en de live
  reproductie staan. Elke ingreep is de identiteit zonder kandidaat (P2).
- `src/lib/engine2/optimizer/chainChoices.ts` — **de VIJFDE ketensleutel `synthesisGrid: 'alive' | 'full'`**: op welke
  rasterpunten de per-tak-SYNTHESE fit. Onvoorwaardelijk `'alive'` verklaard (`candidateDeclaration.ts`, de V37/V38-fix-
  vorm), expliciet `'full'` wint. **Absent = de eigen geschiedenis van elke keten (P2):** `threeWayChain.ts` fitte altijd
  al op de levende punten (`ALIVE_DB`, sinds E-3 geëxporteerd) en implementeert nu ook `'full'`; `designChain.ts` fitte
  op het volle raster mét het dode toppunt (20 000 Hz is op élke casus een −400 dB-geest) en leest `'alive'` sinds E-3.
  Gemeten op casus 1b: op het volle raster jaagt de synthese een doel van −400 dB na en degenereert de tweetertak
  (C 2,5 pF, "0,001 Ω bij 20 000 Hz"; de tuner weigert de hele tune en geeft het zaad terug); op de levende punten
  bouwt zij. `chainChoices.test.ts` pint vijf sleutels, de tweewegvertaling sleutel voor sleutel, en de byte-identiteit
  van een verklaard `'alive'` tegen de weggelaten sleutel op de driewegketen (één ketenrun per arm);
  `choiceKeyGuard.test.ts` pint de lijst en het gat. `casus1bV2Candidates.test.ts` pint de meting zonder ketenrun
  (dezelfde HP-spec: het volle raster degenereert bij het toppunt, de levende punten niet).
- `src/lib/designChain.ts` + `src/lib/vfOptimizer.ts` — `ChainSettings` kent sinds E-3 `leanTargetDb`,
  `lowestWayLevelWork`, `lowestWayCoilMaxHenry` en `synthesisGrid` (alle optioneel, absent = byte-identiek voor élke
  v1-aanroeper); `'none'` zet de gain-verschuiving van de laagste weg op 0 en de vf-ontwerpstap legt er geen shelf-EQ
  (`noShelfOnWoofer`); de drie sleutels van "de laagste weg" gaan alleen naar de synthese van de `low`-tak.
- `src/lib/engine2/goldenCasus1b.test.ts` — **de acceptatie-autoriteit van casus 1b** (14 claims): klasse A reproduceert
  op het rapport zónder netlist én op elk bevroren bestand (de definitie van klasse A als assert); het venster is tot op
  de hertz casus 1's `mid_tweeter_orde4` (beide rapporten naast elkaar — de eerste meting van E-3); anker = laagste weg =
  mid; het verkenningsveld (één as, orde 4, centrum en beide buren, budget 8); raster en band afgeleid; klasse B op élke
  netlist die het manifest noemt, mét de gewapende poortoordelen; manifest ↔ schijf ↔ herkomst; HUIDIG_MT ⊂ HUIDIG
  byte-voor-byte. Draagt geen tag en staat in `CI_LOAD_BEARING`.
- `src/lib/engine2/casus1bV2Candidates.test.ts` — de goedkope helft (herkomst ↔ fixture: poorten, budgetten, seed, band,
  de verklaring sleutel voor sleutel, een looptijd op élke kandidaat, de synthese-meting) en **de DERDE live ketenrun**
  (`[live] casus 1b: …` / `[bytes] casus 1b: …`, ~95 s: de goedkoopste geleverde netlist door `v2ChainOne`, byte voor
  byte). `ciLayer.test.ts` staat op DRIE live- en ZEVEN bytes-namen; de tagbewaker in `casus1V2Candidates.test.ts` op
  drie.
- `src/lib/engine2/goldenClassification.test.ts` — een casus-1b-describe met eigen padlijst; de bevroren netlists uit
  het manifest; klasse C alleen onder de lege baseline. **De bronscan op `v1_baseline` ving het typeveld in
  `casus1b.fixture.ts`** — het is er uit gehaald: geen bronbestand typeert of leest dat blok.
- **Twee bevindingen zonder reparatie, benoemd in casusboek E-3:** M-K bereikt de vf-ONTWERPSTAP niet (`phaseMetric:
  'band'` zonder toelating; tuner en rapport oordelen wél op M-K), en of de KOOI op de tweewegtuner bindt is niet als
  mechanisme gemeten (`xoRange` is een zachte straf; op dit veld bleef élke levering erbinnen). **De app stuurt een
  tweewegverzoek nog naar de v1-worker** — de vier app-rijen van de kaart (A5d-veld, feiten/poorten/shortlist, UI-1,
  E-2) blijven open.

### E-2-guards (snel veld, P4 op het v2-formulier, twee UI-2-restjes, een app-run reproduceerbaar; alleen UI/run-instellingen)
- `src/lib/engine2/predesign/candidates.ts` — **twee optionele beleidssleutels op de generator, en absent is het veld
  dat het altijd was (P2).** `positionPolicy: 'spread' | 'centre-first'` en `alignmentPolicy: 'every-order' | 'one'`;
  `CandidatePairInput.statedOrder` voor de tweede. `'centre-first'` legt het geometrische midden van het venster EERST
  (het referentiekruispunt waarop de orde-afleiding haar eisen leest, `candidateField.ts`), dan ±1, ±2 … spacing naar
  buiten (de LAGERE buur eerst — een lagere overname belast de bovenste driver harder), telling
  `centreFirstPositionCount` = 1 + 2·floor(halve spanwijdte / spacing), kooi één spacing breed en NIET verbredend onder
  een budget: een uitgedund verkenningsveld dekt minder band, niet dezelfde band grover. `'one'` bouwt één uitlijning per
  overname — de gestelde orde als de afleiding haar toelaat, anders de STEILSTE toegelaten (die haalt elke eis die de
  afleiding stelde) — en noemt de niet-gebouwde orden in de asnoten. **De `parameters` van het veld dragen de sleutels
  ALLEEN als zij gesteld zijn**, dus `candidateFieldKey` — en daarmee élke vóór E-2 opgenomen run-vingerafdruk — is
  byte-identiek voor een veld zonder beleid; `candidates.test.ts` (drie E-2-blokken) en `fieldMode.test.ts` (claim 4:
  de volle modus keyt byte-identiek aan het F4d-verzoek `chainBudget: steps^pairs`) pinnen dat.
- `src/lib/engine2/predesign/fieldMode.ts` + `constants.ts` (`EXPLORATION_CHAIN_BUDGET = 8`, @p6 rule — een
  run-grootte, gesteld door Sander, geen grens) — **de veldmodus:** `fieldModeOf('' | 'exploration' | 'full')` (leeg =
  verkenning), `fieldModeSettings(mode, {stepsPerAxis, pairs})` (verkenning: budget 8 + beide beleidssleutels; vol:
  steps^pairs en GEEN beleidssleutel), `fieldModeOfParameters(field.parameters)` (de modus wordt van het veld zelf
  gelezen, nooit van een select ernaast) en `describeFieldMode`. `fieldMode.test.ts` op casus 1: de verkenning past in
  het budget en is kleiner dan het volle veld, bouwt op elke as alleen orde 4 (de gestelde), draagt op elke as het
  geometrische venstercentrum en NIET de vensterranden, en heeft dezelfde vensters, vloeren en plafonds als het volle
  veld — dezelfde eisen, een kleiner veld. **Gemeten op de repo-set (merged): verkenning 2 × 3 = 6 kandidaten uit 33
  afgeleid — W-M 254 en 285,1 Hz (het venstercentrum 285,1 = √(147,9 · 549,7) en zijn lagere buur; 11 afgeleid), M-T
  1735,4 / 1947,9 / 2186,5 Hz (het centrum 1947,9 en beide buren; 3 afgeleid) — tegen 4 hoekposities (147,9/549,7 ×
  1646,9/2304) voor het volle veld bij 2 stappen per as. Op de gepoorte set (de demobundel): W-M 415,6/466,5, M-T
  1727,7/1939,3/2176,7.**
- `src/App.tsx` — de modus is `engineV2Settings.fieldMode` (select "Candidate field" in de sectie "Engine v2 — run",
  bewaard in het project als `engineV2.fieldMode`); `runVfOptimize({ fieldMode })` neemt een expliciete modus (de knop
  "Run the full field →" onder de shortlist stelt 'full' en geeft hem mee, want de state landt niet in dezelfde tick;
  de vóórstart-melding geeft `runOpts` door). Het veldverzoek (`v2FieldRequest`: vensterinvoer, `perPair`,
  `fieldSettings`) staat los van het veld zodat de export precies draagt wat de generator kreeg. `v2Run` draagt sinds
  E-2 `field: { mode, description }` (de shortlist drukt de regel af, `.v2-field-mode`) en `export: RunExport`.
- `src/lib/v2Settings.ts` + `v2Settings.test.ts` — **P4 op het formulier.** De zes getallen die Sander als waarden las
  (35 %, 1,6 Ω, −18 dB, 2,5, 1,5, 0,5) waren HTML-placeholders op lege velden. Sindsdien: `EMPTY_V2_SETTINGS` is de ene
  definitie van de verse toestand (initial state, autosave-herstel en een project zonder blok komen er alle drie op
  uit); `V2_GHOSTS` geeft élk oordeelsveld (`V2_JUDGEMENT_KEYS`: poorten, budgetten, eisen, V49-, V50-, V51-invoer én de
  twee rapportageschalen `amplifierPowerW`/`verticalWindowDeg`) de markering `—` en geen getal — de enige numerieke
  ghosts zijn `shortlistSize` (DEFAULT_SHORTLIST_SIZE) en `runSeed` (DEFAULT_RUN_SEED), de twee waar leeg werkelijk de
  gepubliceerde default betekent, met naam in `V2_DEFAULT_GHOST_KEYS`; `restoreV2Settings(stored, storedAt)` is de ene
  herstelregel; `stampStated` zet bij elke bewerking de datum, `statedMark` drukt **"stated by you on <datum>"** naast
  een veld met waarde (of "date not recorded" voor een waarde uit een project van vóór E-2 — nog steeds van de
  ontwerper, nooit van de app). In App: `setV2Field(key, value)` is de ENE setter (de bronscan eist dat geen
  `setEngineV2Settings((v) => …e.target.value…)` meer bestaat), `engineV2StatedAt` reist in het project
  (`engineV2StatedAt`), `v2Stated(key)` rendert de markering (`.v2-stated`). `designLevelNote(engineV2Enabled)`: het
  v1-veld "Design for … dB" (echte default '96', sinds V49 niet gelezen op de v2-route) draagt op de v2-route de noot
  "v1 — not read by Engine v2 since V49" en op v1 niets (toggle-invariant). De test scant App.tsx: geen
  `placeholder="<cijfer>"` onder een `value={engineV2Settings.…}`, élk oordeelsveld leest `V2_GHOSTS.<key>` en draagt
  `{v2Stated('<key>')}`. **Handmatig nagemeten in een verse headless Chrome (localStorage gewist, demo geladen, v2 aan):
  24 v2-velden, 0 met een waarde, de enige numerieke placeholders Shortlist size = 10 en Run seed = 20260826.**
- `src/lib/schematicEdit.ts` (`backgroundClick`, `EditorTool`) + `schematicEdit.test.ts` — **het draadgereedschap
  keert na een draad terug naar selecteren**, zoals het plaatsen van een onderdeel dat al deed. Eén zuivere stap voor
  élk gereedschap: de eerste klik wapent het startpunt, de tweede LEGT de draad, selecteert hem en zet het gereedschap
  op select (ook bij een nul-lange draad); plaatsen idem; een klik in select-modus wist de selectie.
  `SchematicEditor.tsx` roept hem aan en houdt geen eigen overgangen meer.
- `src/lib/networkReadiness.ts` (`notSimulatedTag`) + `EngineV2Panel.tsx` (`notSimulated`-prop, `V2_STALE_TAG_CLASS`,
  wrapper `sim-stale`) + `engineV2Panel.test.tsx` — **de "not simulated"-tag heeft één tekst met vier lezers:** de
  grafiekkoppen (`staleTag` in App leest hem sinds E-2 ook), het scan-resultaat en de shortlist-kop, de v1-reading-kop en
  het v2-paneel. De paneeltest rendert met `renderToStaticMarkup` (de xoWindowAnnotation-vorm) en claimt beide kanten:
  de tag mét prop, geen tag en geen dimming zonder.
- `src/lib/engine2/optimizer/runExport.ts` + `runExport.test.ts` — **het exportblok (`RunExport`, formaat
  `crossover-studio-run/1`)** en de twee vergelijkers (`compareCandidates`: missing/extra/changed met het veld benoemd;
  `compareWindowInputs`: per paar en per veld), `replayField` (laag 1) en `fieldChoicesDigest` (de `choices`-component
  van de stempel). Negen claims op casus 1: rondgang door JSON reproduceert élke kandidaat en de digest (verkenning én
  vol), de vergelijker ziet een ontbrekende, een extra en een verplaatste kandidaat, en de TEGENPROEF: een ander budget
  of een ander uitlijningsbeleid in het blok geeft een ander veld c.q. een andere digest — het blok is geen opvulling.

### E-1-guards (vier engine-posten, geen regeneratie: goedkoopste live-onderwerp, M-T-bovengrens, barrière-verdichting, de zestien paren)
- `src/lib/engine2/casus1Corpora.fixture.ts` — **`liveSubjects()`: één regel voor beide live ketenruns.** De geleverde
  netlist en de verwerping met de laagste `kandidaat_uitkomst[].looptijd_s`, ties op label; gooit op een herkomst zonder
  looptijd. `casus1V2Candidates.test.ts` draagt de snelle claim (élke kandidaat heeft een looptijd; het onderwerp is
  nergens duurder dan een ander geleverd bestand; deterministisch) en de `[bytes]`-reproductie heet sindsdien
  `the cheapest delivered netlist, by recorded runtime, …`; `casus1V2Refusal.test.ts` vergelijkt élk veld van de
  opgenomen `rejectedTune` in de vorm waarin het opgenomen is (getal op zes decimalen, `null` blijft `null` — F0) en
  accepteert beide weigeringszinnen (de tuner zegt "no network", een gestelde regel "nothing").
- `src/lib/netOptimizer.ts` — **`refinedSystemMinImpedanceOhm` + `dipCellsOf` + `BARRIER_DIP_REFINEMENT`, en de vijfde
  waarde van `zFloorBarrierSource`: `'safety-extended-refined'`.** Het verlengde raster, in de twee cellen rond zijn
  grove minimum opnieuw opgelost op de eigen punten van de poortsweep; waar het sweep-minimum in een verdichte cel ligt
  IS de lezing die van de sweep, bit voor bit. Zelfde twee invoeren als `'safety-extended'`; ontbreekt er één, dan
  stuurt de term niet (V32-regel, geen terugval). `barrierSource.test.ts`: P4 in de lus, de lezing op het zaad is
  bit-gelijk aan de sweep bij 13 van 1600 punten, een ontbrekend model weigert, en de term leest de functie (bronscan —
  op het tweewegfixture leveren de verdichte en de verlengde bron bij dit budget hetzelfde netwerk, gemeten, dus de
  "ander netwerk"-claim wordt door casus 1 gedragen). `frozenNetlistGates.test.ts` (in de V33/A5e.3b-claim): op ÉLKE
  bevroren netlist ligt de verdichte lezing binnen de vloerspeling van de poort, nooit boven de grove lezing, met
  hetzelfde oordeel; op de namen die het grove raster boven de speling boekt sluit de verdichting het gat; en zij
  verplaatst ergens een lezing (niet vacuüm). De recorder schrijft de kolommen `*_E1` en het blok
  `v33_barriere_raster.verdichting`; `resolutie_boven_speling` blijft wat de ROUTE leest (nog `'safety-extended'`).
- `src/lib/engine2/predesign/xoWindow.ts` — **`statedCeilingHz` (rule `'stated'`): de spiegel van A5e.3b (b)2.** Eén
  plafond naast breakup en directiviteit; de LAAGSTE bindt (de reductie die er altijd stond) en `ceilingBy` zegt welke;
  een spanningsregel zegt aan welke kant van de afgeleide een gesteld plafond landde. `report.ts` leest
  `ReportSettings.maxCrossingHzByPair` (huis op casus 1: `gestelde_eisen.max_kruispunt_hz_per_paar`, NIET gesteld);
  `casus1MaxCrossingHzByPair` / `CASUS1_WINDOW_SETTINGS` gespreid op élke plek die het veld afleidt (generator, recorder,
  meetbank, beide live-tests, `frozenNetlistGates`, `casus1Field.test`, `measure-a5e3b-voormeting`). Absent = het
  venster van altijd: `candidates.test.ts` pint dat absent en `null` byte-identieke velden geven, dat een gesteld
  plafond ONDER het afgeleide bindt (bovenpositie erop, `ceilingBy: 'stated'`, zeven posities in plaats van dertien)
  en één erboven niet, en dat de herkomst élk bekend plafond noemt ("the strictest of directivity 1600 Hz, stated
  2000 Hz" / "; no stated ceiling"). **De kandidaatherkomst draagt sinds E-1 ook de KOOI en zegt wanneer die
  eenzijdig is** ("clipped at the ceiling: one-sided, the tune can only leave it downward"): de proza-zin staat NIET in
  de vingerafdruk (`candidateFieldKey`), dus het corpus reproduceert. De bevinding: geen enkele bekende grens drukt het
  geleverde kruispunt onder de vensterrand — de kooi op de plafondpositie is eenzijdig en het akoestische kruispunt
  klapt naar het lokale minimum van mid − tweeter (2056 Hz); de strengste BEKENDE bovengrens blijft 2304 Hz en het
  veld beweegt niet. `casus1Field.test.ts` ongewijzigd groen.
- `src/lib/engine2/optimizer/derivedGateRefusal.test.ts` — **de zestien (netlist, weg)-paren EXACT gepind tegen het
  manifest** (`manifest_en_geometrie.e1_kruispuntafleiding`, door de recorder geschreven: per paar de kruispunten op
  het ketenraster en op het rapportraster, M-C op beide, beide oordelen, de familie en de engine-stand — gezocht op de
  gepoorte set met het ketenraster van toen (200–20 000/96) tegen vandaag op beide routes op de gemergede set — en de
  leesregel). De verse verzameling moet GELIJK zijn aan de opgenomen (een nieuw paar valt om door er niet op te staan,
  een verdwenen paar door er nog op te staan — de A5e.3c-vorm was een deelverzamelingstoets, de neef van het complement),
  de opgenomen getallen reproduceren binnen de dB-klasse, en geen paar hoort bij een corpus dat de weigering bestuurt
  (`bestuurd_door_de_weigering_en_eens: true`).

### A5e.3c-guards (het veld op de A5e.3b-grenzen; de weigering op de eigen kruispunten; alleen v2-runs)
- `src/lib/engine2/optimizer/worker.ts` — **een geleverd netwerk dat op de passbands van zijn EIGEN kruispunten een
  actieve poort mist wordt geweigerd** (`by: 'derived-gate'`, `kinds: ['gate']`, de zin van de poort als reden;
  `derivedGateViolation` als exporteerbare beslissing: één callback voor beide conventies, de bevroren eerst, en een
  bevroren fout blijft de weigering van de tuner zelf). De aanleiding is de V32-vorm op M-C: de zoektocht is aan de
  passbands van het ZAAD gehouden (`gates.ts` regel 4), het geleverde netwerk werd óók op zijn eigen kruispunten
  beoordeeld (`gatesDerived`, `violation`) en dat oordeel las op de v2-route niemand — de shortlist oordeelt op de
  bevroren helft. Gemeten op het A5e.3c-veld: de tuner schuift het M-T-kruispunt 10–230 Hz onder de gestelde positie,
  de tweeter-passband verbreedt naar beneden en M-C leest tot 0,58 dB minder beschermend op de eigen kruispunten; drie
  van veertien geleverde haalden −20 op het zaad met 0,10–0,19 dB en misten het op zichzelf met 0,10–0,39. Een oordeel
  dat alleen berekend wordt is geen oordeel (V31). De byte-baselines (`f4cRegression`, `workerRouteRegression`)
  reproduceren: zonder gewapende poort vuurt de weigering nooit (P2).
- `src/lib/engine2/optimizer/derivedGateRefusal.test.ts` — negen claims. De beslissing als functie (derived alleen
  als frozen schoon is; frozen eerst; een frozen fout is niet van deze regel); op de ECHTE bestanden een referentie
  bevroren van HUIDIG (zaad-stand-in) tegen het gedateerde A5e.3-veld-corpus: de twee conventies lezen de tweeter
  meetbaar anders en een grens ertussen wordt op de ene gehaald en op de andere gemist, met de tegenproef dat een
  grens onder beide niets weigert; **de V32-vorm voor M-C**: de poortroute op de eigen kruispunten en het rapport
  zijn het binnen de dB-klasse eens op élke netlist van de corpora die de weigering beheerst (levend, A5E3VELD, de
  arm, de referentiefilters) — en over het HELE casusboek leiden de twee routes op ZESTIEN gedateerde netlists
  (V28–V50) ANDERE kruispunten af (ketenraster 143 tegen rapportraster 1600 punten; tot 5 dB op M-C), geboekt als
  benoemde lijst in de V30-vorm; en de acceptatie: élke levende netlist haalt M-C op zijn eigen kruispunten.
- `src/lib/engine2/frozenNetlistGates.test.ts` — **de V33-guard boekt sinds A5e.3c een RESOLUTIEverschil boven de
  speling bij naam** (`v33_barriere_raster.resolutie_boven_speling`, door de recorder geschreven; de guard eist dat
  de lijst precies de gemeten namen draagt en dat beide rasters op die namen hetzelfde oordeel vellen): KAND_V2_1
  (377,8 · 1948) heeft zijn minimum in een smalle W-M-overlapdip op 416 Hz, 2,5536 Ω op de sweep tegen 2,6349 op het
  verlengde veiligheidsraster — 0,081 tegen 0,052; de 2 %-tolerantie droeg het door de poort. A5e.3b sloot de
  UITGESTREKTHEID van de barrière, dit is haar RESOLUTIE (240 punten, de keuze van de app): een runparameter, dus
  een regeneratie per arm en geen guard om te versoepelen. **De V38-fix-rangclaim is voor de TWEEDE keer op dezelfde
  claim door de V47/V48-val gelopen:** A5e.3-veld ankerde haar met een COMPLEMENT ("alles wat niet levend is en niet
  de arm"), A5e.3c bevroor het A5e.3-veld-corpus, de zeven stapten het complement binnen en de rang werd 75 van 150
  — rood zonder dat de zoekmaat bewoog. Sindsdien een BENOEMDE verzameling (de families van HUIDIG tot en met V51B),
  met de tegenproef dat élke genoemde familie bestaat. **De twee A5e.3b-veldclaims zijn herankerd:** "geen levende
  positie onder de vloer" leest weer het levende veld (W-M `'drive'`, M-T `'drive-stated'`), en de (b)3-vóórmeting
  ("het gestelde getal verbiedt twee van de zeven A5e.3-veld-posities") leest de labels van het gedateerde blok
  `a5e3veld_corpus` (`A5E3VELD_KAND_1` en `_7`).
- `src/lib/engine2/casus1V2Candidates.test.ts` / `casus1V2Refusal.test.ts` — **de A5e.3b-parkeerpin is eruit**; de
  strikte vorm is terug en beide live ketenruns draaien weer (byte-reproductie op KAND-V2-1 = 377,8 · 1948, de
  verwerping op 147,9 · 1647). De meetopstelling leest `vloer_zoekdoel_bron` als `'safety-extended'` — de eerste
  regeneratie op het verlengde raster.
- `src/lib/engine2/corpusPairing.test.ts` — de A5e.3-veld-claim herankerd op `v51b → a5e3veld` (V48-vorm), en de
  A5e.3c-claim: `a5e3veld → live` heeft nul paren op label (de M-T-as verhuisde, de W-M-as verdubbelde), het levende
  corpus is tien uit ELF geleverde — de eerste regeneratie waarin de shortlist-grootte kleiner is dan het veld.
- `scripts/generate-casus1-v2-candidates.ts` — schrijft het TWAALFDE besluit (`spoel_spanwijdte_plafond_mH`, uit de
  ketenverklaring; absent mét reden) en noemt in de veldnoot de `drive-stated`-vloer; `V2_MERGE=1` is opnieuw de weg
  waarlangs een reparatie die aantoonbaar n kandidaten raakt met n herhalingen landt (A5e.4 per engine-stand: de
  herhaalde tunes reproduceerden exact tot in de evaluatietelling).

### A5e.3b-guards (de val gewogen, de vensters gesteld, drie reparaties; alleen v2-runs, corpus NIET geregenereerd)
- `src/lib/engine2/predesign/xoWindow.ts` — **de gestelde-M-C-vloer** (`'drive-stated'`): dezelfde
  A5d.3(ii)-inversie als de aandrijfvloer, op het GESTELDE getal per weg
  (`upperStatedDriveLimitDb`, door `report.ts` gevuld via `statedDriveLimitDb` — de ene regel die
  ook de poort leest). De strengste vloer bindt; op casus 1 legt −20 dB bij orde 4 de M-T-vloer op
  1647 Hz. De A5e.3-veld-regel "het gestelde getal wordt niet gelezen" is door Sander teruggedraaid
  (05-09-2026); de vloer is bewust streng (kale ladder, geen pad aangenomen — een pad op de tweeter
  kan de eis halen waar de vloer dat niet aanneemt). `goldenCasus1` rekent de inversie na en de brug
  `_excursievloer_tot_A5e3b` reproduceert met `upperStatedDriveLimitDb: null`; `casus1Field.test`
  pint het nieuwe veld (8 × 3 = 24 uit 36; de assen wisselden van rol) en `frozenNetlistGates` de
  vóórmeting (de twee 1495-posities liggen onder de nieuwe vloer — bedoeld). **De verankerde gaps
  bewegen mee** (wegbanden zijn venstercentra): 0,85 → 0,777 en 3,516 → 3,426, met
  `_waarden_veld_tot_A5e3b` als brug; de GEDATEERDE gepoorte bruggen worden sindsdien expliciet
  ZONDER het gestelde getal herrekend (recorder én goldenCasus1) — een gedateerd blok wordt niet
  stil herschreven.
- `src/lib/engine2/optimizer/chainChoices.ts` + `bounds.ts` — **de VIERDE ketensleutel
  `lowestWayCoilMaxHenry`** (3 → 4): de spanwijdte van de gestelde spoelfamilie van de laagste weg
  (`rangeH[1]` van de fit, 22,0 mH op casus 1) als plafond op élke vrije spoel van die weg — in de
  synthese (Slot.maxValue + geklemde initial, `SynthesizeOptions.coilMaxHenry`) én in de zoekdoos
  (`searchBoxFor`'s `catalog`-parameter, rule `'catalog-span-l'`; de TODO(A5e.3) is vervuld — de
  spanwijdte-helft van A5d.6's slotregel). Afgeleid zodra het DCR-model gewapend is; de STAPEL is
  een gestelde uitzondering (`coilStackAllowed` → absent mét die reden), default gecapt. Geen
  W-M-vloer hiervan: de val schaalt niet met het kruispunt. Per-spoel en nooit een som (twee
  spoelen in serie zijn precies de stapel waar de uitzondering over gaat).
  **`netOptimizer.ts` klemt sinds A5e.3b ook een plafond BOVEN de zachte rand** (`capLg`): tot
  A5e.3b werd een `valueCeilings`-plafond alleen toegepast als het binnen het zachte venster lag,
  en de zachte spoelrand (15 mH) is een STRAF en geen klem — gemeten: 31,59 mH geleverd door een
  hard plafond van 22,0. De zachte straf eronder blijft (de doos wordt niet verruimd); de
  byte-baselines reproduceren (geen bestaand plafond lag boven een zachte rand).
- `src/lib/netOptimizer.ts` + `candidateDeclaration.ts` — **(c)2: `zFloorBarrierSource` kent een
  vierde waarde, `'safety-extended'`** (veiligheidsraster + de eigen punten van het poortraster
  buiten diens uitgestrektheid; `extendGridToSweepExtent`, één constructie met drie lezers: term,
  guard, recorder). De verklaring leidt hem af waar zij `'safety'` afleidde; `'safety'` blijft
  stelbaar (de gedateerde A5e.3-veld-run blijft een run die je kunt vragen), en ontbrekende data
  valt luid stil (V32-regel). Gemeten op de zeven: alleen KAND_V2_2 beweegt (2,85 → 2,55 Ω), geen
  oordeel wijkt af, het opslinger-plafond beweegt niet. De V33-guard in `frozenNetlistGates` meet
  sindsdien op het verlengde raster; `minimum_buiten_barriere_uitgestrektheid` is per constructie
  leeg (geen open punt meer) en de oude lezing staat als brug
  (`v33_barriere_raster._veiligheidsraster_tot_A5e3b`).
- `src/lib/levelWork.ts` 1.1 → 1.2 — **(c)3: `resonancelessShunts`** (een shunt-keten van de bus
  naar massa met een L en zonder C — de wees van een val waarvan de audit de C verwijderde; geen
  resonantie = een belasting, geen filterelement) en élke pad-verbiedende regel weigert erop; de
  worker-weigering van A5e.3-veld vuurt er nu ook op (V31). Op een hoogdoorlaatweg is de
  ladder-shunt-L dezelfde vorm en legitiem: de inventaris benoemt, het oordeel is aan de gestelde
  regel gebonden (die over de laagste weg gaat, wiens legitieme shunts allemaal een C dragen).
  Gemeten: DRIE van de zeven dragen er een (KAND_V2_1/_2/_7) — boekhouding in
  `v51_niveauwerk.per_netlist[].resonantieloze_shunts` die bij de regeneratie leeg hoort te raken,
  met de consistentie-guard in `frozenNetlistGates` (fresh = recorded, en een falend oordeel heeft
  de wees als enige grond).
- **DE TWEE LIVE KETENRUNS ZIJN GEDATEERD GEPARKEERD** (`casus1V2Candidates` [bytes],
  `casus1V2Refusal` [live]): hun kandidaat bestaat niet meer in het A5e.3b-veld en de route zou
  drie van de zeven nu zelf weigeren. Beide trekken zich terug MET EEN PIN — de opgenomen kandidaat
  moet in het GEDATEERDE veld bestaan (gereproduceerd door `maxDriveOnFsDbByDriver` uit de
  rapportinstellingen weg te laten); elke andere velddrift faalt nog steeds. Zij komen tot leven
  bij de eerstvolgende regeneratie (de volgende sessie, mét Sanders keuze uit de ablatietabel);
  tot die tijd is de volle suite navenant korter én bewijst hij navenant minder.
- `measure-a5e3-nad-floor.ts` — **(c)1**: een lege werklijst resolvet nu meteen (bestaande
  armbestanden worden gelezen en gerapporteerd; tot A5e.3b wachtte de promise eeuwig op een kind
  dat nooit gestart werd).
- `record-casus1-m1-references.ts` — **idempotent op `breakups_opmerking`** (de zin wordt gestript
  en één keer geschreven; hij stond er al twee keer) en de gedateerde bruggen lopen zonder het
  gestelde getal. LET OP: de sectie-4-bruggen (`kandidaten.*._gepoort_tot_M1`) waren al vóór
  A5e.3b door een herhaalde run met live waarden overschreven — losse taak, niet hier gerepareerd.

### A5e.3-guards (de DCR van elke continue spoel uit de catalogusfit; alleen v2-runs)
- `src/lib/coilDcr.ts` — **één huis, één functie, tien lezers.** `fitCoilDcrFamilies` fit per (merk, serie,
  draaddikte) `DCR = A·(L/mH)^k` op de SKU-DCR van de catalogus (log-log, `coil-dcr-fit/1.0`); `dcrOf(henry, fit)`
  is DE lezing en geeft `{ ohm, inRange }` — buiten het enkel-onderdeel-bereik wordt de machtswet VOORTGEZET en
  gevlagd, nooit op nul gezet (een DCR die aan de rand wegvalt beloont de zoektocht voor het verlaten van de
  catalogus; boven het grootste onderdeel is een stapel). `stampCoilDcr` zet de `DCR`-param op elke aanwezige,
  niet-gesnapte spoel — serie én SHUNT (`waysOfElements`: van elk element door niet-massa-, niet-busknopen tot een
  busknoop) — en `crossoverToNetlist` is de ene lezer van die param, dus solver, `dcSeriesR`, barrière, box
  (`fixedSI`/`pathRBaseOhm`), `levelWork`, audit, poorten en rapport lezen één getal. De familie per weg is
  GESTELD (manifest `driverkaart.spoelfamilie.per_weg`, het veld "coil family" per weg in het A5a-meetblok),
  nergens een default (P6); een weg zonder familie houdt verliesvrije spoelen en wordt bij naam gemeld. Het model
  (`CoilDcrModel`) draagt de fits IN de waarde (V51b-regel) en is daarmee reproduceerbaar zonder de catalogus.
- `src/lib/coilDcr.test.ts` — twaalf claims: de exacte machtswet met residu nul en een handberekening; de 25
  families van v8 (k ∈ (0,5, 0,7) op lucht, de 1,4 mm-fit binnen 10 % van `coilDcr(1.4)`); **élke SKU binnen het
  maximale residu van zijn familie** (de snap-continuïteitsclaim); de familie-gebonden snap met de 25 %-terugval;
  serie- én shuntspoelen aan hun weg; stempel idempotent, gesnapt blijft, een gedeelde spoel leest de laagste
  DCR; buiten bereik voortgezet en continu aan de rand; de afleiding in vier toestanden (model / geen catalogus /
  onbekende familie / niets, met P4); de vingerafdruk beweegt met familie ÉN fitgetallen.
- `src/lib/engine2/optimizer/coilDcrRoute.test.ts` — twee ketenruns op de kleine fixture (47 s): P2 zonder model;
  het model BEREIKT de zoektocht (de inducties zelf bewegen, V23); één implementatie (elke geleverde spoel draagt
  `roundDcr(dcrOf(L_geschreven))`, de niveauwerk-inventaris hetzelfde, het `stated-series-r`-bound is op een
  GESTEMPELD zaad opgelost); en een poort leest de param. **De test loopt op een maximum van 2,0 Ω, en dat is een
  gemeten bevinding:** op 1,0 Ω wordt de gemodelleerde arm op `topology` geweigerd met 1,005 Ω PUUR koper — onder
  `series-r-max` bindt de DCR zelf, en de box heeft daar alleen via het opslingeringsbudget grip op.
- `choices.ts` / `choiceKeyGuard.test.ts` — `coilDcrModel` is CHOICE (35/5/11, 51 sleutels), de derde zonder
  polish-tweeling; `candidateDeclaration.ts` leidt hem af uit `coilDcrFamilyByWay` + `coilDcrFits` en verklaart
  anders ABSENT met reden. `casus1V2Declaration` wapent het model ALLEEN als `driverkaart.spoelfamilie.gesteld_door`
  gevuld is (`CASUS1_COIL_DCR.stated`) of de aanroeper `{ coilDcr: true }` vraagt (de scripts en de arm) — zolang
  het blok een VOORSTEL is verandert de route niets en blijft het lege corpus wat het is.
- `netOptimizer.ts` — het zaad wordt bij binnenkomst gestempeld, `refreshDcr` leest elke vrije spoel per evaluatie
  af, de somgroepen dragen `coilIds`/`seedCoilDcrOhm` zodat de zaad-DCR in `fixedSI` en `pathRBaseOhm` door de
  levende som vervangen wordt, en het terugschrijven zet de DCR van de GESCHREVEN mH in de param (anders lag de
  lezer één cijfer naast de schrijver — nagemeten: 0,5588 tegen 0,5589). `pickCandidates(…, only)` snapt binnen de
  familie. Alles achter `opts.coilDcrModel`; afwezig = P2 (`f4cRegression`, `workerRouteRegression` reproduceren).

### V51b-guards (serieweerstand op de laagste weg tot een gesteld maximum, geen pad)
- `src/lib/levelWork.ts` — **het ene huis draagt sinds V51b de EIS als type** (`LowestWayLevelWork`:
  `'allowed' | 'none' | { kind: 'series-r-max', maxOhm }`) en de inventaris telt de DCR van de
  seriespoelen APART naast de discrete weerstanden (`seriesCoils`, `dcrOhm`, `totalSeriesOhm`;
  `level-work/1.1`, de vorm groeide, geen getal bewoog). `levelWorkVerdict` is de ENE vergelijking met
  drie lezers (worker, rapport, recorder): onder `'none'` blijft DCR wat overblijft en is geen
  niveauwerk; onder `series-r-max` oordeelt het TOTAAL, want een luchtspoel met 1 Ω DCR ís fysisch een
  serieweerstand van 1 Ω en een regel die alleen het discrete deel telde zou gehaald worden door de ohm
  in het koper te leggen. Welke van de twee de ohm draagt is een BOUWKEUZE — het rapport zegt dat, de
  engine besluit het niet. Het getal reist IN de sleutelwaarde en niet als vierde ketensleutel: een
  modus zonder maximum en een maximum zonder modus betekenen elk niets, en twee sleutels die het eens
  moeten zijn zijn een paar dat het oneens kan zijn (`chainChoices`/`choiceKeyGuard` pinnen de lijst op
  drie, ongewijzigd).
- `src/lib/levelWork.test.ts` — +1 claim: 0,5 Ω discreet achter een spoel met 0,6 Ω DCR is 1,1 Ω voor
  de driver en overschrijdt een maximum van 1,0 hoewel het discrete deel alleen zou slagen; een
  shunt-pad faalt de eis ongeacht de som; dezelfde spoel alleen is onder `'none'` `none`.
- `src/lib/engine2/optimizer/lowestWayLevelWork.test.ts` — **vijf V51b-claims naast de zes van V51.**
  (1) De afleiding: een gesteld maximum verklaart `series-r-max` en WINT van het verbod (de smallere
  uitspraak; `declareCandidateChainChoices({ lowestWaySeriesRMaxOhm })`), een expliciete waarde wint
  van beide, uit niets komt niets, en het GETAL beweegt de vingerafdruk en niet alleen de modus.
  (2) De box: een `stated-series-r`-grens neemt de `qes-series-r`-vorm van `searchBoxFor` — spoel-DCR
  eerst van het maximum af, de vrije weerstanden delen de rest (per-onderdeel-plafond 1,0 − 0,3 = 0,7 op
  het papieren netwerk), een weg zonder vrije serie-R krijgt de notitie. (3) Zij BEREIKT de synthese
  (V23): op de fixture met de woofer 6 dB opgetild levert de gecapte arm ÉÉN kale serie-R op de laagste
  weg binnen het maximum, geen shunt-pad, en een ander netwerk dan de `'none'`- én de `'allowed'`-arm;
  de kolom draagt het maximum en een slagend oordeel, de grens staat in `bounds`, en zonder gestelde
  vloer wordt Y niet opgelost (P2). (4) **Y MET DE HAND**: op een papieren netwerk met vlakke resistieve
  drivers (woofer 4 Ω achter 1 mH, tweeter 8 Ω achter 10 µF) is het systeemminimum de 4 Ω van de woofer,
  en de probe vindt voor een vloer van 6 Ω exact 0,98 · 6 − 4 = 1,88 Ω extra (de eigen tolerantie van
  `meetsAmpFloor`), 0 voor een vloer die al gehaald is, en voor een vloer boven de 8 Ω van de tweeter
  de REDEN in plaats van een getal ("het minimum zit in een andere weg"). (5) Y op de route: een vloer
  die de gecapte fixture niet haalt weigert via de poort (`kinds` bevat `gate`), de geweigerde tune bleef
  binnen de box, en de kolom zegt wat de probe vond — op deze fixture (woofer en mid zijn hetzelfde
  driverbestand) dat het minimum niet in de woofer zit, en dan komt `topology` NIET bij de weigering, want
  de cap is dan niet wat tussen de kandidaat en de vloer staat; een vloer die wél gehaald wordt weigert
  niets en Y is het geleverde totaal. **De probe zegt bij `null` altijd waarom** (onoplosbaar netwerk,
  geen bus, of buiten het bereik van 20 Ω met de gemeten minima erbij: "het minimum zit in een andere
  weg") — de eerste versie gaf een kale `null`, en het eerste V51b-veld kon daardoor niet zeggen welk
  van de drie het was. Gemeten: de vijf claims 162–165 s (vier ketenruns op de kleine fixture). **En de
  synthese stelt de kale serie-R ALTIJD voor zodra de regel hem toestaat**, niet alleen als de trim
  onder de −0,5 dB-drempel van de L-pad komt: het eerste V51b-veld gaf de vijf 396,7-kandidaten géén
  weerstand (hun trim bleef erboven) en alle vijf strandden op de vloer met niets om haar mee op te
  tillen — een weerstand die de tune niet nodig heeft snoeit de audit zelf weg.
- `src/lib/engine2/optimizer/worker.ts` — **drie weigeringsvormen onder de gecapte regel, alle drie
  V31.** (a) Het geleverde netwerk OVERSCHRIJDT de regel (`levelWorkVerdict.ok === false`: een pad, of
  een totaal boven het maximum — wat alleen kan door een DCR die de box niet zag, bv. een catalogus-snap
  ná de box, of een pad dat de synthese niet mocht leggen): `by: 'stated-topology'`, `kinds: ['topology']`,
  een bevinding over de reparatie. **SINDS A5e.3-veld vuurt (a) óók onder `'none'`:** tot dan vuurde hij
  alleen onder het maximum en vertrouwde het verbod erop dat de synthese geen pad legt en de tuner geen
  weerstand maakt — allebei waar, en toch leverde het A5e.3-veld `229,1 · 1994,6` met R10 (3,51 Ω van de
  wooferbus naar massa, een WEES van de onderdelenaudit: de R van een gedempte val waarvan L en C
  verwijderd zijn), `ok: false`, DEFECT in de notities, en geleverd omdat het rimpeldoel gehaald was. Een
  verbod dat alleen vlagt is geen verbod (V31). (b) De rimpeldoel-weigering van V51 vuurt onder `series-r-max` alleen
  als het geleverde netwerk AAN de cap staat: een gemiste rimpel met ruimte onder de cap is van de tuner
  en niet van de regel. (c) Een vloerweigering van de poort krijgt Y erbij (`floorNeedsSeriesOhm`,
  `floorOhm` in de kolom) en — alleen als Y boven het maximum ligt, of de regel `'none'` is — `topology`
  als tweede kind plus de zin "asks Y Ω of series resistance on the lowest way against a stated maximum
  of M Ω": twee regels waren betrokken en `kinds` zegt dat. Y wordt op het GEWEIGERDE netwerk gemeten
  (`rejectedParts`, V31) met een weerstand aan de KOP van de weg (`withSeriesResistanceInFront`: één
  knoop erbij tussen de hete generatorknoop en het eerste serie-element dat alleen deze weg voedt — daar
  zitten een discrete serieweerstand en de DCR van de eerste spoel fysiek) en geoordeeld door dezelfde
  M-B/|Z|-poort (`evaluateGates`, tolerantie erin) — nooit een tweede afleiding (A3g). **De eerste
  versie zette de weerstand direct VÓÓR DE DRIVER, achter de shunt-C van de laagdoorlaat, en dat is
  gemeten vóór het opgeschreven is: op élke casus-1-netlist onder de vloer ZAKTE het systeemminimum
  ermee (V30_KAND_1: 2,447 → 1,102 Ω met 20 Ω "ervoor") — een ladder waarvan de afsluiting resistief
  wordt gemaakt resoneert in zijn eigen shunt-C.** Aan de kop tilt hij de hele weg op; alleen als geen
  serie-element exclusief van de weg is valt hij terug op de driverklem, want een gedeelde kop is niet
  "op de laagste weg". Bereik 20 Ω, 24 bisectiestappen (P6-OK: probegrenzen, geen
  projectgetal). Alleen waar een vloer én een regel gesteld zijn; elke andere run doet geen enkele extra
  oplossing (P2 — de byte-baselines van `f4cRegression` en `workerRouteRegression` reproduceren).
  De inventaris in de kolom is op een weigering die van het GEWEIGERDE netwerk en niet van het zaad.
- `src/lib/engine2/optimizer/bounds.ts` — `InvertedBound.rule` kent `'stated-series-r'`: geen inversie
  maar het gestelde maximum zelf, in de vorm van een inversie gefiled omdat het dezelfde som begrenst.
  De worker filet hem VÓÓR `searchBoxFor` zodat de tuner erbinnen zoekt in plaats van aan het eind
  geweigerd te worden; de geleverde-netwerk-toets leest daarnaast het totaal, want een box op de
  weerstanden van het zaad ziet geen DCR die later bijkomt.
- `src/lib/engine2/frozenNetlistGates.test.ts` — de V51-blokken lezen sinds V51b de REGEL in plaats
  van `'none'` (`CASUS1_LOWEST_WAY_LEVEL_WORK`, uit `casus1LowestWayLevelWorkRule`: maximum gesteld →
  `series-r-max`, anders het verbod, anders niets), het levende corpus moet onder de gecapte regel geen
  shunt-pad dragen en een totaal ≤ maximum (`verdict.ok`), en het opgeschreven blok reproduceert ook
  `serie_R_totaal_ohm`, `spoel_DCR_ohm` en `binnen_eis`. **Nieuw blok: DE SANITY** — HUIDIG draagt
  R8 3,30 Ω plus 0,46 Ω spoelkoper (V45's 3,756 Ω padweerstand) en valt dus BUITEN de eis, en dat is
  bedoeld: HUIDIG is de parallelle referentie MET pad; het rapport VLAGT (`FLAG (no gate)`) en geen
  enkel poortoordeel beweegt, en de recorder noemt alle drie de referentiefilters onder
  `referentiefilters_buiten_eis`. Geen versoepeling (V42-les).
- `src/lib/engine2/casus1V2Candidates.test.ts` — de meetopstelling leest `niveauwerk_laagste_weg` als
  de REGEL (string of object) en eist onder de gecapte regel de zin met het maximum en "DCR".
- **Het manifest**: `gestelde_eisen.max_serie_R_laagste_weg_ohm: 1,0` (gesteld door Sander, V51b) naast
  `geen_niveauwerk_op_laagste_weg: true` — dat laatste blijft staan, want de pad-verboden gelden nog;
  `casus1LowestWayLevelWorkRule` maakt er de effectieve regel van. Het getal staat DAAR en nergens anders
  (P6); in de app is het het veld "Max series R on lowest way (Ω)" dat verschijnt zodra de selectie op
  "series R up to a maximum, no pad" staat, en zonder getal leest de toestand als niet gesteld (P4, met
  een waarschuwing in het formulier).

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
`test-fixtures/casus1/KAND-V2-*.adsfilter.json` zijn de v2-kandidaten die de shortlist haalden — **TIEN sinds C-2
(08-09-2026), de LAATSTE regeneratie van casus 1: het veld van 16 (8 × 2 uit 22, budget 16, tweezijdige kooien)
leverde er elf, waarvan de shortlist er tien bevroor; vijf geweigerd (vier op `topology`, één op `budget` — de
eerste M-D-weigering in dit boek waar de zoekdoos de zoektocht er niet vandaan hield, want het A5d.6-plafond is
sinds C-2 ZACHT). Élke geleverde netlist draagt 4,5–20,8 mH seriespoel op de laagste weg tegen een plafond van
2,5–3,2 mH, en M-D houdt op alle tien (opslingering −1,41..+1,16 dB tegen een budget van 1,4). Het vorige corpus
staat als `A5E3C-KAND-*` — daarvoor **TIEN sinds A5e.3c
(06-09-2026): het veld van 24 op de A5e.3b-grenzen (M-T-vloer 1647 Hz `drive-stated`, spanwijdte-cap 22,0 mH,
barrière `safety-extended`, level-work/1.2) leverde er veertien, waarvan drie na de A5e.3c-weigering op de eigen
kruispunten (M-C tweeter −19,6..−19,9 tegen −20 op de passbands van het geleverde netwerk, waar het zaad −20,10..−20,19
las) opnieuw gedraaid en geweigerd zijn; van de elf bevroor de shortlist er tien (`DEFAULT_SHORTLIST_SIZE`) — 549,7 · 2304
is geleverd en niet bevroren. De twee live ketenruns draaien weer (byte-reproductie op KAND-V2-1 = 377,8 · 1948, de
verwerping op 147,9 · 1647)** — daarvoor **ZEVEN sinds A5e.3-veld, en SINDS A5e.3b (05-09-2026) stonden zij ACHTER op de engine: de M-T-vloer verhuisde naar 1647 Hz (twee van de zeven posities liggen eronder), de route weigert drie van de zeven op de L+R-wees (level-work/1.2), en de twee live ketenruns waren gedateerd geparkeerd tot de regeneratie** —
**ZEVEN sinds A5e.3-veld (04-09-2026): het veld van twintig (orde 4 gesteld, de aandrijfvloer op 148 Hz, budget 24) leverde er acht, waarvan één (229,1 · 1994,6, R10) na de worker-reparatie opnieuw gedraaid en geweigerd is; de laagste W-M-positie en elke 1294-positie zijn weg** — daarvoor **NUL sinds M-1
(04-09-2026): het veld van 115 leverde niets, het levende corpus is LEEG, de recorder snoeide de blokken en
de zes V51b-bestanden zijn met de hand verwijderd (byte-identiek aan `V51B-KAND-*`, nagemeten met `cmp`); de
suite eist dat manifest, schijf en herkomst het daarover eens zijn en de live byte-reproductie stopt met
de bevinding in plaats van op een ontbrekend bestand** —
negen bij F4d, tien vanaf V28, acht sinds V41, vier bij V42, zeven sinds V43, zeven na de V44- en
de V45-regeneratie, vier bij V47, vijf bij V48, zeven bij V47b en V50, ÉÉN bij V51 (veertien van
vijftien verworpen: dertien op de versterkervloer, één op de mid-excursiegrens — zonder wooferpad
ontbreekt de serieweerstand die de impedantiebodem optilde), **en ZES sinds V51b** (serieweerstand tot
1,0 Ω op de laagste weg toegestaan: negen van de dertien vloerweigeringen komen erboven, zes worden
geleverd en drie strandden daarna op M-C; vier halen de vloer ook met 20 Ω niet, want hun minimum zit in
de mid- en tweetertak) — bevroren als bestanden
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

**Sinds C-2 zijn het er TWEEËNTWINTIG corpora plus TWEE gedateerde HERKOMSTEN, en dat is opzet.** `KAND_V2_*` is het levende corpus (het C-2-veld: tien netlists). `A5E3C_KAND_*` is het A5e.3c-corpus van tien, bevroren vóór C-2 — toen de A5d.6-inversie nog als KOOI om de zoekdoos lag (E-4 mat 69 van 161 netlists boven hun plafond én binnen hun budget, nul andersom), de barrière het verlengde veiligheidsraster ZONDER verdichting las (twee van 161 boven de vloerspeling, beide op een dip smaller dan één rastercel) en de posities met EENZIJDIGE kooien op de vensterranden lagen (8 × 3 = 24 uit 36, budget 24); `casus1_a5e3c_herkomst.json` bewaart die run zelf, want elf geleverd tegen tien bevroren is een feit over de RUN dat de netlists niet dragen. `A5E3VELD_KAND_*` is het A5e.3-veld-corpus van zeven, bevroren vóór A5e.3c — toen de M-T-as nog op k·f_s (1294 Hz) stond en het gestelde tweetergetal niet als vensterinvoer werd gelezen, spoelen op de laagste weg boven de spanwijdte van de gestelde familie 'gevlagd en doorgezet' werden (22–36 mH in de val van vijf van de zeven), de barrière het veiligheidsraster vanaf 20,5 Hz las en niet de sweepbodem (KAND_V2_2: 2,55 Ω op 10,07 Hz waar de barrière 2,85 las), en een L+R-shunt zonder C niet als pad gold (drie van de zeven dragen er een): de vier grenzen die A5e.3b sloot en waarop A5e.3c het veld opnieuw opwekte. `A5E3ARM_KAND_1` is het geleverde netwerk van de arm `m1+dcr` — één netlist, geregistreerd met `scripts/register-a5e3-arm.ts` omdat het M-1-corpus LEEG was en er niets te bevriezen viel; de M-1-boekhouding zelf (115 uitkomsten, geen bestanden) staat als `casus1_m1_herkomst.json` (corpus-id `m1`, `DATED_HERKOMST`). 
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
identiek aan het V49-corpus, want V50 bewoog het veld niet (V51); `V51_KAND_*` (ÉÉN netlist) toen de
laagste weg GEEN serieweerstand mocht dragen — van vijftien kandidaten overleefde er een, dertien
strandden op de versterkervloer (2,05–2,49 Ω tegen 2,60) en een op de mid-excursie, want zonder
wooferpad ontbrak de serieweerstand die de impedantiebodem boven de vloer hield; V51b stelt de
variant `max_serie_R_laagste_weg_ohm: 1,0` (serieweerstand tot 1,0 Ω TOTAAL, discrete R plus
spoel-DCR, geen pad — DCR-schaal, geen verzwakking) en wekt het veld opnieuw op (V51b); `V51B_KAND_*`
(ZES netlists) toen de v2-route nog op de GEPOORTE meetset van 22-08-2026 liep — gate-vloer 396,7 Hz op
woofers, mid en tweeter tegelijk, W-M-venster 397–549 Hz op meetgeldigheid, orde 4 gesteld op beide
overnames, basplateau −2,5 dB gesteld omdat het niet te meten was, en de laagste weg mocht serieweerstand
tot 1,0 Ω dragen; M-1 leest Sanders NF/FF-gemergede woofers (20,5 Hz) en de op dezelfde manier gemergede
mid (60 Hz), zet het plateau op 0 dB, trekt het serie-R-maximum in en laat het W-M-veld over het geopende
venster (124–550 Hz) lopen met LR4 én LR2 (M-1).
Alle zeventien de gedateerde corpora zijn byte-identieke bestanden onder een andere naam, met hun
klasse-B-blokken mee, bewaard als de "vóór"-helften van hun vergelijkingen. Wie
een script schrijft dat het levende corpus opruimt gebruikt `^KAND_V2_\d+$` en nooit
`startsWith('KAND_V2')`: die tweede slikt de gedateerde corpora mee en gooit het bewijsmateriaal weg.
`record-casus1-v2-references.ts` en `casus1V2Candidates.test.ts` dragen die regel expliciet;
`goldenClassification.test.ts` is er sinds V33 vanaf — daar geldt de structurele regel dat élke
genoemde netlist die geen v1-baseline is een geclassificeerd blok moet hebben, omdat de
familielijst die er stond bij V32 vergeten is. De koppeling bestandsnaam ↔ kandidaat staat in
`manifest_en_geometrie.v30_corpus`, `.v32_corpus`, `.v33_sweep_corpus`, `.v33_corpus`,
`.v34_corpus`, `.v37_corpus`, `.v38fix_corpus`, `.v41_corpus`, `.v42_corpus`, `.v43_corpus`,
`.v44_corpus`, `.v45_corpus`, `.v47_corpus`, `.v48_corpus`, `.v49_corpus`, `.v50_corpus`, `.v51_corpus`, `.v51b_corpus`, `.a5e3_arm_corpus` en `.a5e3veld_corpus`, want zij
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
