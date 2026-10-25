# U-9 fase 0 — Veldinventaris door meting

*25-10-2026. Alleen meting, geen wijziging: er is niets verborgen, verplaatst of gemarkeerd. Er draaide geen suite en geen browser naast de meting.*

## Hoe er gemeten is

**Opnieuw te draaien:** `npx vite-node scripts/measure-u9-field-effects.ts` (seconden, geen ketenrun, geen tune). Het script schrijft `test-fixtures/u9_field_effects.json`, met 569 metingen en nul fouten.

**(a) Payload.** Het script bouwt het v2-verzoek zoals de app het bouwt: het veld via `fieldModeSettings`, `pairDerivationInputs` en de gestelde kruisingen; de verklaring via `candidateDeclarationFor` en `declareCandidateChainChoices`; het v2-blok via `v2RunSettingsFor`. Dat verzoek gaat door de échte `handleV2Request`. Een observator op `runThreeWayChain` en `runDesignChain` (de M-1-techniek) legt vast wat de keten binnenkrijgt **ná** alle `withDeclared*`-overschrijvingen. Ook legt hij vast wat de tuner krijgt **ná** de hook die de verklaring als laatste spreidt. Daarna gooit hij een fout, zodat er niets getuned wordt.

Vergeleken worden vier dingen:
- wat de ontwerpstap en de synthese lezen;
- wat de tuner leest (op de drieweg gelezen uit de bron van `threeWayChain.ts`, op de tweeweg via de geëxporteerde `designStepOptions` en `assembledTuneOptions`);
- het v2-blok (poorten, budgetten, determinisme);
- `candidateFieldKey`.

**De app-literals.** De twee literals van de keteninstellingen in `App.tsx` staan als spiegel in het script. Een bronscan leest de sleutelverzameling van beide literals bij elke run en stopt bij drift.

**(b) Rapport.** Dit is `buildReport` via `buildEngineV2Input`, het app-pad, op beide KOAN-demobundels. Elke bundel draait zowel zonder als mét een geladen netlist (casus 1 `KAND-V2-1` en casus 1b `KAND-V2-1`). Gesplitst wordt naar:
- vensters (= het veld, dus ZOEKT);
- de gemeten feiten die `factsForWorker` naar het verzoek stuurt (ZOEKT);
- het excursieplafond (bereikt het verzoek ook via de verklaring);
- poorten;
- metrieken;
- de rest.

**(c) Ketenruns** waren niet nodig: elk veld is met (a), (b) of een statische trace beslecht.

**Fixtures.**

| route | fixture |
|---|---|
| 3W | casus 1 (`'m3'`) |
| 2W | casus 1b |
| HybG | casus 1h (gemeten vorm) |
| HybM | statisch. De magere vorm loopt door dezelfde `v2ChainOne`/`designChain` als 2W, met alleen het `unmeasured`-merk erbij. Elk veld dat hier gemeten is gedraagt zich op HybM als op 2W, tenzij anders vermeld. |
| Terugval | statisch: geen A5d.3-venster, dus het v1-generatorveld zonder kandidaatverklaring. Daar zijn alle `withDeclared*` de identiteit. |

**Klassen.**
- **Z** = ZOEKT;
- **O** = OORDEELT;
- **T** = TOONT;
- **N** = NIETS;
- **N\*** = NIETS alléén zolang de ouder niet gezet is. Dat is **geen** NIETS-veld (startprompt, punt 5).

"m" = gemeten, "s" = statische trace. De route-kolom leest 3W / 2W / HybG; een enkel teken geldt voor alle drie.

## De tabel

### 1. Project/Import en metingslots

| # | Veld | Registerrij | Trace | Gemeten effect | Klasse | Ouder | Zichtbaar G / E | Voorstel | Bekend |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 0°-respons per weg (bestand) | `responses` | parseFrd → ingest → vensters → veld | s | Z | — | G stap 2 / E | behouden | I-1 |
| 2 | Hoekenset per weg (bestanden) | **geen** | offAxis → directiviteitsplafond (venster); 3W `diAnchorHz` + `angleData` | s | Z | — | G / E | registerrij toevoegen | **nieuw** |
| 3 | Impedantie per weg (bestand) | `impedance` | parseZma → f_s, R_e, poortraster, M-B, M-C | s | Z | — | G / E | behouden | I-1 |
| 4 | Nabij veld conus (bestand) | `nearFieldCone` | merge → geldigheidsvloer; feit `nearFieldByModel` → M-D-grens | s | Z | — | E (meer) | behouden | I-2 |
| 5 | Nabij veld poort + poortdiameter + gedeeld door | `nearFieldPort` | Keele-weging in de merge | s | Z | conus-merge | E (meer) | behouden | I-2 |
| 6 | Splice-band onder/boven | `spliceBand` | niveau-/vertragingsfit van de merge | s | Z | conus-merge geaccepteerd | E (meer) | behouden | I-2 |
| 7 | Stapmodel aan/uit (`stepOn`) | **geen** | minimumfase-shelf in de merge | s | Z | conus-merge | E (meer) | registerrij toevoegen | **nieuw** |
| 8 | Valid from | `mergeValidFrom` | blok → geldigheidsvloer | s | Z | merge | E (meer) | behouden | I-2 |
| 9 | Bestandsnotitie (tekst per bestand) | **geen** | provenance, opgeslagen | s | T | — | E | behouden (geen invoer voor de run) | — |
| 10 | Catalogus importeren / catalogusbeheer (SKU- en seriëformulier, ±24 velden, aan/uit per serie) | **geen** | catalogus → spoelfamilie-fits (DCR-model) en snap | s | Z | — | E | behouden; buiten het register (beheer) | — |
| 11 | Filter/VituixCAD-import, variantkeuze (`xoName`), ontwerpkeuze, projectlaad | **geen** | bepaalt welk netwerk het rapport oordeelt | s | O | — | E | behouden (navigatie) | — |
| 12 | Verificatie-/referentiebestand | **geen** | grafiekoverlay | s | T | — | E | behouden | — |

### 2. Setup → kast & meting (bestuurd formulier)

| # | Veld | Registerrij | Trace | Gemeten effect (rapport, demo ± netwerk) | Klasse | Ouder | Zichtbaar G / E | Voorstel | Bekend |
|---|---|---|---|---|---|---|---|---|---|
| 13 | Microfoonafstand | `micDistance` | v1 ver-veldverhouding; route 2 alleen samen met aandrijfspanning + kaart | m: N alleen; met route 2 → O | T (O met ouder) | aandrijfspanning | G / E | behouden | U-3b |
| 14 | Microfoonelevatie | `micElevation` | v1 off-axis hoek | m: N | T | — | E (meer) | behouden | U-3b |
| 15 | Gebruikte gate (ms) | `gateOverride` | v1 datavloer van een vensterloos bestand | m: N (demobestanden dragen een venster) | T | bestand zonder venster | conditioneel | behouden | U-3b |
| 16 | Referentiedriver | `refDriver` | oorsprong van de getypte posities | m: N | T | — | G / E | behouden | U-3b |
| 17 | Kastbreedte | `baffle-width` | baffle step → overgang van de doelcurve | m: N onder vlak; **O** onder plateau-voicing | O | doelcurve ≠ vlak | G / E | behouden (registerclaim "nodig" is te sterk) | gedeeltelijk V45 |
| 18 | Frontpaneelhoogte | `baffleHeight` | tekening, floor-bounce | m: N | T | — | G / E | behouden | U-3b |
| 19 | Kastdiepte | `cabinetDepth` | breedte van een zijpaneel-driver | m: N | T | driver op zijpaneel | conditioneel | behouden | U-3b |
| 20 | Referentiepunt (vanaf boven, hoogte) | `referencePoint` | tekening, floor-bounce; v2 leest de opgeslagen y direct | m: N | T | — | G / E | behouden | U-3b |
| 21 | Luisterpositie (afstand, oorhoogte) | `listeningPosition` | zithoek (v1) | m: N | T | — | E (meer) | behouden | U-3b |

### 3. Setup → driverkaart (bestuurd formulier)

| # | Veld | Registerrij | Trace | Gemeten effect | Klasse | Ouder | Zichtbaar G / E | Voorstel | Bekend |
|---|---|---|---|---|---|---|---|---|---|
| 22 | Positie y | `positions` | geometry.verticalMm → lobingzones → vensters | m: Z (vensters) | Z | — | G / E | behouden | I-1 |
| 23 | Positie x | `positions` | v1 baffle/diffractie, tekening | s | T | — | G / E | behouden | — |
| 24 | Aantal drivers | `sourceCount` | sourceCount → lobingfracties (M-F) | m: O (3W mét netwerk) | O | netwerk geladen | G / E | behouden | U-3b |
| 25 | Tussenafstand | `sourceCount` | arraySpacingMm | m: O mét aantal > 1 | O | aantal > 1 | G / E | behouden | U-3b |
| 26 | Facing / diepte / tilt / tegengesteld | `mounting` | v1 off-axis; diepte → DSP-startwaarde (alleen magere hybride) | m: N (rapport) | T | — | E (meer) | behouden | U-3b |
| 27 | Behuizing (select) | `chamber` | v1 waarschuwing | m: N | T | — | E (meer) | behouden | U-3b |
| 28 | f_b (lage driver) | `chamber` | **`audit.fbHz` → ontwerpstap (2W) en tuner** | m: **Z** op 3W/2W/HybG | Z | — | E (meer) | registerrij corrigeren | **nieuw** |
| 29 | S_d | `sd` | engine2: alleen M-C route 2 + excursiekaart; v1: beaming/excursievloer (v1-tabel) | m: N op beide demo's (± netwerk) | O* / T | route 2 (aandrijfspanning + mic) | G / E | **registerclaim corrigeren** (zie N4) | **nieuw** |
| 30 | X_max | `xmaxMm` | kaart → excursieplafond → feit + `driveCeilingDerived` | m: N alleen; O compleet | Z (compleet) | Bl + M_ms + piek + nominaal + marge | G / E | behouden | V49 |
| 31 | Bl | `blTm` | idem | m: N alleen | Z (compleet) | idem | G / E | behouden | V49 |
| 32 | M_ms | `mmsG` | idem | m: N alleen, N samen met Bl | Z (compleet) | idem | G / E | behouden | V49 |
| 33 | Vermogensopgave (W, filterorde, filter-Hz) | `powerRating` | M-M | m: O mét netwerk (alle drie); N met alleen W | O | alle drie + netwerk | G / E | behouden | U-3f |
| 34 | Aanbevolen min. kruisfrequentie (Hz) | `minCrossover` | vensterregel `stated-min` | m: Z | Z | — | G / E | behouden | U-3g |
| 35 | Min. kruisfrequentie: orde | `minCrossover` | tilt de vloer voor ondiepere flank | m: N zonder Hz | Z | Hz | G / E | behouden | U-3g |
| 36 | Aanbevolen max. kruisfrequentie | `maxCrossover` | vensterregel `stated-max` | m: Z (3W-mid) | Z | — | G / E | behouden | U-4 |
| 37 | Max vervangt breakup | `maxCrossoverOverride` | breakup superseded | m: Z mét max; N zonder | Z | max gesteld | conditioneel | behouden | U-4 |
| 38 | Breakup-deler | `breakupDivisor` | breakupplafond | m: Z (3W-mid) | Z | — | E (meer) | behouden | U-4 |
| 39 | Breakup-deler: notitie | `breakupDivisor` | `measuredOn` in de limiettekst | m: N zonder deler | T | deler | E (meer) | behouden | — |
| 40 | M-C per weg (dB) | `driveOnFsMaxDb-per-way` | poort + afleiding A5d.3(ii) | m: Z (vensters, poorten) | Z | — | G / E | behouden | V50 |
| 41 | Akoestisch centrum z | `acousticCentre` | verticalMm → vensters + lobing | m: Z | Z | — | E (meer) | behouden | — |
| 42 | Rotatiesymmetrie | `rotSym` | M-F-eind | m: N alleen; O mét verticaal venster | O | verticaal venster | E (meer) | ouder benoemen | **nieuw (ouder)** |
| 43 | Gemeten R_e | `measuredRe` | A5c.1 → feit `reOhmByModel` → M-E | m: Z (feiten) | Z | — | E (meer) | behouden | — |
| 44 | Aandrijfspanning | `driveVoltageV` | route 2 | m: N alleen; O compleet | O | mic + S_d + kaart | E (meer) | ouder benoemen | V49 |
| 45 | Bedrading gemeten/gewenst | `wiring` | niveauwerkrapport | m: O samen; N één helft | O | beide | E (meer) | behouden | V51 |
| 46 | Spoelfamilie | `coilFamily` | rapport (O); verklaring → `coilDcrModel` (Z, met catalogusfits) | m: O (rapport); s: Z | Z | catalogus met fits | E (meer) | behouden | A5e.3 |
| 47 | Handmatig venster (ref/right/vloer) | `manualWindow` | validity.ts; header wint altijd | m: N (demo heeft headers) | Z | bestand zonder venster | conditioneel | behouden | U-3b |
| 48 | Handmatig venster: notitie | `manualWindow` | provenance | m: N | T | venster gesteld | conditioneel | behouden | — |
| 49 | Nominale maat (inch, mid/woofer) | `nominalSize` | diameterInch → Keele-plafond nabij veld → feit | m: Z op 3W (feiten); 2W: artefact (verkeerde rol geperturbeerd) | Z | — | E | behouden | — |

### 4. Setup → aanpassing tweeter/mid (expert-fieldsets)

| # | Veld | Registerrij | Trace | Gemeten effect | Klasse | Ouder | Zichtbaar G / E | Voorstel | Bekend |
|---|---|---|---|---|---|---|---|---|---|
| 50 | Fasemodus (gemeten/minimum) | **geen** | ketentakken krijgen minimumfase | s | Z | — | E | registerrij toevoegen | **nieuw** |
| 51 | Tweeter offset (mm) | **geen** | `tAdjust` / `adjust` in de ketenvoer | m: Z 3W/2W/HybG | Z | — | E | registerrij toevoegen | **nieuw** |
| 52 | Tweeter trim (dB) | **geen** | idem | m: Z | Z | — | E | registerrij toevoegen | **nieuw** |
| 53 | Mid offset / trim (3W) | **geen** | `midAdjust` | m: Z | Z | drieweg | E | registerrij toevoegen | **nieuw** |
| 54 | Zittiming | **geen** | v1-weergave | s | T | fasemodus gemeten | E | behouden | — |

### 5. Filters → Engine v2-paneel (bestuurd formulier) en het guided-scherm "What it must meet"

Guided en expert schrijven dezelfde staat (I-3). Elke rij hieronder geldt dus voor beide.

| # | Veld | Registerrij | Gemeten effect | Klasse | Ouder | Zichtbaar G / E | Voorstel | Bekend |
|---|---|---|---|---|---|---|---|---|
| 55 | Hybrid mode | `activeSideOn` | s: ketensleutel `activeSide` → ontwerpstap, tuner, worker | Z | — | G / E | behouden | H-2 |
| 56 | Overnames (Hz) | `activeHandoverHz` | s: één run per overname, DSP-afleiding | Z | Hybrid mode | G / E | behouden | H-2 |
| 57 | Akoestische vorm | `activeHandoverShape` | s: HP-doel + LP-doel | Z | Hybrid mode | G / E | behouden | H-2 |
| 58 | Flankbudget | `activeFlankBudgetDbRms` | s: tuner-wand + weigering + chip | Z | Hybrid mode | G / E | behouden | H-3b |
| 59 | Processorlatentie | `activeProcessorLatencyMs` | s: alleen `dspTargetBlock` (in te stellen delay) | T | Hybrid mode | conditioneel | behouden | H-2b |
| 60 | Versterkervloer | `ampMinLoadOhm` | m: Z (tuner-barrière, poort, 2W-ontwerpstap) | Z | — | G / E | behouden | F0 |
| 61 | Max dissipatie | `maxDissipationPct` | m: Z (poort) / O (rapport) | Z | — | G / E | behouden | — |
| 62 | Min EPDR | `minEpdrOhm` | m: Z / O | Z | — | G / E | behouden | — |
| 63 | Max aandrijving op f_s | `maxDriveOnFsDb` | m: Z (tuner `valueCeilings`, poort, vensters) | Z | — | G / E | behouden | V47b |
| 64 | Piekvermogen | `amplifierPeakPowerW` | m: N alleen; Z mét nominale last (`peakInputVolts`) | Z | nominale last | G / E | behouden | V49 |
| 65 | Nominale last | `amplifierNominalLoadOhm` | m: N alleen | Z | piekvermogen | G / E | behouden | V49 |
| 66 | X_max-marge | `xmaxMarginFraction` | m: N alleen; O compleet | Z (compleet) | piek + nominaal + kaart | G / E | behouden | V49 |
| 67 | Continu vermogen | `amplifierPowerW` | m: O mét netwerk (M-A, M-A/part) | O | netwerk | G / E | behouden | V51 |
| 68 | Weerstandsklasse | `resistorClassW` | m: v2-poortblok verandert; rapport: kolom zonder marge, poort mét | Z | marge | G / E | behouden | V50 |
| 69 | Weerstandsmarge | `resistorPowerMargin` | m: idem | Z | klasse | G / E | behouden | V50 |
| 70 | Spoelklasse | `coilClassA` | m: Z / O | Z | — | G / E | behouden | V50 |
| 71 | Thermisch ontwerpvermogen | `resistorThermalPowerW` | m: Z / O (mét netwerk) | Z | — | G / E | behouden | V51 |
| 72 | Niveauwerk laagste weg | `lowestWayLevelWork` | m: `none` → Z; `series-r-max` zonder getal → N | Z | — | G / E | behouden | V51 / V51b |
| 73 | Max serie-R laagste weg | `lowestWaySeriesRMaxOhm` | m: Z onder `series-r-max`; N zonder | Z | modus `series-r-max` | conditioneel | behouden | V51b |
| 74 | LF-bult-budget | `lfBumpBudgetDb` | m: Z (tuner-grenzen) | Z | — | G / E | behouden | V42/V43 |
| 75 | Max Q_es× | `qesMultiplierMax` | m: Z (budgetblok) / O | Z | — | G / E | behouden | V45 |
| 76 | Dempingsmarge | `dampingMarginDb` | m: Z (3W ook tuner-grenzen) | Z | — | G / E | behouden | — |
| 77 | ±-venster | `splWindowPlusMinusDb` | s: `buildShortlist`-eis (de ladder mag verruimen) | O | — | G / E | behouden | A5e.1 |
| 78 | Max fasesporing | `maxPhaseTrackingDeg` | s: shortlist-eis per overname | O | — | G / E | behouden | U-5c |
| 79 | Voicing (type) | `targetCurve` | m: O (rapport); s: Z (`amplitudeReference`) | Z | — | G / E | behouden | V45 |
| 80 | Plateaudiepte | `plateauDepthDb` | m: O | Z | type = plateau | G / E | behouden | V45 |
| 81 | Verticaal venster | `verticalWindowDeg` | m: O (M-F-eind) | O | — | E (meer) | behouden | V20a |
| 82 | Shortlistgrootte | `shortlistSize` | s: hoeveel rijen | T | — | E (meer) | behouden | — |
| 83 | Seed | `runSeed` | m: Z (determinisme) | Z | — | E (meer) | behouden | A5e.4 |
| 84 | Evaluatiebudget | `runBudgetEvals` | m: Z (tuner `maxIterations`) | Z | — | E (meer) | behouden | — |
| 85 | Kandidatenveld | `fieldMode` | m: Z (veld) | Z | — | E (meer) | behouden | E-2 |
| 86 | Polariteitsarmen | `polarityArms` | m: Z (veld) | Z | — | E (meer) | behouden | H-5 |
| 87 | Gestelde kruisingen | `statedCrossings` | m: Z (veld; 3W pas met beide assen) | Z | — | E (meer) | behouden | U-5 |

### 6. Filters → de v1-secties (Goals & weighting, Filter shape, Crossover, Driver limits, Components, Targets) en de 🧙 Wizard

Dit is de grootste groep **zonder registerrij** (N2). Ze staan in het expertpaneel; de Wizard (bereikbaar in guided via "Walk me through it" en in expert via "🧙 Wizard") toont een deel ervan.

| # | Veld | Registerrij | Gemeten effect (3W / 2W / HybG) | Klasse per route | Ouder | Zichtbaar G / E | Voorstel | Bekend |
|---|---|---|---|---|---|---|---|---|
| 88 | Priority-schuif + Wizard-radio | `phasePriority` (v1-legacy) | m: **tuner Z op alle drie**; ontwerpstap en synthese krijgen de verklaarde 0,5 | Z | — | Wizard / E | **badge is onjuist**, zie N1 | U-5c (**gedeeltelijk weerlegd**) |
| 89 | Error smoothing | `errorSmoothOct` (v1-legacy) | m: N / N / N | N (terugval: Z) | — | E | NIETS-lijst | I-1 |
| 90 | HP/LP-voorkeur hoog | `hpLpPref` (v1-legacy) | m: N / N / N | N (terugval: Z) | — | Wizard / E | NIETS-lijst | I-1 |
| 91 | HP/LP-voorkeur laag (3W) | `hpLpPref` (v1-legacy) | m: N | N (terugval: Z) | drieweg | E | NIETS-lijst | I-1 |
| 92 | Scanstrategie (3W) | `scan3Mode` (v1-legacy) | s: overgeslagen op v2 (run-notitie) | N (terugval: Z) | drieweg | E | NIETS-lijst | I-1 |
| 93 | BOM-plafond | `bomCapEur` (v1-legacy) | s: alleen `rankChain3Results` | T (alleen v1-leestabel) | — | E | voorleggen | I-1 |
| 94 | Ontwerpniveau (Design for … dB) | `excursionSpl` (v1-legacy) | s: v1 fysicavloer → `judgeWindows` → v1-leestabel | T (alleen v1-leestabel) | — | E | voorleggen | V49 / I-1 |
| 95 | Directiviteitsgewicht | **geen** | m: Z (tuner; 2W ook ontwerpstap) | Z | hoekenset | Wizard / E | registerrij | **nieuw** |
| 96 | Amplitudedoel (on-axis / luistervenster) | **geen** | m: Z | Z | hoekenset | Wizard / E | registerrij | **nieuw** |
| 97 | Power metric | **geen** | m: Z | Z | — | E | registerrij | **nieuw** |
| 98 | Power-fold-gewicht | **geen** | m: Z | Z | — | E | registerrij | **nieuw** |
| 99 | Kostengewicht | **geen** | m: Z | Z | — | E | registerrij | **nieuw** |
| 100 | Dissipatiegewicht | **geen** | m: Z | Z | — | E | registerrij | **nieuw** |
| 101 | Source-R-limiet (audit-tier) | **geen** | m: Z (`audit`) | Z | — | E | registerrij | **nieuw** |
| 102 | Source-R-diskwalificatie | **geen** | m: **Z / N / N** | 3W Z; 2W en Hyb N | — | E (2W met melding) | NIETS op tweeweg-routes | U-5c |
| 103 | DI-ankergewicht | **geen** | m: Z / N / N | 3W Z | drieweg + hoekenset | E (alleen 3W) | registerrij | U-5c |
| 104 | EQ-banden per driver | **geen** | m: Z (ontwerpstap) | Z | — | E | registerrij | **nieuw** |
| 105 | Breakup guard | **geen** | m: Z | Z | — | E | registerrij | **nieuw** |
| 106 | Fasemetriek (band / overlap) | **geen** | m: Z | Z | — | E | registerrij | **nieuw** |
| 107 | Synthesemodus (filter / akoestisch), twee plaatsen | **geen** | m: Z (synthese) | Z | — | E | registerrij | **nieuw** |
| 108 | Snap naar catalogus | `catalogSnap` | m: Z | Z | geïmporteerde catalogus | Wizard / E | behouden | — |
| 109 | Snapprofiel | **geen** | m: Z | Z | snap aan | Wizard / E | registerrij | **nieuw** |
| 110 | Serievoorkeur L / C / R | **geen** | s: `snapPrefs.seriesByKind` (zelfde pad als #109) | Z | snap aan | Wizard / E | registerrij | **nieuw** |
| 111 | Binden aan serie | **geen** | s: alleen met een gebonden serie | Z | serie gekozen | Wizard / E | registerrij | **nieuw** |
| 112 | Stapels toestaan | **geen** | m: Z | Z | snap aan | Wizard / E | registerrij | **nieuw** |
| 113 | Trapmethode aan/uit | **geen** | m: Z (`targets`/`staged`) | Z | — | Wizard / E | registerrij | **nieuw** |
| 114 | Rimpeldoel trapmethode | **geen** | m: Z | Z | trapmethode aan | Wizard / E | registerrij | **nieuw** |
| 115 | Fasedoel trapmethode | **geen** | m: Z | Z | trapmethode aan | Wizard / E | registerrij | **nieuw** |
| 116 | Kamercorrectie aanwezig | **geen** | m: Z (verruimt het rimpeldoel) | Z | trapmethode aan | E | registerrij | **nieuw** |
| 117 | Rimpel bij kamercorrectie | **geen** | m: Z | Z | kamercorrectie | E | registerrij | **nieuw** |
| 118 | Akoestische helling mid (LP) | **geen** | m: Z (tuner, 2W-ontwerpstap **en** vensters via `orderByPair`) | Z | — | Wizard / E | registerrij | **nieuw** |
| 119 | Akoestische helling tweeter (HP) | **geen** | m: Z (tuner) | Z | — | Wizard / E | registerrij | **nieuw** |
| 120 | Akoestische helling woofer (LP, 3W) | **geen** | m: Z / N / N | 3W Z (tuner + vensters) | drieweg | E (alleen 3W) | registerrij | **nieuw** |
| 121 | Akoestische helling mid (HP, 3W) | **geen** | m: Z / N / N | 3W Z | drieweg | E (alleen 3W) | registerrij | **nieuw** |
| 122 | Crossover point aan + frequentie + marge (hoog) | `crossoverPoint` | m: Z (veld) mét vinkje; N zonder | Z | vinkje | Wizard / E | behouden | U-5b |
| 123 | Crossover point laag (3W) | `crossoverPoint` | m: Z mét vinkje | Z | vinkje + drieweg | E | behouden | U-5b |
| 124 | Scanstappen (2W) | `xoScanSteps` | m: N in verkenning; Z met pin of vol veld | Z | pin aan of vol veld | E | ouder benoemen | U-5b |
| 125 | Scanstappen (3W) | `xo3Steps` | m: N in verkenning; Z in vol veld | Z | vol veld of pin | E | ouder benoemen | U-5b |
| 126 | ka-tier, c-t-c-factor, breakup-harmonische, `xoWinThr` (arrayK, λ-deler, fsK, breakup-deler) | **geen** | s: v1 fysicavenster → `judgeWindows` → `xoWindowOk` → v1-leestabel | T (alleen v1-leestabel) | drieweg (meeste) | E | voorleggen | **nieuw** |

### 7. Network-tab, editor en grafiekbesturing

| # | Veld | Registerrij | Trace | Klasse | Ouder | Zichtbaar | Voorstel | Bekend |
|---|---|---|---|---|---|---|---|---|
| 127 | Sjabloon (wegen, orde) | **geen** | bouwt het netwerk dat het rapport oordeelt (H-3: in Hybrid mode akoestisch gezaaid) | O | — | E | behouden (actie) | H-3 |
| 128 | Editor: model, polariteit, waarde, serie/stapel/realisatie, LCR-notch (trap: driver/Hz/diepte/Q) | **geen** | bewerkt het netwerk | O | — | E | behouden (actie) | UI-2 / U-7 |
| 129 | Editor: vergrendeld | **geen** | v2TuneNetlist (⚙ Optimize components) slaat het onderdeel over | Z op die route; O anders | netwerk | E | behouden | — |
| 130 | Netwerk actief, tabs vergelijken, tolerantieband (aan + %) | **geen** | simulatieweergave | T | — | E | behouden | — |
| 131 | Opslaan als / hernoemen | **geen** | naam | T | — | E | behouden | — |
| 132 | Bekijkbereik f_max | **geen** | `v2ChainFrame` houdt het plafond van de aanroeper, dus het **plafond van de geoordeelde band** (E-5) | Z | — | G / E | **registerrij of loskoppelen** (N6) | E-5 (bewust) |
| 133 | Bekijkbereik f_min | **geen** | rasterbodem alleen als lager dan de geldigheidsvloer; anders grafiek | T (Z onder de geldigheidsvloer) | — | G / E | behouden | E-5 |
| 134 | SPL-bereik min/max, Pareto-as, sonogrammodus | **geen** | grafiek | T | — | E | behouden | — |
| 135 | Virtueel filter: bypass | **geen** | simulatie | T | — | E | behouden | — |
| 136 | Solo-gevoeligheid / solovloer | **geen** | alleen solomodus | T | solomodus | E | behouden | — |
| 137 | Bandformulieren (virtuele filters: aan, soort, orde, frequentie, EQ-banden, gain) | **geen** | simulatie zonder netwerk; volgt de polariteitsregel (H-4b). De v2-ketenvoer krijgt `seed: defaultVFilters()`, niet deze | T | — | E | behouden | H-4b |
| 138 | Zoekvelden (hulp, palet, catalogus), meetgids-schuiven | **geen** | navigatie/uitleg | T | — | G / E | behouden | — |

## Nieuwe bevindingen (niet in eerdere sessies)

**N1 — De Priority-schuif doet op de v2-route wél iets: hij stuurt de tuner.**

U-5c schreef "de Priority-schuif doet op de v2-route niets" en markeerde hem met de v1-badge. Gemeten op alle drie de routes is dat half waar.

- **Ontwerpstap en synthese** lezen `settings.phasePriority`, en die is na `withDeclaredChainChoices` de verklaarde `DEFAULT_PHASE_PRIORITY` (0,5).
- **De tuner** krijgt zijn gewicht uit de hook. Die spreidt `network.weights.phasePriority`, en `network.weights` wordt in `worker.ts` gebouwd uit `input.settings`: de **ruwe** invoer, vóór de verklaring.
  - drieweg: `v2Chain3One`, `weights` naast de `withDeclaredChainChoices`-aanroep;
  - tweeweg: `twoWayNetworkFacts`.
- De hook staat als laatste in de optie-assemblage, dus **de schuif wint in de tuner**.

Gevolg: een v2-run met de schuif op 75 % ontwerpt op 50/50 en tunet op 25/75. Dat is een engine-bevinding. Zij valt buiten scope en hoort als V-nummer geboekt te worden, niet gerepareerd. Voor deze inventaris betekent het: **#88 staat niet op de NIETS-lijst**, en de badge "not read by Engine v2" is onjuist.

**N2 — 35 velden bereiken de v2-zoektocht zonder registerrij.**

I-1 noemt het register "every input the v2 route can reach". Dat klopt niet:

- de v1-secties van het Filters-paneel: #95–#121;
- de Setup-aanpassing: #50–#53;
- de hoekenset (#2);
- het stapmodel van de merge (#7);
- f_b (#28, als *chamber* geregistreerd maar met een onjuiste trace).

Al deze velden komen als gesteld (`put(...)` in `declareCandidateChoices`) of als grijs gewicht in de tuner terecht. Hun startwaarden zijn v1-standaarden zoals 0,015 €/… en 0,05. Een nieuwe gebruiker ziet dat nergens als gestelde waarde.

Vanuit P4 is dat het zwaarste punt van deze inventaris. Het zijn geen verborgen standaardwaarden in de engine, maar wel waarden die niemand bewust stelde en die toch de zoektocht sturen.

**N3 — De akoestische hellingen sturen twee keer.** Ze bereiken de tuner (`acousticSlopes`) én de **vensters**: via `orderByPair` bepalen ze welke orde de f_s-vloer van A5d.3 aanneemt. Daarmee veranderen ze het kandidatenveld (gemeten: `veld` en `windows` op beide demo's).

**N4 — S_d staat als NOODZAKELIJK geregistreerd, maar de route leest hem nauwelijks.**

- De registerrij zegt "piston diameter → the beaming ceiling; M-C route 2".
- In `engine2/` leest het Keele-plafond de **nominale diameter** (`diameterInch`, #49), niet S_d.
- S_d bereikt alleen M-C route 2. Die vraagt ook een gedocumenteerde aandrijfspanning en microfoonafstand.
- Gemeten: S_d ×2 op de tweeter verandert op beide demo's, met en zonder netwerk, niets aan het rapport.
- Wat S_d wél stuurt is v1-fysica: het beamingplafond en de excursievloer van `physWin`, en daarmee alleen de v1-leestabel.

**N5 — f_b op de kaart van de laagste driver stuurt de tuner.** `audit.fbHz` gaat mee in de part-audit van de tuner, en op de tweeweg ook in de ontwerpstap. De registerrij *chamber* noemt alleen "wat de kast al filtert en de excursiewaarschuwing".

**N6 — f_max van het grafiekbereik is het plafond van de geoordeelde band.** E-5 schreef dat bewust zo ("the designer's own view-range narrowing"). Het is wel een grafiekbesturing die de zoektocht stuurt zonder registerrij, en hij staat naast f_min, dat dat niet doet.

**N7 — De tweeter/mid-aanpassing (offset mm, trim dB) gaat de ketenvoer in.** Dat is `tAdjust`/`midAdjust` op de drieweg en `adjust` op de tweeweg. De polariteit in hetzelfde object wordt sinds H-5 door de gestelde arm overschreven; offset en trim niet.

## Samenvatting

**Telling per klasse.** Per veld de klasse "als zijn ouder gezet is", op de route waar het het meest doet (138 rijen; groepsrijen tellen als één):

| klasse | aantal | waarvan zonder registerrij |
|---|---|---|
| ZOEKT | 90 | 35 |
| OORDEELT | 16 | 3 |
| TOONT | 28 | 12 |
| NIETS (op élke route, buiten de terugval) | 4 | 0 |
| **totaal** | **138** | **50** |

De telling is uit deze tabel geteld (de klassekolom, de sterkste klasse bij gezette ouder) en niet geschat. #102 en #103 tellen als ZOEKT omdat ze op de drieweg zoeken.

**NIETS op élke route.** Dit is de lijst voor Sanders akkoord. Alle vier zijn al bekend uit I-1 en lezen wél in de terugval zonder A5d.3-veld.

1. #89 Error smoothing (`errorSmoothOct`)
2. #90 HP/LP-voorkeur hoog (`hpLpPref`)
3. #91 HP/LP-voorkeur laag (`hpLpPrefLow`)
4. #92 Scanstrategie (`scan3Mode`)

**NIETS alleen op sommige routes.**

| veld | NIETS op | doet iets op |
|---|---|---|
| #102 Source-R-diskwalificatie | 2W, HybG, HybM | 3W |
| #103 DI-ankergewicht | 2W en hybride (daar al verborgen) | 3W |
| #120 en #121 Akoestische helling woofer en mid-HP | 2W en hybride (verborgen) | 3W |

**Grensgevallen om voor te leggen.** Deze velden sturen alleen de v1-leestabel, die op een v2-run getoond wordt maar volgens U-1 "not the route that made this run" is. Ze zijn gemeten als TOONT; of ze op de NIETS-lijst horen is Sanders beslissing:

- #93 BOM-plafond;
- #94 Ontwerpniveau;
- #126 de v1-drempels (ka-tier, c-t-c, breakup-harmonische, `xoWinThr`).

**Geen NIETS-velden, wel aandacht (N\*).** Deze velden doen pas iets als hun ouder gezet is (punt 5):

| veld | doet pas iets met |
|---|---|
| #35 orde | Hz |
| #37 override | max |
| #39 delernotitie | deler |
| #42 rotSym | verticaal venster |
| #44 aandrijfspanning | route 2 compleet |
| #45 halve bedrading | beide helften |
| #64 en #65 piek / nominaal | elkaar |
| #68 en #69 klasse / marge | elkaar |
| #73 max serie-R | modus `series-r-max` |
| #124 en #125 scanstappen | vol veld of pin |
| #122 en #123 pin-velden | vinkje |
| #30–#32 X_max / Bl / M_ms | de volledige excursieset |

**Velden zonder registerrij** (de kolom **geen**): #2, #7, #9–#12, #50–#54, #95–#107, #109–#121, #126–#138. Van de 35 die ZOEKEN zijn de belangrijkste #95–#121 en #50–#53 (N2).

## Wat deze meting niet dekt

- **De terugval zonder A5d.3-veld** is statisch beoordeeld, niet gemeten. Er is geen fixture die geen venster afleidt.
- **De magere hybride (HybM)** is statisch afgeleid van 2W.
- **#46 (spoelfamilie → `coilDcrModel`)** is op de payload niet gemeten. De fixtures draaiden zonder catalogusfits. De trace staat in `candidateDeclarationFor`.
- **Het excursieplafond** werd op de demo's ook met een volledige kaart niet afgeleid (`driveExcursionOff`). Zijn weg naar het verzoek (feit + `driveCeilingDerived`) is daarom statisch en op casus 1 (V49) gestaafd.
- **De rijen 13–21 en 26–27** zijn gemeten als N op het rapport. Hun TOONT-klasse (v1-simulatie, tekening, zithoek) is statisch.
- **De 2W-demo-rijen voor `maxCrossover`, `breakupDivisor` en `nominalSize`** perturbeerden de rol `mid`, die op een tweeweg niet bestaat. Dat is een meetartefact en staat als zodanig in de tabel; de klasse komt uit de 3W-meting.

## Fase 1 — uitgevoerd (25-10-2026)

Sander keurde de NIETS-lijst van vier goed. De drie velden die alleen de v1-leestabel sturen blijven zichtbaar.

- **Register.** Elke rij heeft `effect`, gevuld uit deze meting. `rendersRow(id)` geeft `false` voor `niets` en gooit bij een onbekende id. `V2_NIETS_ROWS` bevat de drie rijen; `hpLpPref` dekt hoog én laag.
- **Verborgen, niet verwijderd.** Error smoothing, HP/LP-voorkeur hoog en laag en scanstrategie worden in geen enkele modus meer getekend. Dat geldt ook voor de Wizard, inclusief de zin die de alignment met de hellingen vergelijkt en de samenvattingsregel. De waarden blijven in state, in `localStorage` en in het projectbestand. De U-1-melding bij een oud project noemt ze nog steeds.
- **Wat er met de verborgen velden nog gebeurt.**
  - De guided-lijst "niet-standaard" noemt een verborgen veld niet meer.
  - De run-notitie over de assen-scan vuurt alleen nog als het veld getoond wordt.
  - Het label van de drieweg-scanstappen schakelt niet meer op de verborgen strategie.
  - In de terugval zonder A5d.3-venster lezen alle vier ze nog, nu onzichtbaar. De U-1-melding is daar het enige spoor.
- **Priority-schuif (N1).** De badge zegt nu "op Engine v2 leest alleen de tuner dit", met de meting als notitie. De engine is niet aangeraakt; dat besluit ligt open.
- **Afhankelijke besturingselementen** (`V2_DEPENDENT_CONTROLS`) verschijnen pas als hun ouder gezet is:
  - de orde naast de min-kruisfrequentie;
  - de breakup-delernotitie;
  - de vensternotitie;
  - rotatiesymmetrie (pas met een verticaal venster);
  - de drieweg-scanstappen (pas met een pin of het volle veld);
  - "binden aan serie" (pas met een gekozen serie).

  De wederzijdse paren (piek ↔ nominaal, klasse ↔ marge, Bl ↔ M_ms) blijven bewust staan.
- **Tests** (`src/lib/u9FieldEffects.test.ts`, 18 claims):
  - (1) elke rij heeft een effect;
  - (2) elk tekenpunt van een NIETS-veld en van een afhankelijk element staat achter zijn guard;
  - (3) een perturbatie per NIETS-veld. Voor error smoothing is dat de effectieve keteninvoer (ontwerpstap + tuner, ná hook), op de drieweg en de tweeweg, met een tegenproef op `costWeight`. Voor de HP/LP-voorkeur en de scanstrategie is het een bronscan op de app-overschrijving.

  Twee opzettelijke breuken (een `rendersRow`-guard en een ouderguard weggehaald) zetten precies twee claims op rood.
- **Niet gedaan.**
  - De 50 velden zonder registerrij staan nog zonder rij; test (1) dekt daarom het register en de bestuurde formulieren, niet de hele app. Dat is grondwerk voor fase 2.
  - N1 is niet als V-nummer in het casusboek geboekt.
  - De 2W-scanstappen staan alleen onder de pin, terwijl het volle veld ze ook leest.

## Fase 2 — uitgevoerd (25-10-2026)

**Besluiten van Sander (stap 0 en onderweg):**
- Velden die op een route niets doen worden **op die route verborgen** (één regel voor alle vier). #103 DI-anker en #120/#121 de drieweg-hellingen stonden op de tweeweg al verborgen; ze krijgen nu ook `!v2Hybrid`, want een hybride draait de tweewegketen. #102 Source-R-diskwalificatie is losgemaakt van de Source-R-limiet en staat alleen nog op de drieweg zonder hybride. De U-5c-melding ("not read on the two-way Engine v2 route") is daarmee weg.
- De **Priority-schuif blijft**, met een badge die de meting zegt (`effectNote`): de tuner leest hem, ontwerpstap en synthese draaien op 50/50. Hij is uit de klasse v1-legacy gehaald (B-2.1). Het engine-besluit ligt nog open.
- **Scan-only** (geredde kandidaten van een onderbroken scan, U-6b): een **kale lijst** in opgenomen volgorde, met label en laadknop. Geen rangorde en geen v1-kolommen. Die rangorde las het verborgen BOM-plafond.

**Stap 1 — een rij voor elk veld dat iets doet.**
- Het register heeft 124 rijen, en elke rij heeft een `group`.
- Nieuw zijn 41 rijen (`U9_ROWS`) voor #2, #7, #9–#12, #50–#54, #95–#121 en #127–#138, plus `v1Thresholds` (#126). Het effect komt uit deze tabel.
- Rechtgezet in bestaande rijen:
  - N4 (S_d): de travels zeggen nu wat de route leest. De klasse blijft NOODZAKELIJK; die verandert niet zonder meting.
  - N5 (f_b): de travels noemen nu de audit en de tweeweg-ontwerpstap.
  - N3, N6 en N7 staan in de nieuwe rijen (`acSlope*`, `viewFmax`, `tweeterAdjust`/`midAdjust`).
- Dependency gerepareerd: de tweeweg-stappen verschijnen nu bij een pin **of** het volle veld (`V2_DEPENDENT_CONTROLS`). Ze staan los van de pin-span.
- App-brede driftguard (`u9Fase2.test.ts` (1)): elk `<input>`/`<select>`/`<textarea>` van App.tsx en de componenten raakt precies één token uit `V2_FORM_FIELDS` ∪ `V2_APP_CONTROLS`, of het bestand staat als geheel onder één rij (`V2_FILE_ROWS`). Drie uitzonderingen staan bij naam:
  - de Wizard (fase 3);
  - de guided-eisenrenderer (`v2RequirementField`);
  - de kasthulpjes `veld` en `refTopVeld`. Die worden bij hun aanroep gescand.

**Stap 2 — groepen uit het register.** `V2_FIELD_GROUPS` geeft de volgorde: Architectuur → Metingen & geometrie → Versterker & belasting → Driverbescherming → Kruisvenster & topologie → Bouwbaarheid → Doelcurve & voicing → Run & shortlist.
- Het Filters-paneel mapt over die lijst. `App.tsx` typt geen volgorde, alleen per groep welk blok erbij hoort.
- De koppen van de zes v1-secties en van de klassen (noodzakelijk/oordeel/nice) zijn weg.
- Elke groep noemt in één regel wat bij haar hoort maar elders wordt ingevuld (`groupElsewhere`).
- Een veld staat op één plek. De bouwmodus stond er twee keer; het paneel "Passive synthesis" leest hem nu alleen terug.

**Stap 3 — elk veld zegt wat het doet.**
- Elk getoond paneelveld heeft een badge: zoekt / oordeelt / toont · datasheet / typeplaatje / meting / jouw keuze.
- De 20 zoekrijen met een app-startwaarde (`appDefaults.ts`, één bron met vier lezers) zeggen "app default — not stated by you (waarde)". Een eerste bewerking stempelt "stated by you on <datum>". Een oude waarde die al van de startwaarde af stond, leest "stated by you (date not recorded)".
- De datums reizen mee in het projectbestand (`fieldStatedAt`).
- Geen run beweegt hierdoor: de startwaarden zijn dezelfde getallen, maar komen nu uit één bron.

**B-2.2 — v1 uit beeld.**
- Verborgen in elke modus (`effect: 'niets'`, reden "v1-uitfasering (B-2)"): #93 BOM-plafond (ook het stripitem), #94 Ontwerpniveau (met de excursievloerregel) en #126 de v1-drempels (met het v1-fysicavenster dat ze voedden).
- Samen met die velden staan de v1-ranglijst, haar kop, de per-rij-noot en de verwijzende zin achter `v1ReadingShown()`, en die is false.
- De waarden blijven in het projectbestand. De U-1-melding noemt nu ook `kaTier` en `breakupHarmonic`.
- Gevonden en **niet** gerepareerd: `ctcK` heeft twee startwaarden, 'auto' in `useState` en '0.5' in `applyProject`. Daarom staat hij niet in de melding. `breakupLimitOn` is een boolean en staat er om die reden ook niet in.

**Bijvangst van de browsercontrole — een crash op de tweewegroute sinds H-4.**
- Wat er gebeurde: `polarityBranchOf` (de pre-design fasereading van de tweewegroute) las `tAdjust`, en die `const` wordt pas ~200 regels later in dezelfde scope gedeclareerd. `buildCandidateField` roept de reader daarvóór aan. Het resultaat was een `ReferenceError` in de temporal dead zone: elke tweeweg-v2-run stopte stil, terwijl de overlay bleef staan.
- Sinds wanneer: H-4 (`8e6cc62`, 20-09-2026). H-5 noteerde een tweewegrun die "na 21 minuten afgebroken" was; dat was deze crash.
- Reproductie: na een volledige herlaadbeurt, op HEAD, vóór de reparatie.
- Reparatie: `branchAdj.tweeter` (dezelfde waarde). Daarna liep de run.
- Geen testbestand ving dit, omdat geen test `runVfOptimize` uitvoert.

**Open punt U-10 — de v1-motor verwijderen.** `runChainScan`, `runChain3Scan`, de v1-ranking, de terugval zonder A5d.3-venster en `toggleRegression` staan ongewijzigd. Verwijderen vraagt eerst twee dingen:
- (a) v2 moet in de terugval zelf melden of weigeren, in plaats van stil v1 te lezen;
- (b) de toggle-invariant moet een nieuwe vorm krijgen. Die bewijst zich nu dóór v1 te draaien.
