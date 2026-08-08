# SD Acoustics - Crossover Studio (v/h Acoustic Design Studio)

Eigen crossover-ontwerptool (React + TypeScript, pure frontend, Vite) voor Sander & Stefan.
Kern-idee: ontwerpen op **gemeten fase** (incl. echt inter-driver tijdverschil) waar VituixCAD
minimum phase reconstrueert. Voertaal met Sander: **Nederlands**; code/comments Engels.

## Commands

- `npm run dev` — dev-server via de Browser-pane tool (`preview_start {name:"dev"}`), poort 5173
- `npx vitest run` — testsuite (354 tests, allemaal groen houden)
- `npm run build` / `npx tsc -b` — build & typecheck (tsconfig.test.json dekt de tests, Node-types)
- Verificatie is GESCOPED op wat de wijziging raakt (Sanders regel, jul 2026 — de volle suite
  duurt ~3,5 min en de tests dekken alleen src/lib):
  - `src/lib`-wijzigingen (engine): typecheck + VOLLE testsuite + build — stille schade
    (timing/fase/solver) is hier het risico
  - pure UI/CSS-wijzigingen (App.tsx, components/, index.css): typecheck + alleen de tests van
    geraakte lib-bestanden (bv. `npx vitest run src/lib/help.test.ts`) + build + verificatie
    in de Browser-pane — de suite bewijst hier niets extra's
  - twijfel of gemengd → volle suite

## Architectuur (src/lib, alles unit-getest)

- `parsers/` — frd/zma/vxp/**lim** (VituixCAD-project incl. WIRE-topologie via coördinaat-union-find in
  `vxpNetwork.ts`). Fixtures = echte KOAN-metingen in `parsers/fixtures/`. **vxp is volledig
  optioneel**: .zma's kunnen per driver mee in de FRD-file-dialoog (standalone `zStandalone`,
  merged met evt. project-impedanties; keys 'mid'/'tweeter'); solver/synthese/editor draaien op
  de merged map. vxp = alleen nog import van Stefans crossover-varianten.
  **`lim.ts` (aug 2026): ARTA/LIMP's binaire .lim-impedantie direct importeerbaar** —
  formaat reverse-engineered ("LIM\0", int32-count @12, float32-samplerate @24, dan
  float32-triplets freq/|Z|/fase vanaf byte 28) en gevalideerd met FYSICA: de fixtures
  dragen woofer, tweeter én dezelfde twee parallel gemeten — complex parallel van de
  eerste twee reproduceert de derde op ~0,1 Ω (regressietest; verwisselde kolommen slaan
  complexe parallelrekening volledig stuk, dus de test bewijst de kolomtoewijzing).
  Integratie: `limToZmaText` converteert op de IMPORTGRENS naar canonieke ZMA-tekst (met
  herkomst-comment) en de app slaat DIE op — alles stroomafwaarts (autosave, project,
  VituixCAD-map-export) blijft tekst en VituixCAD kan het resultaat wél lezen. |Z| ≤ 0
  wordt hard afgewezen: een mis-gedecodeerd bestand faalt luid i.p.v. als waanzinnige
  driver-load te solven.
  **`classify.ts` (import-sanity, aug 2026)**: niveauprofiel-check op de importgrens —
  FRD en ZMA zijn dezelfde drie kolommen en de parser wordt op EXTENSIE gekozen, dus een
  impedantie-export die .txt heet laadde stil als responsie (ohms in de dB-kolom, driver
  op ~7 dB). `classifyLevelProfile`: één waarde ≤ 0 ⇒ SPL (|Z| kan niet negatief, genormaliseerde
  responsies wel), mediaan < 45 ⇒ impedance-achtig, > 60 ⇒ SPL-achtig, ertussen = stil.
  App WAARSCHUWT luid bij een overtuigende mismatch en laadt gewoon door — signaleren,
  nooit een tweede stille beslissing; FRD-kant alleen op 3-koloms bestanden (2-koloms
  genormaliseerde target-curves vallen zo buiten bereik). Banner-prefix "Parse error:"
  is daarbij vervangen door "⚠" — hij loog al voor de vxp-pick-hint.
  **`vxpExport.ts` (`serializeVxp`, "Export .vxp"-knop in de Network-tab)**: exacte inverse
  van de parser — het actieve netwerk terug als VituixCAD-project (onze parts dragen al
  VituixCAD-grid-coördinaten, dus de CROSSOVER-blok re-serialiseert direct; ontbrekende
  standaard-params — Generator Tg/Rg, spoel Wire/Rpar/Cpar, cap ESR — worden aangevuld zodat
  VituixCAD het bestand schoon opent). **Alle netwerk-tabs gaan mee als crossover-varianten**
  (actieve tab wordt CROSSOVER, rest CROSSOVER1/2/…; gedeelde DRIVER-header = union van modellen
  over alle tabs; één `<Variant>N</Variant>`). Round-trip-regressietest incl. de echte KOAN-fixture.
  **Map-export (Sanders "de meetbestanden moeten mee")**: de knop schrijft via de File System
  Access API (`showDirectoryPicker`, Chromium) een submap met de `.vxp` ÉN alle response-/
  impedantiebestanden erin — VituixCAD opent zonder "N/N frequency response files not found".
  Bestandsnamen worden één keer geschoond (demo-suffix eraf, response krijgt .txt) en identiek
  in de .vxp-referentie én op schijf gebruikt; een `place`-helper dedupliceert gelijke files maar
  hernoemt een botsing tussen VERSCHILLENDE files (…_2) zodat twee drivers nooit stil dezelfde
  response delen. Firefox/Safari (geen API) vallen terug op alleen de .vxp-download + een note
  met de handmatig te plaatsen bestandsnamen. **`<Variant>` = het 0-BASED SLOT-NUMMER van de
  actieve variant** (CROSSOVER=0, CROSSOVER1=1, … CROSSOVER7=7) — DÉ oorzaak van Sanders
  hardnekkige "Amount of sources must be one": bewezen met zijn 2023-referentiebestand
  (`<Variant>0</Variant>` met alle 8 slots vol) + de KOAN-fixture (`<Variant>2</Variant>` →
  CROSSOVER2). Eerst het AANTAL wegschrijven en daarna een 1-based index wezen allebei naar een
  slot dat niet in het bestand zat → leeg canvas + de fout per driver (2×). Export zet de
  actieve tab vooraan als CROSSOVER (slot 0) en schrijft `<Variant>0</Variant>`.
  Elke variant MOET precies één Generator (bron) hebben, anders weigert
  VituixCAD hem; tabs zonder één-bron (bv. een geïmporteerde kale filter) worden overgeslagen
  met een note i.p.v. de hele export te vergiftigen. **Byte-compat (hard geleerd): UTF-8 MÉT BOM
  + CRLF** — VituixCADs Windows/.NET-reader miste zonder BOM de UTF-8-detectie en las non-ASCII
  units (Ω) verkeerd, waardoor het crossover-blok niet parste → 0 bronnen → óók "Amount of
  sources must be one" (per variant, dus 2×). `serializeVxp` eindigt met `'﻿' + s.replace(\n→\r\n)`;
  de fixture is UTF-8-with-BOM + CRLF, regressietest bewaakt het. **PartID-sanering (dé echte
  "sources"-fix, Sanders geplakte Working.vxp)**: VituixCAD-PartIDs zijn strikt letter+nummer
  (C1/L2/G1/D1) en zijn part-loader parseert ze — de merge-IDs `G`, `D`, `B·C1` braken het
  laden, parts vielen weg incl. de Generator → lege canvas + "Amount of sources must be one".
  `sanitizedPartIds` per variant: geldige IDs blijven (round-trip intact), rest hernummerd op
  type-prefix; Ground/Wire krijgen géén PartID. Ook veld-getrouw gemaakt: Wire-parts dragen
  `<Open>`, Driver-parts de `DriverTarget`/`FilterTarget`-blokken, en de SPEAKER-header het
  volledige veld-set (walls/Toein/AxialTarget/PowerTarget) zoals VituixCAD zelf schrijft.
  **Rigide symbool-geometrie (dé hardnekkigste "sources"-oorzaak)**: VituixCAD-symbolen hebben
  een VASTE voetafdruk — terminals van elk 2-terminal-component exact 6 grid-eenheden uiteen,
  CenX/CenY = exact het midden, `Rotated` = as (verticaal True), Driver-terminals op CenX−1,
  Ground-punt op CenY−1 (nagemeten over de hele KOAN-fixture). Onze eigen schema's gebruiken
  5/7-spans → VituixCAD kan de parts niet reconstrueren → generator los → per DRIVER "Amount
  of sources must be one" (vandaar 2×). `normalizeGeometry` in de export: terminal A blijft,
  B → A±6 op de as, stub-Wire old-B→new-B houdt de netten intact (union-find-regressietest);
  fixture-parts (al span 6) zijn no-op — Driver/Inductor-headers nu byte-identiek aan origineel.
  **Timing-brug (Sanders eis, jul 2026): VituixCAD reconstrueert de fase ZELF**
  (`MinimumPhase=True` voor élke driver) en elke driver krijgt zijn **EXCESS-fase-delay**
  (gemeten fase − minimum-fase-reconstructie, gefit als pure delay; genormaliseerd: vroegste
  driver 0, latere positief) als `ResponseDelay`. **HARD GELEERD (Sanders "moet het niet −47 µs
  zijn?"): de rauwe bulk-delay-Δ is NIET de brugwaarde** — de rauwe fit absorbeert de
  minimum-fase-helling van de driver zelf. Op KOAN: rauwe Δ zegt tweeter +47 µs LATER, excess-Δ
  zegt tweeter ~50 µs EERDER (hij staat fysiek ~17 mm vóór de mid — Sander wist het); alleen de
  excess-brug reproduceert de gemeten relatieve fase (~2° vs ~78° fout, en SPL-som van max
  2,4 dB fout naar vrijwel exact). `excessDelayMsOf` in App (module-level), óók gevoed aan het
  timing-paneel-advies (`excessBridge`-memo); regressietest in timing.test.ts pint de
  tegengestelde tekens vast. Bewust NIET de delay als Z (VituixCAD rekent Z zelf om — één van de
  twee, nooit allebei: dubbeltelling, zie [[vituixcad-z-not-a-delay]]). De App bouwt de
  DRIVER-blokken uit de slot-mapping (isTweeterModel) + geladen response/impedantie-filenames;
  de gebruiker plaatst die files zelf naast de .vxp (of gebruikt de map-export hieronder).
  NB: de minimum-modus-AUTOFILL (offsetMm = rauwe deltaMm) draagt dezelfde rauwe-Δ-besmetting —
  bewust nog niet omgezet naar de excess-Δ (raakt de sim-weergave; Sanders keuze)
- `timing.ts` — HET fundament: bulk-delay-fit uit unwrapped fase + `assessSharedReference`
  (gedeelde-tijdreferentie-verdict). Silent-failure-risico van verkeerde timing is de bestaansreden
- `dsp.ts` — logspace/resample (unwrapped-fase-interpolatie, `clampEdges` voor Z), `combine`
  (complexe som; exporteert ook `combinedPhaseDeg`), `applyTransfer`.
  **N-weg-kern (aug 2026, fase-4 trede 1)**: `combineN(branches[])` — élke tak zijn eigen
  optionele `BranchAdjust` (trim/offset/invert, de generalisatie van TweeterAdjust), één tak
  is legaal (solo zonder ghost-truc), plus `relativePhaseBetween(a,b)` als paar-helper.
  `combine()` is nu een DUNNE WRAPPER over dezelfde `sumBranches`-kern — de accumulatie start
  bewust OP de eerste tak (niet op nul) zodat K=2 bit-identiek is aan de historische fused
  loop. Bewijs is niet-circulair: dsp.nway.test.ts draagt een BEVROREN kopie van het oude
  algoritme en eist Object.is-gelijkheid op de KOAN-fixtures over drie adjust-varianten;
  daarbovenop loopt de hele suite (incl. KOAN-waardepins en determinisme-tests) door de
  nieuwe kern. App/UI is nog 2-slots — dat is trede 2.
- `driverSlots.ts` — model→slot-mapping. **N-weg (aug 2026, trede 2a)**: `pickSlotsN` —
  2 drivers = exact `pickSlots` (KOANs lage driver heet "mid" en blijft de LAGE tak,
  test-gepind); 3 = tweeter+mid op naam (`isMidModel`); niet te scheiden namen ⇒
  `ambiguous`-melding i.p.v. raden.
  **Trede 2b (aug 2026) — de sleutel-knoop opgelost: OPSLAG SPREEKT ROLLEN, netlijsten
  spreken model-namen, dit bestand is de brug.** `BranchRole` ('low'|'mid'|'high') is het
  opslag-vocabulaire (App-zStandalone + project-v2 `zByRole`); `canonicalModelForRole` is
  dé ene plek waar "de lage tak heet historisch 'mid'" leeft (zonder echte mid: low→'mid',
  mét: low→'woofer', mid→'mid', high→'tweeter'); `withSlotAliasesN` generaliseert de
  alias-laag (2-weg bit-identiek aan `withSlotAliases`, test-gepind; ambigu = géén
  aliassen, echte namen blijven resolven). 'mid' als MODEL-naam blijft legaal en resolvet
  via pickSlotsN — alleen de opslag-betekenis is verdwenen.
- `network.ts` — MNA-solver (complexe admittantie, Norton-bron, gemeten Z als driver-load).
  Elke solve levert ook `inputZ`: de systeem-ingangsimpedantie aan de generatorklemmen
  (excl. Rg) — de versterker-belastingscurve, voedt het Impedance-paneel
- `components/MeasuringGuide.tsx` — **📐 Measure: de meetgids als iets dat je BEDIENT
  (aug 2026, Sanders "er moet ook een guide komen om op de juiste manier te meten")**. De twee
  illustraties draaien op dezelfde `trueOffAxisDeg`/`farFieldVerdict` als de engine, dus de gids
  KAN niet afwijken van de app: sleep de mic naar achteren en de tekening, de getallen en de
  optimizer-vensters bewegen samen. Dát is de reden dat hij in de app zit en niet in een pdf.
  Zij-aanzicht = waar "al off-axis bij 0°" vandaan komt (500 mm → tweeter 0°/mid 13°/woofer 37°;
  2000 mm → 0°/3°/11°); bovenaanzicht = de draaitafel draait de KAST, niet elke driver.
  **Eén isotrope schaal** in beide tekeningen — x en y mogen nooit apart schalen, anders liegen
  de hoeken; de kast krimpt daardoor echt als je achteruit loopt, en dát is de les. De viewBox
  wordt wel bijgesneden tot wat er staat (lege ruimte is alleen lege ruimte).
  Beweging is doelgericht (animatie-skill-principe): de sweep-loop bestaat omdat "de tafel draait
  de kast" een BEWEGING is die een stilstaand beeld niet kan maken; hij is een yoyo-loop, stopt
  zodra je een regelaar aanraakt, en `prefers-reduced-motion` haalt hem helemaal weg (de sliders
  leren hetzelfde met de hand). UI-les onderweg: de globale `label`-regel is een KOLOM, dus een
  slider-rij moet expliciet `flex-direction: row` zeggen of de range-input wordt tot volle
  labelhoogte uitgerekt (192 px).
- **Meetgeometrie ín de gemeten delay (aug 2026, Sanders vraag "we meten toch ook de delay van
  de hoek?")**: ja, en het is een derde tot de helft van het getal. Een aankomsttijd is
  *totale padlengte ÷ c*, en dat pad is twee ongerelateerde dingen bij elkaar: (1) de diepte
  van het akoestisch centrum — een DRIVER-eigenschap, overal hetzelfde — en (2) de schuine weg
  van een mic op eindige afstand naar een driver op een andere hoogte — een RIG-eigenschap die
  KRIMPT als je achteruit loopt. De som rapporteren als "de tweeter staat 17 mm vóór de mid"
  schrijft dus een deel van het statief op het conto van de driver. Pas met de posities uit
  `cabinet.ts` is dit te scheiden. `geometricPathExcessMm` + `pathLengthMm` (dezelfde
  bol-om-het-referentiepunt-conventie als `trueOffAxisDeg` — het is hetzelfde statief); het
  timing-paneel toont de SPLITSING tegen de EXCESS-Δ (de eerlijke maat voor diepte).
  GEMETEN op een 90 mm-scheiding bij 500 mm: rig −23,4 µs van een excess-Δ van −50 µs.
  **`listeningDelayShiftUs` — en dit is de ontwerp-relevante helft**: die schuine weg krimpt met
  afstand, dus een som die bij de MICROFOON is uitgelijnd is dat bij de STOEL niet. Sanders
  center, mid 70 mm van het referentiepunt: 14,2 µs op 500 mm → 2,4 µs op 3 m, een verschuiving
  van 11,8 µs = **20,5° op zijn 4,8 kHz-overgang en 34° op 8 kHz**. Dat is een tweede,
  onafhankelijk argument om verder weg te meten, náást het ver-veld-argument. UI: opt-in
  "Re-time to the listening distance" (uit by default, alleen in measured-fase — minimum-fase
  heeft de aankomsttijden al weggegooid; gepersisteerd mét autosave-dep).
  **HARD GELEERD bij de bouw**: de correctie mag NOOIT alleen in de sim landen. Een simulatie
  die de luisterplek toont terwijl de optimizers voor de microfoon ontwerpen is exact de
  "twee consumenten, twee definities"-splitsing waar deze codebase telkens voor betaalt —
  daarom is er nu één `branchAdj`-memo (tweeter + mid, relatief aan de lage tak) die de sim,
  de vf-optimizer, de netTune, de tolerantieband, de tab-ghosts, `tabCompare` en de
  fase-curves allemaal delen.
- `nearField.ts` — **de laag-eind-merge (aug 2026, Sanders "merge maar")**. Bestaansreden staat
  in de cijfers: een gepoorte binnenmeting is pas eerlijk boven `f = 1/t_gate` (binnenshuis
  200–290 Hz) en een 3-weg kruist woofer-mid op 300–500 Hz — precies het gebied dat het meeste
  zorg vraagt is het gebied waar de verre-veldmeting ophoudt. Klippel stelt het als regel: de
  kruising MOET boven de splice-frequentie liggen.
  Fysica, alledrie gepubliceerd en onderling gecontroleerd: bovengrens nabij-veld `f = c/(2πa)`
  (ka = 1) — Klippel schrijft hem als 5475/a[cm], Keele als 4311/D[inch], en die twee zijn
  ALGEBRAÏSCH dezelfde formule (4311/(2/2,54) = 5475,0), een prettige kruisvalidatie uit twee
  onafhankelijke lijnen; schaling naar het verre veld `a/(2r)` (ARTA AN4, halve ruimte);
  meerdere stralers via Keele's diameter-gewogen COMPLEXE som (poort telt mee met
  `D_poort/D_conus` — onder de afstemming trekken ze elkaar grotendeels af, wat een
  magnitude-som niet kán weergeven).
  **Wat hier ANDERS is dan bij een magnitude-tool**: deze app somt gemeten fase, dus een splice
  die alleen niveaus matcht plant een onbekende delay-stap precies op de woofer-mid-kruising.
  `mergeNearFar` fit daarom eerst NIVEAU (mediaan over de blend — mean wordt getrokken door de
  afwijking die je meet, dezelfde doctrine als responseStats) én een PURE DELAY (kleinste
  kwadraten op het ge-unwrapte fase-VERSCHIL, exact de vorm uit verification.ts), en crossfade
  pas daarna — in het COMPLEXE domein, want magnitude en fase apart faden verzint een respons
  die geen van beide helften heeft. Alles wordt gerapporteerd: niveau, delay, residu, en een
  offset rond 180° leest als "nabij-veld omgekeerd aangesloten" i.p.v. stil gecorrigeerd.
  **Baffle step** is een instelbare shelf, geen diffractiemodel: een nabij-veldmeting is overal
  halve ruimte terwijl een echte kast onderin tot 6 dB verliest, maar de gepubliceerde formules
  verschillen onderling ~3× en de meting is het met geen van alle eens (de afstand tot elke rand
  telt zwaarder dan de breedte). Een knop die de ontwerper ziet en zet is beter dan een model dat
  gezaghebbend oogt en het niet is. `checkTransition` weigert een splice buiten één van beide
  grenzen, en zegt het apart als er ÜBERHAUPT geen eerlijke splice bestaat ("meet verder weg,
  hoger, of buiten") — dat is een meetprobleem, geen knop om aan te draaien.
  App: slot per tak (conus + optioneel poort) op de Import-tab, en de merge gebeurt AAN DE BRON
  (`merged`-memo → `effective()`), zodat grid, sim, optimizer, charts en scores één respons zien
  en niets hoeft te weten van waar het laag vandaan komt. Zelfcontrole in de browser: dezelfde
  meting als nabij-veld laden geeft delay 0 µs en residu 0,0°, en het niveau precies de
  `a/2r`-schaling terug.
- `cabinet.ts` — **kastgeometrie + meetcontext (aug 2026, Sanders "meer invoervelden voor een
  beter beeld")**. De app LEIDDE af wat de ontwerper gewoon WEET; elke "het zou dit kunnen zijn,
  of dat" van die dag kwam door een ontbrekend getal. Twee regels houden het beheersbaar:
  **(1) een veld mag er alleen in als het een getal verandert dat de app toont** (geen
  documentatie-velden), en **(2) deze velden voeden vensters, waarschuwingen en kruiscontroles —
  nooit de meetdata zelf**, anders modelleer je waar je meet.
  Coördinaten: baffle-vlak, oorsprong op het MEETREFERENTIEPUNT (waar de mic op gericht stond /
  de draai-as), +x rechts, +y omhoog, mm.
  **`trueOffAxisDeg` is de belangrijkste functie van het bestand.** Een horizontale draaitafel
  levert "0°/10°/20°/30°" van de KAST, niet van elke driver. Met de mic op afstand R en de kast
  θ gedraaid staat de mic op (R·sinθ, 0, R·cosθ); een driver op (x, y, 0) kijkt langs +z, dus
  cos φ = R·cosθ / |(R·sinθ−x, −y, R·cosθ)|. GEMETEN op Sanders eigen set (woofer 380 mm onder
  het referentiepunt, mic op 500 mm): zijn sweep dekt in werkelijkheid **37°→46°**, niet 0°→30° —
  de "0°"-curve staat al 37° van de wooferas af. Omdat directiviteit vlak begint en verderop
  steil wordt, is een 37→46-verschil veel groter dan een echte 0→30; **dát is waarom die woofer
  vanaf 300 Hz leek te bundelen**. De tweeter, die op het referentiepunt zit, geeft keurig
  0°→0°…30°→30° — de rekenkunde controleert zichzelf. Op 1,5 m zou dezelfde woofer 9,5°→31°
  dekken.
  **`micElevationDeg` (aug 2026, na Sanders `ver10`-vraag)**: een rig kan ook een vaste
  VERTICALE hoek hebben (+ = mic boven het referentievlak). Geen verfijning maar een
  hoofdterm: op een driver 380 mm laag bij 500 mm verschuift ±10° de ware hoek van 31° naar 43°,
  dus het veld is GETEKEND en wordt nooit geraden. 0 = de gewone situatie en reduceert exact
  tot de oude vorm. (Sanders eigen set bleek er géén te hebben: `ver10` in zijn bestandsnamen is
  geen verticale hoek — hij mat één horizontale sweep op 50 cm recht vóór de tweeter.)
  **HARD GELEERD — de gids had het mis over draaien**: hij zei "draai de kast, niet de mic, want
  een mic op een boog verandert ook de afstand". GEMETEN: met de boog gecentreerd op het
  referentiepunt en verticaal gestapelde drivers is de afstand tot élke driver exact constant
  (0,00 dB op 0° én 30° — de offset zit in de rotatie-as, dus hij valt weg). Mic-op-draaischijf
  is dus meetkundig identiek aan kast-op-draaischijf. Het échte argument voor de kast draaien is
  een ander: dan blijft de mic op ÉÉN plek in de kamer en dragen alle curves dezelfde reflecties,
  terwijl een reizende mic per stap een ander vloer-/wand-pad ontmoet. Alleen een HORIZONTAAL
  verschoven driver voelt de geometrie wel (90 mm opzij ⇒ 0,51 dB over een 30°-sweep).
  `rotationLevelOffsetDb`: het niveauverschil dat puur uit de rig-geometrie komt. NUL voor een
  driver recht boven/onder een verticale draai-as (draaien verandert die afstand niet), en
  alleen zichtbaar bij een HORIZONTAAL verschoven driver — daarom is een constante
  laagfrequente offset tussen hoekcurves een aanwijzing over de opstelling, niet over de driver.
  Verder: `farFieldVerdict` (afstand/bronmaat, werkregel ≥3× — Sanders 50 cm op een 300 mm-front
  is 1,7×), `pistonDiameterMm` (uit Sd; de eerlijke diameter voor élke ka-regel),
  `centreToCentreMm` (AFGELEID uit posities — hetzelfde feit twee keer intypen is precies wat we
  niet doen; verving twee handmatige velden van dezelfde dag), `baffleStepHz` (alleen gemeld:
  een on-baffle-meting bevat de step al, nog eens aftrekken telt dubbel), `nearestEdgeMm`,
  `listeningAngleDeg` (maakt van een afstandsregel een uitspraak over jouw kamer: een nul op
  ±25° is onschadelijk als je 2° van de as zit) en `boxRolloff`/`unloadingRisk` — een gesloten
  kast ÍS al een 2e-orde hoogdoorlaat, dus LR2 elektrisch geeft LR4 akoestisch, precies de
  hefboom waarmee die 88 µF ~30 µF wordt; een poort betekent bovendien dat de kast zélf midden
  kan uitstralen.
- `driverLimits.ts` — **"welke frequenties redt deze driver niet" (aug 2026, Sanders
  onderzoeksvraag)**. Er is GEEN enkele regel voor een kruispunt; er is een stapel
  onafhankelijke ongelijkheden en het ontwerpvenster is hun doorsnede. Alles hier staat op
  BESLISNIVEAU (venstergrenzen + rapportage), nooit in een objective — de anker-les.
  (a) **Breakup → f ≤ f_b/3**: een resonantie op f_b wordt aangeslagen als DERDE harmonische
  van f_b/3, dus de vervormingsprijs valt ruim een octaaf ONDER de piek. Purifi meet het exact
  (breakups 5/10 kHz → H3-pieken 1,6/3,3 kHz); onafhankelijk bevestigd op de Dayton RS180. Een
  notch repareert dit NIET (die dempt de grondtoon op de breakup, niet de harmonischen die er
  vanaf lager landen). Detectie = afwijking van een ±½-OCTAAF LOKALE trend — bewust niet van
  een bandbrede referentie: op een 50 dB-klimmende respons wijst een bandmediaan gewoon "waar
  de curve het hoogst is" (gemeten, en dé reden dat een eerdere poging is teruggedraaid).
  Impedantie-corroboratie wordt GERAPPORTEERD, nooit geëist. **Er bestaat geen gepubliceerd
  algoritme voor breakup-detectie uit SPL of Z** (de strenge route is laservibrometrie) — dus
  dit is ons eigen criterium en het hoort zichtbaar en uitschakelbaar te zijn.
  (b) **`KA_TIERS` — bundelingsdrempels uit de zuigerwiskunde**. Uit
  D(θ)=2J₁(ka·sinθ)/(ka·sinθ) op 30°: ka=1 → 0,27 dB · ka=2 (industriegrens "nooit boven
  gebruiken") → 1,11 dB · ka=3,83 → 4,34 dB. "−6 dB op 30°" (de intuïtieve grens) is ka=4,43 —
  dat getal definieert BEAMWIDTH (IEC 60268-5 §23.4.1), niet een kruispuntplafond.
  **HARD GELEERD OP SANDERS ECHTE 3-WEG-SET, en het draaide een wijziging van dezelfde dag
  terug**: de default blijft de EMPIRISCHE 4 dB, níét het theoretisch strengere ka=2. De
  zuigerformule veronderstelt een starre zuiger in een ONEINDIG SCHERM, terwijl een gemeten
  0°−30°-verschil bij lage frequenties vooral baffle-DIFFRACTIE is. Gemeten (grote woofer,
  Fs 73 Hz, nog op vol niveau tot 7 kHz): ka=1 → 150 Hz · ka=2 → 304 Hz · 2 dB → 373 · 3 dB →
  586 · **4 dB → 628**; en voor de mid: ka=2 → 1376 · 3 dB → 7802 · 4 dB → 8035. Bij ka=2
  "bundelt" die woofer dus vanaf 304 Hz — ónder de eigen 2×Fs-vloer van de mid (353) — en
  verklaart de tool een doodgewoon 3-weg-ontwerp onmogelijk. Let ook op de mid tussen 2 en
  3 dB: één decibel drempel verschuift het plafond een factor 5,6, want bij lage drempels
  haalt élke diffractie-wiebel de vasthoud-test. 4 dB is geen ronder getal maar het getal dat
  contact met meetdata overleeft. De strenge tiers blijven kiesbaar (correct voor een zuiger,
  en bruikbaar bij schone anechoïsche data of een bewust conservatieve filosofie).
  **De les onder de les**: dit was een onderzoek-gedreven wijziging die er in de literatuur
  onaanvechtbaar uitzag en pas op ECHTE metingen van de gebruiker sneuvelde — synthetische
  tests en de KOAN-set toonden het niet. Bijbehorend in
  directivity.ts: de vasthoud-slack werd `thresholdDb − 1` en is nu `× 0,75` — bit-identiek op
  de oude default 4, maar bij 1,11 dB zou "−1" elke wiebel accepteren.
  (b2) **MEERDERE DRIVERS PER TAK (aug 2026, Sanders "dubbele woofers is natuurlijk geen vreemd
  iets")**: `count` + `spacingMm` per tak (Setup-paneel, gepersisteerd). DE VALKUIL is welk getal
  je vermenigvuldigt: n drivers verplaatsen n× zoveel lucht, dus de excursievloer zakt met √n
  (`excursionFloorHz({count})` — vier woofers kopen één octaaf, niet vier), MAAR élke conus
  bundelt nog steeds als zichzelf. Sd blijft daarom de waarde van ÉÉN driver van het datasheet.
  De verleidelijke sluipweg — Sd alvast verdubbelen — maakt de excursievloer goed en het
  bundelplafond fout: 2×124,7 cm² leest als een zuiger van 178 mm waar de echte conus 126 mm is,
  dus je krijgt een directiviteitsschatting voor een driver die niet bestaat (in de app gezien,
  test pint beide diameters). Wat een array wél toevoegt is INTERFERENTIE: `lobingCeilingHz` op
  de ONDERLINGE afstand, en dat plafond ligt meestal ver onder conusbundeling (twee woofers
  205 mm uiteen loberen al op 837 Hz) — dát is de kwantitatieve reden dat een dubbele-woofertak
  laag wil overnemen. Zit in `physWin3` als volwaardig criterium naast beaming/lobing/breakup én
  in de toeschrijving ("(array lobing)"), want een venster dat je niet kunt toeschrijven kun je
  niet aanpassen.
  (c) **`lobingCeilingHz` — hart-op-hart-afstand**, pure geometrie, nul metingen: een voorwaartse
  nul kan pas bestaan vanaf d ≥ λ/2. **Dit is de kwantitatieve reden dat 3-wegs op 200–500 Hz
  kruisen** — woofer en mid zijn het verst uit elkaar staande aangrenzende paar (300 mm ⇒ 572 Hz
  bij k=0,5). LR4's "zero lobing error" gaat alleen over de FASE: het centreert de lob, het haalt
  de nullen niet weg. k is echt omstreden (0,25 puntbron · 0,5 geen nul · 1,0 Dickason ·
  1,1–1,3 Saunisto, die een ±25°-nul ACCEPTEERT voor een gladdere power response) en de bronnen
  optimaliseren verschillende dingen — dus instelling, geen constante.
  (d) **`effectiveBandIec` — IEC 60268-5 §21.2**, het enige criterium hier dat een NORM is en
  geen vuistregel: −10 dB onder het octaafgemiddelde bij maximale gevoeligheid, en "sharp
  troughs narrower than 1/9 octave shall be neglected" — precies de dip-immuniteit waar
  bandMetrics voor is uitgetrokken. Neemt de LANGSTE aaneengesloten run, niet eerste-tot-laatste:
  een gat dat de 1/9-octaafregel overleeft breekt de band echt af (in de test gevonden).
  (e) **`excursionFloorHz`** — SPL = 108,4 + 20log(f²·Sd·Xmax) (halve ruimte), dus
  f_min = √(10^((L−108,4)/20)/(Sd·Xmax)). Geverifieerd tegen Linkwitz' eigen gepubliceerde
  cijfer voor de D2905/9700 (hij zegt 101 dB @1400 Hz; formule geeft 100,8). NIVEAU-bewust, en
  dat is het hele punt tegenover een kaal Fs-veelvoud: dezelfde 1"-dome redt 587 Hz bij 90 dB
  en 829 Hz bij 96. Vraagt twee datasheet-getallen per driver (⚙ Settings, gepersisteerd);
  zonder die getallen vervalt het criterium stilzwijgend.
  App: `physWin3` voegt alle vier samen tot de W-M/M-T-vensters én rapporteert `limits` zodat de
  ⚙-uitlezing kan zeggen WELK criterium bindt ("572 Hz (lobing)") — een venster dat je niet kunt
  toeschrijven kun je niet aanpassen.
- `adjoint.ts` + `lbfgs.ts` — **analytische gevoeligheden + gradiënt-zoeker (aug 2026,
  Sanders ML-vraag)**. De vraag was of machine learning de optimizer kan verbeteren; het
  eerlijke antwoord was "niet in de objective (de anker-les, en een black box maakt élke
  diagnose van vandaag onmogelijk) — maar er ligt iets beters vóór in de rij". Dat is dit.
  `solveWithSensitivities` levert ∂H/∂(log10 waarde) voor élk component via de ADJOINT-methode
  uit de circuitsimulatie: uit G·v = I volgt ∂v/∂p = −G⁻¹(∂G/∂p)v, en omdat een passief netwerk
  RECIPROOK is (G symmetrisch) komt de adjoint λ uit DEZELFDE LU-factorisatie. Eén
  twee-terminal-stamp is één admittantie × een vast patroon, dus het matrixproduct klapt samen
  tot een scalair: **∂H/∂p = −(dy/dp)(λa−λb)(va−vb)/Eg**. Kosten: één extra driehoeks-solve per
  driver per frequentie i.p.v. één volledige her-solve PER COMPONENT — bij 20 slots een factor
  20 op elke gradiënt. `dbPhaseGradient` is de kettingregel naar de twee eenheden waarin élke
  objective hier geschreven is (dB en graden). Optioneel `dSeriesRdValue` voor het geval waarin
  de parasiet uit de waarde volgt (gemodelleerde spoel-DCR in de catalog-snap-fit) — zonder die
  koppeling is de gradiënt plausibel maar fout, en een optimizer daalt daar stil langs af.
  network.ts houdt bewust zijn eigen enkelvoudige solver: dat is het productiepad en de
  anker-les zegt niet aanraken wat niet stuk is. Élke gradiënt is tegen centrale eindige
  differenties van de PRODUCTIE-solver getest (R/L/C, geïnverteerde driver, meerdere outputs,
  gekoppelde DCR) — een verkeerde gradiënt "werkt" namelijk gewoon, hij daalt alleen slecht,
  en niets anders in de suite zou het merken.
  **HARD GELEERD (gemeten, 12 gevallen × 8/15/20 dims op echte KOAN-takken)**: L-BFGS is GEEN
  drop-in voor Nelder-Mead. Met één startpunt vond hij hetzelfde optimum vanaf nabije seeds
  (30–60× minder solves) maar VERLOOR drie keer vanaf verre seeds — een dalingsmethode
  committeert zich aan het dal waarin hij start, een simplex reflecteert nog rond. De fix is
  niet de daling slimmer maken maar de 10× snelheidswinst uitgeven aan DIVERSITEIT: vijf
  verstrooide deterministische startpunten, beste houden. Daarmee: **2 winsten, 10 gelijk,
  0 verliezen** tegen het volledige oude recept (simplex + restarts + blok-verfijning + polish
  + probe), bij 2,6× de snelheid. Dit is SEEDING — het enige mechanisme dat dit project
  herhaaldelijk veilig heeft bevonden om een prior in te brengen; de objective blijft onaangeroerd
- `filters.ts` — virtuele filters: BW/LR 1-4 + **Bessel 2-4** ('BS'; per-sectie
  frequentieschaling `f` in `sections()` — Bessel-secties delen geen gezamenlijke poolradius),
  peaking EQ + **lowShelf/highShelf** (analoge prototypes)
- `vfOptimizer.ts` — greedy optimizer: structuur-enumeratie (alignment-bibliotheek
  LR2/LR4/BW3/BS4 × polariteit) → adoptie van
  gebruikersbanden (budget = harde cap; snoeit goedkoopste-verlies-eerst) → greedy banden
  (peak + tilt-gated shelf-kandidaten, mag-peak + fase-peak-zaadjes, joint 6-dim met basisknoppen,
  band moet ≥1% verbeteren) → polish → **full-grid band-audit** (banden zijn getuned op het
  gedecimeerde binnengrid; elke band die op het VOLLE grid <0,5% kost gaat eruit — grote
  budgetten overfitten anders het binnengrid én verzwaren de passieve keten). Monotonie-vangnet.
  Directivity-bewust (angleData + `directivityWeight` + `ampTarget` on-axis/listeningWindow).
  EQ-bereik volgt de evaluatieband.
  **Prioriteit-envelop (jul 2026, Sanders "100% fase maakt fase slechter")**: de slider stuurt
  binnen pEff = 0,1+0,8p — in vfOptimizer, synthese én netOptimizer. Hard geleerd: bij échte
  100/0 verdwijnt de amplitudeterm en ruilt de optimizer een gesloopte respons (gemeten 4,4 dB
  rimpel) in voor een fase-metric die hij dan kan gamen — de overlap-gewichten die "fase-fout"
  definiëren zijn zelf amplitude-gevormd. Met envelop, best-of-rondes (app-flow): p 0,15→0,38 dB/
  3,7° … p 1,0→0,55 dB/2,2° — monotone gradiënt in beide richtingen (regressietest).
  **`acousticSlopes` (⚙ "Acoustic slope mid/tweeter", ook in netOptimizer)**: doel-helling voor
  de GEMETEN akoestische flank naast de kruising (least-squares over ~1 octaaf, dB/oct) — dé
  "akoestisch 4e orde bij de tweeter"-knop. Tekort weegt 2,5·(Δ/6)², steiler slechts 0,4× (meer
  bescherming is nooit erg); 'auto' = vrij (fallback). Geverifieerd end-to-end: doel 24 →
  gemeten 24 dB/oct op het gebouwde+getunede netwerk, afleesbaar in de 🎯 Targets-popup.
  **`phaseMetric` (jul 2026, Sanders drie-screenshots-les: "wij meten anders")**: de optimizer
  woog fase overlap-gewogen (spits op het kruispunt-centrum), het paneel telt uniform over het
  hele 20 dB-overlapvenster — bredere overlap trok de breakup het beoordeelde gebied in en
  75% fase oogde daardoor slechter dan 50/50. Default 'band' = exact de paneel-metriek
  (uniform gemiddelde, avgPhaseErrDeg ≡ paneel-avg) + P95-uitschieterterm (0,5·(P95/45)²) in de
  objective; 'overlap' = klassieke weging als terugval (⚙ "Phase metric", gepersisteerd,
  in vfOptimizer én netOptimizer — moet gelijk staan). Gemeten na ombouw: 50/50+2EQ →
  flatness 98 (avg 0,9°/P95 2°); 75%+4EQ → 95 (avg 2,2°/P95 7°, rimpel 0,23) — de omkering weg.
  **Trapmethode (jul 2026, Sanders regels)**: (a) `structurePreference` — HP/LP-voorkeur uit de
  ⚙-dropdown is BINDEND (ontwerper kiest het fundament; knieën/level/polariteit blijven vrij;
  Auto = vrije enumeratie). Bewust géén "override als beter": pre-EQ-structuurscores overdrijven
  alignment-verschillen die de EQ-treden later toch wegwassen (gemeten: LR4 2× "slechter" dan
  BW3/LR2 vóór EQ, gelijkwaardig erna — elke drempel wordt dan willekeur. (b) `targets`
  {rippleDb, phaseDeg} ("toereikend is variabel", ⚙-velden, default 0,5 dB/10°): escalatie stopt
  zodra beide gehaald — structuur alleen, dan pas EQ-banden; vangnet respecteert een
  doel-halend resultaat boven een lager-scorende seed (anders herrijzen gesnoeide banden).
  `stages` in het resultaat = trederapport (label + ripple/fase per trede, in de UI onder de
  optimizer-samenvatting). (c) `hpFloorHz` — automatische Fs-vloer (≥2×Fs uit de gemeten
  tweeter-Z-piek, App rekent hem uit en toont "HP floor … Hz (2×Fs)" in ⚙); knie-domein,
  bestaat los naast het (akoestische) crossover point.
  **`cutOnly` (sinds eind jul 2026 ALTIJD AAN — passief-only-doctrine, Sanders besluit:
  "deze tool is uitsluitend voor passieve filters")**: EQ-banden alleen ≤0 dB (boosts bestaan
  passief niet; plafond verlagen = shelf-cuts, niveau is gratis in de flatness-metric);
  boost-seeds geklemd, geadopteerde boost-banden op 0, vangnet telt een boost-seed niet als
  geldig. De ⚙-toggle "Passive-honest (EQ cut-only)" is VERWIJDERD (zijn "uit"-stand was per
  eigen tooltip voor actieve ontwerpen); App geeft hard `cutOnly: true` door aan vfOptimizer
  én designChain. De eerdere vrij-laten-nuance (boost-vrijheid gaf de optimizer iets meer
  ruimte, synthese normaliseerde toch) is bewust opgeofferd: handmatige invoer klemt op ≤0
  (EQ-gain-veld max=0, chart-dot-drag geklemd, driver-Gain-veld max=0 — pad de luidste), dus
  optimizer-boosts zouden waardes opleveren die de UI niet kan bewerken. Legacy-migratie
  (`sanitizePassiveSpecs`, bij project/autosave-restore): EQ-boosts → 0, positieve
  driver-gains als PAAR omlaag geschoven (gShift-stijl) zodat de woofer/tweeter-balans van
  een oud ontwerp exact intact blijft — één kant klemmen zou stil de balans verschuiven.
  Handmatige "Build passive filter" klemt bovendien zelf nog EQ-boosts (verdediging in de
  diepte) en landt sinds eind jul 2026 in een NIEUWE tab per build ("Passive build N",
  spring naar Network-tab) — de vaste Working-tab is alleen nog van de Optimize-flow.
  **`xoRange`** (UI: "Crossover point" = frequentie ± marge; App vertaalt naar [f−m, f+m],
  marge geklemd op ≥2% van f zodat marge 0 = "precies daar"; legacy lo/hi-projecten migreren
  naar centrum±marge): pint het **AKOESTISCHE kruispunt** — waar de gefilterde drivers elkaar
  écht kruisen — via een kwadratische octaaf-penalty (gewicht 30; geen kruising = 120 ≙ 2
  octaven ernaast — hard geleerd: bij 9 kocht de tuner op een grof netwerk liever een dode
  tweeter-tak dan een kruising), in
  de vfOptimizer ÉN de netOptimizer (anders drijft de componenttuner het weg). Hard geleerd
  (Sanders screenshot, jul 2026): knieën kooien werkt niet — knieën op 2200–2600 Hz gaven een
  echte overname op 1631 Hz, want met een 5–10 dB hetere tweeter ligt de akoestische kruising
  ver onder de elektrische knie. Knieën blijven dus vrij (de Fs-vloer is knie-domein en
  bestaat er los naast); vangnet wijst een seed met kruising buiten het bereik af.
  Gemeten na de fix: 2400±200 → overlap 2271 Hz op het gebouwde+getunede netwerk
- `synthesis.ts` — passieve synthese: topologie uit spec (ladder/L-pad/notch/**shelf→pad+bypass**),
  gradiënt-zoektocht (`lbfgs.ts` op `adjoint.ts`) in log-ruimte, bouwbaarheids-penalty, modes 'filter' | 'acoustic'
  (acoustic = FRD×filter tegen ideale vorm, level-vrij, EQ=gereedschap-niet-target, weging²;
  **level-vrijheid is gedempt**: drift-penalty 0,05·ΔdB² t.o.v. de seed-level — hard geleerd:
  ongebonden dreef een pad-zware tak ~20 dB weg en sloopte de tak-verhoudingen).
  **Invariant (regressietest!): herbouwd schema ≡ gefitte tak** — componenten worden in
  ELEKTRISCHE (rung-)volgorde uitgegeven (`Topology.order`); hard geleerd: mid-ladder-trap
  werd op slot-volgorde over de driver getekend → 10 dB-piek bij de knie.
  **Fundamentals (altijd aan, geen smaakknoppen)**: (1) rol-anker — laddersectie-elementen
  blijven ≤ ~×3 van hun textbook-seed (penalty 6·excess² in log10; hard geleerd: 57–105 µF
  "2e-orde" serie-cap = gedegenereerde topologie, de pool zat elders); (2) tweeter-drive-vloer
  — |H| ≤ −15 dB op ≤ knie/3 (stopband-weging is ~0, de vorm-metric ziet onbeschermde
  resonantie-aandrijving niet), ook in netOptimizer (kruising/3). Grote caps horen alléén in
  traps thuis.
  **Auto-correcties (gated op metingen)**: Zobel (R+C over driver, bij |Z|-stijging door de
  LP-band), Fs-LCR-trap (over driver, bij Z-piek onder de HP-knie), **top-octave hold**
  (pad+bypass-C, acoustic mode, als de driver-top >1,5 dB onder het passband-gemiddelde zakt —
  dé bewuste plafond-verlager). **`corrections: 'lean'` (trapmethode-trede 2, aan bij Staged)**:
  kale HP/LP-ladder eerst; haalt die `leanTargetDb` (= doel-rimpel) dan KLAAR (minder
  componenten), anders tweede pass mét correcties die ≥10% fit-winst moet betalen (recursieve
  twee-pass via `corrections: 'off'`). Klassieke vuistregels als kruisvalidatie: Zobel nodig bij
  |Z|-stijging >1,3× door de LP-band; Fs-trap overbodig als kruispunt ≥2 octaven boven Fs bij
  ≥2e orde. Oneven ordes krijgen een EERLIJKE ladder (order = aantal reactieve elementen;
  3e-orde = C-L-C, geen ontstemde 4e).
  **Alignment-bewuste seed (aug 2026)**: `deriveTopology` las `spec.hp.kind` NOOIT — élk element
  kreeg `1/(ω₀R)` respectievelijk `R/ω₀`, ongeacht Linkwitz-Riley, Butterworth of Bessel. Die
  coëfficiënt (0,1592) is **Q = 1**, en dat is geen enkel alignment dat de app aanbiedt: LR is
  Q=0,5 en BW 0,707, dus voor de standaardkeuze werd élke cap 2× te groot en élke spoel 2× te
  klein geseed. `ladderElementSeeds` (filters.ts) levert nu per ladder-element de Q en het
  werkelijke hoekpunt van zijn sectie (Bessel-secties liggen niet op de nominale knie, en die
  schaling KEERT OM voor hoogdoorlaat).
  **HARD GELEERD, en het is de anker-les in vermomming**: die betere waarde als `initial`
  gebruiken maakte twee acoustic-mode-resultaten SLECHTER — want het rol-ANKER hangt aan
  `initial`, dus dat was geen seed-wijziging maar een OBJECTIVE-wijziging. `initial` houdt nu
  bewust de historische Q=1-vorm (objective byte-identiek, waardepins groen) en de
  alignment-waarde rijdt mee als `altInitial`: een EXTRA startpunt in de multi-start. Het anker
  is toch een degeneratie-detector met ×3 speling, en de twee conventies schelen hooguit 2×.
  Bijkomend inzicht: een dubbelbelaste LADDER van orde ≥4 heeft sowieso niet de waardes van zijn
  gecascadeerde biquads (Dickason LR4-hoogdoorlaat: 0,2533 en 0,0563 voor de twee seriecaps,
  waar de per-sectie-Q-vorm 2× 0,1125 geeft — hun meetkundig gemiddelde). Geen van beide is
  "de" textbook-waarde, dus de fit start vanaf allebei en houdt wat wint.
  **Zoekstrategie (aug 2026 omgebouwd naar gradiënten)**:
  L-BFGS op de EXACTE adjoint-gradiënt van dezelfde objective (élke term is C1 in log-ruimte —
  de bewakers zijn allemaal `max(0,·)²`), vanaf VIJF verstrooide deterministische startpunten +
  een slot-daling vanaf de beste. Welke start wint wordt beslist door de SCALAIRE `objective`
  (dezelfde functie die de discrete catalogus-pass en de tests evalueren), dus een misstap in de
  kettingregel kan hooguit convergentiesnelheid kosten — hij kan de fit nooit een punt laten
  KIEZEN dat hij zelf als slechter meet. `converged` = L-BFGS-convergentie óf stationariteit
  (een verse daling vanaf het eindpunt vindt <3% meer). Dit verving simplex + restarts +
  blok-coördinaat-verfijning + polish-rondes + probe. GEMETEN op 8 echte KOAN-taken (filter- én
  acoustic-mode, 2–14 componenten): **3,4× sneller** (2688 → 791 ms), rmsDb identiek op 5 en
  BETER op 3 — de zwaarste (BW3 + 2 EQ, 14 slots) van 1614 → 274 ms, de acoustic-tweeter van
  1,37 → 1,14 dB. Volle synthesis-suite 15,9 → 5,5 s met alle 22 waardepins groen. **Fase↔vlakheid-trade zit in
  de priority-slider en is groot**: zware tweeter-tak p=0,15→0,41 dB/23°, p=0,5→0,9/17°,
  p=0,85→2,1 dB/8° (top −4 dB — "de 119 dB-inzak" is een fasekeuze, geen bug)
- `integration.ts` — score = overlap-gewogen cos(ε/2); klassen op 45/90/120° (fysische ankers)
- `phaseStats.ts` — fase-flatness-score/avg/P95/std over overlapgebied (à la Stefans screenshot)
- `verification.ts` — **model-vs-meting-overlay (aug 2026, de VALIDATIE.md-lus als
  feature)**: gemeten FRD van de gebouwde build tegen de gesimuleerde Combined.
  Twee normalisaties, allebei GERAPPORTEERD i.p.v. verstopt (echte fysische
  verschillen, geen modelfouten): niveau-offset = mediaan over de band (mean zou
  door de afwijking zelf getrokken worden — zelfde mediaan-doctrine als
  responseStats) en zichtbaar in de legend; mic-afstand = pure delay + constante
  offset least-squares op het fase-VERSCHIL gefit en verwijderd — het residu is
  de eerlijke fase-afwijking, de gefitte delay wordt getoond (ís de mic-afstand)
  en een offset ~180° flagt "likely wired INVERTED" i.p.v. stil corrigeren.
  Vergeleken op overlap van sim-grid × meetbereik × ZICHTBAAR bereik (gated
  LF-staart vervuilt het oordeel nooit; NaN buiten de band = chart tekent niks).
  UI: "Verification measurement"-slot op de Import-tab (één file, herladen
  vervangt, ✕ wist), overlay-serie in SPL, residu-serie in fase-chart,
  meas-Δ-stripitem (alert bij >3 dB). Persistent (`verifyFile` in ProjectState).
  HARD GELEERD bij de bouw: de autosave-effect heeft een EXPLICIETE dependency-
  lijst — nieuwe persistente state MOET daar ook in, anders slaat hij stil niet
  op (verify ontbrak eerst; in de browser gevonden doordat de reload hem kwijt was).
  **🔬 Compare wizard** (knop naast het Verification-slot, Import-tab): de lus als
  begeleide CHECKLIST in vier stappen (Design/Drivers/Measurement/Verdict) op het
  wizardSteps-lijstpatroon + Modal — elke stap leest live state (geen eigen flow),
  meting laden kan ín stap 3 via dezelfde loadVerification, stap 4 toont de
  verifyCompare-cijfers incl. inverted-flag.
- `responseStats.ts` — **Response flatness (jul 2026, Sanders "±dB kan ook op 1 plek zijn")**:
  hele-bereik-vlakheid van de combined SPL over het zichtbare bereik — score 0–100 uit de
  GEMIDDELDE |afwijking| t.o.v. het MEDIAAN-niveau (mediaan omdat een mean-referentie door
  de suckout zelf wordt meegetrokken), plus avg/P95/peak-±dB en within-% (±0,5/1/2 dB).
  **Score is bewust NIET-LINEAIR: 100·(1−(avg/2,5)^1,3), geijkt op ontwerpersoordeel**
  (Sanders les na de eerste, lineaire versie: zijn ±1,2 dB-peak curve kreeg 61 rood terwijl
  élke ontwerper "very good" zegt — een lineaire dB-schaal maakt de goede zone te duur):
  ±1 dB-klasse (avg ≈0,6) ≈ 85 groen "Very good", ±3 dB-wiebel (avg ≈1,5) ≈ 48 rood;
  kalibratietest pint de ankers. UI: topbar-chip "Response" (ok ≥85/warn ≥70) VERVANGT de
  Integration-chip; de SPL-strip leidt met Response flatness en integration/overlap/bandwidth
  staan er gedempt achter (`.strip-item.alert` kleurt integration alsnog rood <75 — sanity-
  lamp blijft zichtbaar bij polariteit/timing-fouten). Sanders keuze: integration naar de
  achtergrond, sturen op response- en fase-vlakheid. Display-only, optimizer-objectives
  ongewijzigd
- `tolerance.ts` — **bouwtolerantie-analyse (jul 2026, Sanders keuze uit de UI-ideeënlijst)**:
  worst-case-envelop om de combined SPL bij ±tol% op élk fysiek R/L/C-element
  (one-at-a-time hoekanalyse, 2N+1 solves, eerste-orde-som van de per-part-shifts =
  pessimistisch "alle fouten tegen je in"; RSS ernaast = realistisch bij onafhankelijke
  fouten) + per-part gevoeligheidsranking (waar 2%-parts lonen). Deterministisch, geen RNG.
  UI: "Tolerance band ±2/5/10%" in de Simulation-groep (gepersisteerd), envelop als fijne
  stippellijnen om de combined, strip-item "build ±5%: worst ±… · RSS ±… · sensitive L1, …"
  in het SPL-paneel; tolBand-memo herrekent live met dezelfde part-bron/vf-stacking/adjust
  als de sim (vf vóór of ná het netwerk vermenigvuldigen is equivalent — pre-applied).
  **N-weg (aug 2026, Sanders "ik vind wel dat onze optimizer competitie moet zijn voor zelfs
  iemand als een Troels")**: optionele `mid`-tak {response, adjust} ⇒ som via `pickSlotsN` +
  `combineN` (dunne-wrapper-vorm à la `computeDirectivityN`; zonder mid is de takkenlijst
  [low, high] en is het 2-weg-pad ongewijzigd — volle suite is het bewijs). Bestaansreden:
  juist het ontwerp met de MEESTE onderdelen kon de bouwbaarheidsvraag niet gesteld krijgen.
  Gemeten op Sanders 3-weg (24 parts): ±2% → worst ±0,67 / RSS ±0,30 dB · ±5% → ±1,67/±0,76 ·
  ±10% → ±3,35/±1,60; de drie gevoeligste slots zijn alle drie SPOELEN (B·L5, B·C1, B·L2),
  dus 2%-onderdelen dáár kopen bijna het hele verschil. NB het weegt WAARDE-spreiding, niet
  DCR- of driver-exemplaarspreiding — die laatste is in de praktijk de grotere post en kan
  geen enkele tool voorrekenen zonder twee gemeten exemplaren
- `directivity.ts` — per-hoek som (zelfde filter elke hoek), energy average, listening window (≤30°), DI
- `sonogram.ts` + `components/Sonogram.tsx` — directivity-sonogram: ±hoeken gespiegeld, discrete
  3 dB-banden (vloer −24 dB, sequentiële blauwe ramp, dark-mode flipt het anker), −6 dB-beamwidth-
  contour, scale genormaliseerd/absoluut (gepersisteerd), canvas-heatmap in SVG-frame
- `minphase.ts` — cepstrum-minimum-phase (fs 768k default; puur voor VituixCAD-vergelijkmodus)
- `timeDomain.ts` + `fft.ts` — EGD (bulk eruit), step response, ETC via IFFT
- `project.ts` — persistentie: raw files + design-state in JSON, versieveld, autosave localStorage.
  **v2 (aug 2026, trede 2b)**: standalone impedanties rol-gesleuteld in `zByRole`
  (`impedances` = alléén vxp-model-namen), plus `mid`-responsie, `angleFiles.mid`,
  `vFilters.mid` en mid-adjust-velden. v1 migreert bij LEZEN ('mid'→low, 'tweeter'→high,
  alleen zónder vxp — een echte vxp-driver mág "mid" heten); nooit herschrijven,
  fixture-tests pinnen migratie én dat het vxp-record onaangeroerd blijft
- `synthSchematic.ts` / `components/Schematic.tsx` — schema-rendering (ook van synthese-uitkomst).
  **Layout (jul 2026, Sanders overlap-screenshot)**: mergeSynthesizedSchematics plaatst elke
  tak DYNAMISCH 5 rijen onder het diepste punt van alles erboven (vaste ROW=16 botste zodra
  een tak een 3-elements keten kreeg: mid-ketens dwars door de tweeter-rij); spreadShunt
  spreidt buur-ketens 6 kolommen (bij 4 overlapten de waarde-labels)
- `tidyLayout.ts` — **"Tidy layout"**: hertekent elk schema VANUIT DE NETLIJST (zelfde partIds/
  params/locks/polariteit, regressietest: identieke transfers + geen enkel kruisend
  component-lichaam). Per driver: serie-pad = BFS over element-GROEPEN (parallelle leden per
  knooppunt-paar), nooit door ground; parallelle serie-groepen ≤3 = bus + gestapelde lussen
  (pad+bypass, parallelle LCR-trap); lineaire ketens naar ground = kolommen (direct-naar-ground-
  groep met meerdere leden = de NORMALE situatie — elk lid eigen kolom, hard geleerd); takken
  dynamisch gestapeld. **Zelfde-knoop-ketens gesorteerd op LC-resonantie** (`chainSortKey`,
  laag → hoog van links naar rechts, Sanders wens; alleen bínnen één knoop — volgorde over
  serie-elementen heen is elektrisch bepaald; L-only = 0, C-only = ∞, regressietest).
  **"➕ Add notch" plaatst vóór de driver** (App `addNotchTrap`): loopt per grid-eenheid naar
  links de tussenruimte in; kolom afgewezen bij punt-botsing (punt-coïncidentie zou twee traps
  stil tot één SAMENSMELTEN — echte bug, gefixt) of horizontaal component-lichaam eroverheen;
  terugval naar rechts. Draait daarna AUTOMATISCH tidy (Sanders wens) zodat notches meteen
  gesorteerd landen; tidy-weigering (exotische topologie) = handmatige plaatsing blijft, één
  commit = één undo-stap voor trap+redraw samen. BEWUST conservatief: bruggen/gedeelde serie-secties/vertakkende ketens/
  open-shorted parts → null = originele tekening blijft (mooi-maar-fout hertekenen is liegen).
  UI: auto bij .adsfilter-import (oude exports dragen hun kramp-layout in het bestand mee —
  Sanders "near perfect"-import) + "Tidy layout"-knop in de editor-toolbar (undo-baar);
  vxp-varianten van Stefan worden NIET aangeraakt (zijn tekening, zijn indeling)
- `help.ts` + `components/HelpPanel.tsx` — **in-app handleiding (❓ Help in de topbar, jul 2026)**:
  Nederlandstalige content (UI-labels blijven Engels zoals in de app) als pure data
  (`HELP_SECTIONS`, blokmodel p/h/ul/steps met alleen `**bold**`/`` `code` ``-markup),
  doorzoekbaar (`searchHelp`, AND-semantiek over titel+keywords+body, markup gestript) en
  contextueel: de knop opent op de sectie van de actieve design-tab (`helpSectionForTab`).
  Panel = busy-overlay + brede `.help-card` (TOC links, scrollende body rechts; niet-matchende
  TOC-items gedimd; Esc sluit). Secties: snelstart, per tab, **"🤖 Onder de motorkap: de
  optimizer"** (Sanders wens: de keten in vogelvlucht, de vuistregels — rol-anker,
  tweeter-vloer, serie-pad-plafond, gated Zobel/Fs-trap, vrije knieën, krimpladder,
  kosten-op-beslispunten — en de vangnetten — nooit-slechter, full-grid audit, dode-tak,
  safety-gate, doel-barrière, drift-catch — in gewone-mensen-taal, zonder codenamen),
  wizard/catalogus, grafieken, scores, fase-concepten (measured/minimum/excess),
  VituixCAD-uitwisseling, sneltoetsen, troubleshooting. Tests bewaken unieke ids,
  gebalanceerde markup en de tab-mapping — nieuwe features horen hier een
  sectie-update te krijgen
- **Ontwerp-vergelijking (`tabCompare`, aug 2026, roadmap-punt 1)**: de ghost-curves tonen
  VORM, deze tabel beantwoordt "welke bouw ik" — Response-score, avg/piek, slechtste-paar
  fase + P95, Z-min (⚠ onder de vloer), aantal onderdelen en BOM-totaal per opgeslagen tab.
  Ingeklapt onder de tabs (`<details>`; met één ontwerp zegt hij niets en hij mag het schema
  niet wegduwen), rij aanklikken = naar die tab. Eén solve per tab door DEZELFDE pijplijn als
  de live sim (gemeten Z, dezelfde tak-adjusts), zodat een rij zichzelf niet kan vleien met
  een andere meetlat; in 3-weg via `slotTransfersN` + `combineN` met de WORST-paar-regel voor
  fase (een gemiddelde verbergt één slechte overgang). Werkt dus óók in 3-weg — anders dan de
  ghost-overlay, die 2-weg-only bleef. Een tab die naar een niet-geladen driver verwijst meldt
  "not solvable" i.p.v. een getal te verzinnen.
- `report.ts` + "Export report" (Network-toolbar, aug 2026, Sanders "printbaar, en
  misschien ook als import als we gaan vergelijken") — ÉÉN ontwerp als zelfstandige HTML
  die drie dingen tegelijk is: printbare bouwdocumentatie (A4, `@page`, geen paginabreuk
  ín een grafiek of tabelrij), een pagina die iemand zónder deze app kan lezen, en een
  BESTAND DAT DE APP TERUGLEEST. Dat laatste is Sanders idee en de reden dat er géén
  tweede formaat bij komt: de `.adsfilter`-payload rijdt verbatim mee in een verborgen
  `<script type="application/json">`, en `deserializeFilter` vist hem eruit — één
  importknop accepteert dus JSON én rapport. Escaping van `</` in de payload is getest
  (een ontwerpnaam met `</script>` zou het blok anders vroegtijdig sluiten).
  **Grafieken en schema worden NIET opnieuw getekend**: de App levert de SVG aan die al
  op het scherm staat (`.analysis-pane .panel` in volgorde + `svg.sch-canvas`), dus het
  rapport kan niet afwijken van wat de ontwerper zag — en de à-la-carte-panelen bepalen
  vanzelf wat erin komt. Twee gevolgen die daarbij horen: de captured markup stijlt
  zichzelf via CSS-variabelen (App zet tijdelijk `data-theme="light"`, leest ze uit en
  herstelt het thema — papier is wit), en de legend is een DOM-element náást de SVG, dus
  die reist als data mee. Het schema kwam eerst LEEG mee: al zijn lijnen zitten in
  klassen (`.sch-wire`, `.sch-symbol line`, …), niet op de elementen — die regels staan nu
  in de rapport-CSS.
- `filterFile.ts` — filter-uitwisseling: één ontwerp-tab als standalone .adsfilter.json
  (formaat-marker + versie + validatie); Export-knop (actieve tab) / Import (nieuwe tab)
- `filterTemplates.ts` — **netwerk-templates ("New from template", Network-toolbar)**: het derde
  startpunt naast Import en de optimizer — "snel kunnen knutselen" (Sander). Kiezer = weg-keuze +
  orde-dropdown: `Blank (drivers only)` (= de oude kale generator+drivers via `templateSchematic`)
  of 1e–4e orde (6/12/18/24 dB/oct). Waardes zijn **GENERIEK** (Sanders keuze — bewust NIET op de
  gemeten Z gefit): Butterworth-achtige ladder op een neutrale **8 Ω / 2,5 kHz-referentie**
  (`A=R/2πfc`, `B=1/2πfc·R`); de topologie (part-count + series/shunt-rollen) is het punt, de
  gebruiker tuned de waardes. LP-tak (eerste model) + HP-tak (laatste model) via
  `mergeSynthesizedSchematics`, dus een template landt met dezelfde nette layout als een
  synthese-uitkomst (Tidy-layout werkt er meteen op); de HP-ladder is de DUALE van de
  LP-prototype (L↔C, reciproke coëfficiënt). **3-weg is gescaffold maar nog niet gebouwd**
  (toekomstige N-weg-bouw): de dropdown toont "3-way (coming soon)" disabled, `supportsWayCount`
  gate't de UI — uitbreiden = die functie + een bandpass-ladder toevoegen. Test verifieert per
  orde geldigheid/oplosbaarheid/hellingsdiepte + part-count
- `catalog.ts` — componentenbibliotheek-fundament (fase 3): echte PRODUCTSERIES in een
  merk-onafhankelijk formaat (`CatalogSeries` + `CatalogPart`: kind L/C/R, value, seriesR,
  wireMm, powerW, priceEur optioneel — géén verzonnen prijzen; waarderoosters = E12 binnen
  serie-bereik, SKU's later verfijnbaar). Series: Jantzen Air Core/Cross Coil + Mundorf MCoil
  (DCR = 1,4mm-fit × (1,4/d)²), Jantzen Cross-Cap/Standard Z/Superior Z/**Alumen Z-Cap** +
  Mundorf MCap/Supreme, Jantzen Superes/MOX + Mundorf MResist (met wattage). In de editor-
  inspector: serie-dropdown (merkkeuze, onthouden per soort) + `nearestParts`-suggestieknoppen;
  klik past waarde + DCR/ESR toe (R: alleen waarde). **Uitbreidbaar via catalogFile.ts**:
  Export catalog = bewerkbare JSON-template, Import voegt eigen merken/series toe (custom
  series in localStorage 'ads-custom-catalog', builtin-ids worden bij import genegeerd).
  **Ontwerpprincipe voor de discrete optimizer (Sander)**: componentkwaliteit is positie-
  afhankelijk — serie-pad (serie-C tweeter, serie-L woofer) premium, shunt/notch-onderdelen
  budget (daar volstaan goedkope componenten); de rol-info uit de synthese maakt dat mogelijk.
  **Catalog-snap (toggle in ⚙ Settings, `catalogSnap` in synthese)**: continue fit rekent dan
  al mét gemodelleerde parasieten (1,4mm-DCR, ESR 0,02), daarna discrete coördinaat-descent
  over de 3 dichtstbijzijnde catalogus-onderdelen per slot (mét joint moves voor L/C-buren —
  resonantieparen!) geëvalueerd met échte DCR/ESR; keuzes landen als catalogLabel+seriesR in
  components én als DCR/ESR-params in het schema. KOAN-tweetertak: vrij 0,73 → snapped 0,88 dB.
  Hard geleerd: catalogus-ondergrens te krap (spoelen <0,1 mH bestaan!) gaf 2,3 dB — bereik-
  fouten in de catalogus zie je als mysterieuze fit-verliezen; idem decade-dekking: een
  ontbrekende decade knipte geïmporteerde series stilletjes af op 82 µF/8,2 mH (elco's tot
  330 µF en kernspoelen tot 33 mH bestonden niet echt).
  **Catalog-formaat v3 (jul 2026, Sanders Gemini-update)**: per serie optioneel
  `eSeries`/`series_type` (E12|E24-rooster, gehonoreerd in buildCatalog), `tier`
  (budget/standard/premium — brandstof voor positie-voorkeur, nog ongebruikt),
  `basePrice`+`costFactor` (prijs = basis + factor×waarde → priceEur op elk part, in
  inspector-labels "· €x" en BOM-totaal) en `dcrFactor` (kernspoelen ~0,35 — zonder is de
  luchtspoel-fit te pessimistisch). Beide spellingen (snake/camel) geaccepteerd; import met
  een builtin-id OVERSCHRIJFT de builtin (zo landt een update); Gemini's echte bestand is
  regressie-fixture (gemini-catalog-v3.json).
  **Netwerk-snap (netOptimizer `catalogSnap`, slotstuk ná tune/prune/escalatie)**: hard
  geleerd — de tak-synthese snapte wél, maar de componenttuner ontsnapte alles weer continu
  (Sanders BOM vol "no exact catalog value" mét Snap aan). De tuner eindigt nu zelf met een
  discrete coordinate-descent op het GEASSEMBLEERDE netwerk (pickCandidates incl. stacks,
  echte DCR/ESR als params teruggeschreven, zelfde handicap+kostendruk); gemeten: BOM 20/20
  priced, 0,24 dB/2,8° na snap. Catalogus-import/export óók op de Import-tab ("N series ·
  prices loaded") — de catalogus hoort binnen te zijn vóór de optimizer draait.
  **Catalog v4 (jul 2026, Sanders/Gemini exacte SKU-database)**: platte `components`-array met
  échte marktonderdelen (sku, value, dcr/esr per stuk, gauge, tier, price) — exacte parts
  SCHADUWEN het gegenereerde rooster van dezelfde brand+series; niet-gedekte series behouden
  hun rooster (dekkingsgat = stille fit-schade, dus nooit alles weggooien). partSeries()
  synthetiseert serie-entries zodat inspector-dropdown/seriesId-filters ze zien. JSON-fouten
  melden nu de parse-positie (Gemini's bestand had een losse quote op regel 108).
  **ECHTE SKU's BOVEN GEGENEREERDE ROOSTERS (aug 2026, Sanders "gewoon een goed werkende app")**:
  met een echte database geïmporteerd is een rooster-entry FICTIEVE VOORRAAD. Gemeten op zijn
  3-weg: drie grote caps snapten op het ingebouwde "Standard Z-Cap"-rooster (22/56/91 µF) — een
  serie die niet in zijn 2388-SKU-import zit, op een E24-waarde die het product niet kent —
  terwijl een echte, geprijsde Cross-Cap ernaast lag. Rooster-entries dragen geen prijs, dus ze
  lazen ook nog eens als GRATIS voor de kostenterm: ontbrekende data werkte als korting. 10 van
  25 BOM-regels kwamen prijsloos én onbestelbaar uit de snap. `pickCandidates` filtert de pool
  nu op `CatalogPart.real` (gestempeld op de IMPORTGRENS in `setCustomSeries`) vóór de
  nearest-value-wandeling, op dezelfde 25%-reikwijdte als de pool-terugval, en ALLEEN waar echte
  onderdelen de waarde kunnen dekken — het rooster wholesale weggooien heropent het
  dekkingsgat-scenario, dat als mysterieus fit-verlies verschijnt i.p.v. als fout. Na de fix:
  25/25 met prijs. NB de eerlijke prijs van eerlijkheid: het "vlakkere" ontwerp van daarvóór
  (2,22 dB) leunde op die fictieve caps en was dus nooit bouwbaar.
  **Catalog v6 (jul 2026) + multi-gauge-doctrine**: het versieveld is INFORMATIEF — Gemini
  bumpt het per DATA-revisie, niet per formaat (v6 = v4-formaat met 169 SKU's: volle E12,
  sub-µF bypass, elco's tot 330 µF, MResist Supreme €14,50 als premium-gat-vuller, en
  spoelen in 0,7/1,0/1,4 mm per waarde); deserializeCatalog accepteert elk numeriek versienr,
  de structurele validatie is de échte poort. Multi-gauge: `nearestParts`/snap-kandidaten
  tellen `count` als DISTINCTE waardes en laten alle gauge-varianten van die waardes meerijden
  (naïeve top-3 = 3× dezelfde waarde in drie diktes → waarde-diversiteit weg; nu weegt de
  descent DCR↔prijs per gauge — Sanders 0,47 mH-slots kozen 0,7 mm €3,40 vs 1,0 mm €4,50).
  Distance-tie: geprijsd/exact SKU wint van gegenereerd rooster-part van dezelfde waarde.
  Bijvangst: de BOM vindt nu ook 2-caps-stacks binnen 1% voor niet-E-waardes (10,37 µF =
  4,7+5,6). Fixture gemini-catalog-v6.json. **R-rooster-gat gedicht (jul 2026)**: MOX 0,68 en
  0,82 Ω toegevoegd (JAZ-MOX-10-0R68/0R82, echte Jantzen 10 W SKU's) — MOX sprong eerst
  0,47→1,0 en de 0,68 Ω B·R15 was de enige "no exact catalog value" in de BOM; weerstanden
  stapelen we bewust niet, dus die waardes moesten als SKU's in de database.
  **Alumen-cap-gat gedicht (jul 2026)**: de import miste de Jantzen Alumen Z-Cap-serie
  volledig, dus caps vielen terug op het INGEBOUWDE (prijsloze) Alumen-rooster → "—" in de BOM
  (Sanders klacht). Echte serie toegevoegd (JAZ-ALU-10…100, 1–10 µF E12, premium, prijzen
  verankerd op directe Audiophonics-productpagina's 2,2/4,7/6,8/8,2 µF ≈ €54,50/69,60/88,60/
  98,30, tussenwaardes lineair geïnterpoleerd; echte Alumen bestaat NIET boven 10 µF — de oude
  33/91 µF "Alumen" in de BOM waren builtin-rooster-artefacten). Exacte SKU's schaduwen het
  builtin Alumen-rooster, dus na her-import + her-snap landen kleine premium-caps op echte
  Alumen-waardes en grote shunt-caps op de elco's/Superior die al in de import zaten.
  **Prijsverificatie-ronde (jul 2026, Sanders "zijn de andere prijzen wel correct?")**: Gemini's
  prijzen bleken SCHATTINGEN, systematisch te laag maar NIET-uniform (geen globale factor):
  Air Core ~2×, Zero-Ohm-spoel ~4× (€36,80→€149,90 echt bij 1 mH!), Superior Z ~1,84×, MOX
  ~2,15×, MResist ~1,72×, terwijl Wax Coil juist ~correct was. Per-serie gecorrigeerd op echte
  NL/EU incl-BTW ankers (SoundImports/Audiophonics/Mundorf): flat MOX €1,40 / MResist Supreme
  €24,90; mult Air Core ×2,0, Wax Coil ×0,88, Zero-Ohm ×4,07, Superior Z ×1,84, Cross-Cap ×1,4,
  Duelund CAST ×1,25; goedkope ongedekte tail (Aronit/P-Core/Audyn/elco/Superes) kreeg een
  LAGE-confidence schatting (~1,2–1,8×, kleine BOM-impact); MCap Supreme/Alumen bleven staan
  (≈ echt/geverifieerd). Beide bestanden identiek herprijst met regel-voor-regel patch (opmaak
  behouden); MRES-3R3-fixturetest bijgewerkt 14,50→24,90. Het BOM-totaal wordt gedomineerd door
  de premium-spoelen/-caps (nu accuraat); de tail is indicatief. Reprice-script staat in de
  scratchpad, niet in de repo.
  **🗂 Catalog manager (jul 2026, Sanders "beheer tool voor het catalogus-bestand")**:
  in-app SKU-beheer — toevoegen/bewerken/verwijderen zonder de export→handmatig-editen→import-
  lus (de bron van de losse-quote/decade-gat/schattingsprijs-incidenten). `catalogManager.ts`
  (upsertSku/removeSku/skuError/gridShadowNote + display-unit-helpers mH/µF/Ω, unit-getest) +
  `CatalogManager.tsx` (overlay à la HelpPanel: gefilterde SKU-tabel, edit-form met dezelfde
  validatie als de import, staged draft — niets raakt de live catalogus tot **Save**; dirty-
  close vraagt bevestiging). Save = zelfde persistentie-pad als import (setCustomSeries +
  localStorage); knop "🗂 Manage…" in beide Catalog-groepen (Import- én Network-tab).
  `gridSeriesFor` in catalog.ts voedt de waarschuwing dat de éérste exacte SKU van een
  merk+serie het gegenereerde rooster schaduwt. **Roundtrip-fix als fundament**:
  deserializeCatalog las alleen dcr/esr terug terwijl serializeCatalog `seriesR` schrijft —
  export→reimport verving gemeten DCR/ESR stilletjes door schattingen; leest nu ook seriesR
  (regressietest). Form-reset houdt brand/serie/tier vast (serie-reeksen invoeren).
  **Series-weergave (zelfde sessie, Sanders "wil ik er ook bij")**: SKUs|Series-toggle in het
  panel; series-tabel = builtins + custom via `managedSeries` (bron-badge builtin/override/
  custom + ⛱N = geschaduwd door N exacte SKU's; part-derived series staan er bewust NIET in —
  die bewerk je via hun SKU's). Ingebouwde serie bewerken = override met hetzelfde id
  (import-semantiek), ↩ verwijdert de override en de builtin keert terug (`builtinSeries()`
  export). Edit-form per kind: bereik (display-units), E12/E24, gauges/dcrFactor (L),
  esr (C), powerW (R), basePrice/costFactor, tier; validatie `seriesGridError` spiegelt de
  file-reader incl. "nieuw id mag niet per ongeluk een builtin claimen". Save commit series
  én parts samen (App `saveCatalogParts(series, parts)`).
  **🧙 Component wizard (knop naast ⚙ Settings)**: kwaliteitsprofiel (Auto / Positie =
  Sanders doctrine serie-pad premium·shunt budget / Budget / Balanced / Premium) + BINDENDE
  merk/serie-keuze per soort (L/C/R, Auto = vrij) — gepersisteerd, gevoed aan beide snaps via
  `SnapPrefs`. Positie: synthese uit slot-ROLES; netOptimizer via bus-pad-BFS (element met
  beide knopen op een source→driver-pad = serie-pad). **Hard geleerd: terugval moet
  WAARDE-bewust** — een voorkeurs-pool die de waarde niet dekt (premium caps stoppen bij
  10 µF, slot vraagt 15) moet doorzakken naar de volgende pool i.p.v. 20% waarde-fout
  forceren (kostte 1,8 dB); `covers` = beste kandidaat binnen 25%.
  **BOM-attributie (Sanders "premium wordt niet gebruikt")**: de snap SCHRIJFT zijn keuze op
  het part (`VxpPart.catalog` = SKU of 'SKU+SKU'; retune wist het veld, bomFor verifieert som
  vs waarde vóór vertrouwen) — op waarde alleen is 10 µF vijfvoudig ambigu en toonde de BOM
  het verkeerde broertje, wat las als "wizard genegeerd". Fallback zonder veld: tie-break op
  DCR/ESR-param, en bij gelijke waarde wint een GEPRIJSD SKU van een prijsloos rooster-ghost
  (jul 2026-fix, à la `nearestWithVariants`): een kále cap op een cataloguswaarde matchte anders
  het ingebouwde 10 µF-rooster i.p.v. het geprijsde import-part → BOM las "geen prijs" mét
  volle catalogus. Geverifieerd: premium-profiel → Superior Z €28,70 / Duelund CAST €28 in BOM.
  **🧙 Wizard is een echte gids (4 stappen)**: Goals (staged+targets, prioriteit) → Crossover
  (punt±marge, HP/LP-voorkeur, akoestische hellingen, Fs-vloer-melding) → Components (snap,
  tier-profiel, merk per soort, stapel-toggle, catalogus-status) → Summary + 🚀 Optimize.
  Zelfde state als ⚙ Settings (één bron).
  **Bewust stapelen (Sanders regel)**: een voorkeurs-tier/serie stapelt EERST binnen zichzelf
  (premium 15 µF = 10+4,7 premium) vóór hij een tier zakt; `allowStacks:false` (wizard-toggle,
  gepersisteerd als snapStacks) = alleen singles. De netwerk-snap rekent bij stack-gebruik ook
  de singles-only variant door en rapporteert het verschil in de note ("snap: N stacks —
  singles-only would fit X% worse and cost €Y less") — kiezen mét cijfers, geen verrassing in
  de BOM. Dit verving Sanders idee van 3 volledige vergelijkings-simulaties (te duur; de
  stapel-keuze valt pas in de snap-fase, dus dáár vergelijken is gratis).
  **UNIFORME BANKEN (aug 2026)**: naast het gemengde PAAR biedt `stackCandidates` nu ook
  N IDENTIEKE onderdelen (2×/3×/4×) — de realisatie die een echte bouwer kiest. Gravesen bouwt
  zijn 88 µF als 4×22 µF en noteert op zijn eigen schema "C2011 can be 88-99 uF without
  impacting performance". Het is meer dan netheid: **premium film STOPT rond 22 µF** (Jantzen
  Superior Z-Cap houdt daar op), dus zonder banken kan de premium-pool een mid-hoogdoorlaat
  helemaal niet dekken en zakt de snap gedwongen een tier — de klacht "de wizard negeert mijn
  premium-keuze", maar veroorzaakt door rekenkunde i.p.v. door de tier-logica. Banken scherpen
  bovendien de tolerantie (N onafhankelijke delen sommeren op ~σ/√N), en juist tolerantie — niet
  het diëlektricum — is wat de metingen als het echte risico aanwijzen. ESR deelt door N, DCR
  telt op. Gelijkspel op waarde gaat naar de realisatie met de MINSTE fysieke delen.
  **BOM is stapel-bewust**: geen single-match → 2-delige stack-match (som binnen 1%, met
  prijs) — de netwerk-snap bouwt stapels en de BOM moet ze kunnen benoemen i.p.v.
  "no exact catalog value" (Sanders klacht).
  **SPOEL-DCR IS EEN POSITIE-EIGENSCHAP, GEEN TIER (aug 2026, Sanders "de doctrine moet
  natuurlijk de beste spoelen kiezen waar het er toe doet")**: bij een CAP betekent budget een
  ander diëlektricum — elektrisch bijna dezelfde component. Bij een SPOEL betekent budget
  DUNNER DRAAD, en DCR is een eersteorde-parameter: het verandert het filter, de demping en het
  impedantieminimum. Tier kán dat niet uitdrukken, want tier leeft per SERIE terwijl gauge per
  SKU varieert — élke Air Core van 0,3 tot 1,8 mm draagt dezelfde tier. `dcrCeilingOhms`
  (catalog.ts) vertaalt de positie daarom in een DCR-budget uitgedrukt in dB NIVEAUVERLIES
  (`DCR_BUDGET_DB` = serie 0,5 dB · shunt 2,0 dB) tegen de GEMETEN mediaan |Z| die het netwerk
  in werkt (`refOhms`, netOptimizer levert hem) — schaalvrij, dus een 4 Ω-mid krijgt vanzelf een
  strakker plafond dan een 8 Ω-woofer. Toegepast op de POOL vóór de nearest-value-wandeling
  (anders wordt de shortlist volgemaakt met te dun draad) en het is FEASIBILITY, geen voorkeur:
  hij geldt óók bij profile 'auto' en bij de volle-catalogus-terugval. Weigert nooit alles — als
  élke variant over budget is blijft de dikste staan, zodat een slot altijd iets heeft om naar
  te snappen en de eerlijke DCR gewoon zichtbaar wordt.
  **WAAROM EEN GUARD NODIG IS TERWIJL DE SOLVER DCR AL MODELLEERT**: de tuner compenseert hem
  gewoon elders, de responsie blijft vlak, en je betaalt in RENDEMENT — wat geen enkele
  responsmetriek ziet. Exact de blindheid die solo-modus al had opgelost met
  `sensitivityBudgetDb`; 3-weg had hem nooit gekregen.
  **HARD GELEERD — de oude catalogus was PER ONGELUK veilig**: met 27 handmatig samengestelde
  Air Core-onderdelen (3 diktes, hoogste DCR bij ≥1 mH = 1,45 Ω) bestond een elektrisch onzinnige
  keuze domweg niet. De aanvulling tot het volle assortiment (11 diktes, tot 24,76 Ω) haalde dat
  onbedoelde vangnet weg en de kostendruk pakte prompt de dunste draad: Sanders 3-weg-run kwam
  terug met een 2,4 mH-spoel op 0,3 mm à 6,43 Ω in de mid-tak (~11 Ω spoelweerstand in die tak,
  was ~3,6 Ω). Een catalogus completer maken kan dus een bewaker slopen die niemand had
  opgeschreven omdat de dataset hem impliciet leverde.
  **GEMETEN end-to-end op Sanders 3-weg-set (volle scan, 4 kandidaten, vóór/ná de guard)**:
  spoelweerstand in de mid-tak 11 → 2,7 Ω (B·L4 6,43 → 1,80 Ω · B·L9 2,50 → 0,15 · L3 1,49 →
  0,31); Response 69 → 74 (avg ±1,02 → ±0,89); W-M-fase 13,3° → 12,3°; Z-min-dip verplaatst van
  359 Hz — midden in de W-M-kruising — naar 2731 Hz; BOM €47 → €50. Ook de drie VERLIEZENDE
  kandidaten werden beter (3,97 → 2,79 dB), dus de guard tilt de hele scan op en niet alleen de
  winnaar. NB expliciet NIET opgelost hierdoor: Z min blijft 2,2 Ω onder de 2,5-vloer (andere
  oorzaak — drie parallelle takken rond de lage overname) en de W-M-P95 blijft 40° tegen de 26°
  die de losse componenttuner eerder haalde; dat verschil scan-vs-tune is nog onverklaard.
  **Budget-druk in de snap (`costWeight`, default 0,0015)**: kandidaat-score ×(1+w·ΣEUR) —
  tussen (bijna-)gelijkwaardige realisaties wint de goedkope; "lagere waardes = goedkoper"
  volgt vanzelf uit het prijsmodel. Tie-breaker, geen kwaliteitsruil (€20 ≈ 3% fit); zonder
  prijzen in de catalogus doet hij niets. Regressietest: mét druk nooit duurder, fit in
  dezelfde klasse. **Stapelen (jul 2026, Sanders
  doctrine "enkelvoudig waar het kan")**: `pickCandidates` biedt naast singles ook 2-delige
  STACKS (spoelen in serie / caps parallel — waardes tellen op; DCR som / ESR parallel), maar
  alléén als het beste enkele onderdeel >3% mist; de discrete pass rekent 5% fit-handicap per
  extra fysiek onderdeel, dus een stack moet zich echt bewijzen. Label: "… 33 µF + 15 µF
  (2× in parallel)" landt in catalogLabel/BOM; in het schema blijft het één slot
- `netlistEdit.ts` — netlijst-laag: validatie (fouten + floating-warnings), node-hernummering,
  `estimateCoilDcr` (0,29·(L/mH)^0,65), netlist-level template/merge/synthese-conversie (API
  voor de discrete optimizer van fase 3)
- `schematicEdit.ts` + `components/SchematicEditor.tsx` — stap 6 fase 2: drag & drop editor.
  **Het schema ís het netwerk** (VxpCrossover-vorm, verbinding = coördinaat-coïncidentie,
  `crossoverToNetlist` leidt de netlijst af; let op: draden verbinden alleen op hun PUNTEN).
  `movePart` sleept nooit gedeelde punten mee maar legt stub-draadjes oud→nieuw terminal —
  slepen kan een circuit NOOIT breken (hard geleerd: eindpunten meeslepen sloopt junctions).
  Verder: addPart/addWire (elleboog-routing)/rotate/setPartParam, templateSchematic,
  mergeSynthesizedSchematics (één gedeelde generator), undo-stack in App (50 diep).
  Actief netwerk vervangt de vxp-variant in de sim. **Ontwerp-tabs**: elk netwerk leeft in een
  eigen tab (`design.networkDesigns` + `activeDesignId`; legacy `design.schematic` migreert naar
  één tab); imports/builds openen een nieuwe tab (nooit werk kwijt), dupliceren/hernoemen
  (dubbelklik)/sluiten; vergelijk-overlay = gestippelde grijze ghosts van de andere tabs in de
  SPL-chart ÉN de fase-chart (relatieve fase per tab; één solve per tab voedt beide via
  `tabGhosts`, zelfde dash-patronen). **Breakup-guard (toggle ⚙ Settings, default aan; in vfOptimizer én netOptimizer)**:
  stopband-lekkage naast de gemeten kruising (1,6×–4×, gespiegeld) moet ≥20 dB onder de som —
  resonantie-FASE is niet te filteren, alleen in niveau irrelevant te maken (penalty
  0,02×gem. kwadratisch tekort). **Werkflow-slotstuk**: na Optimize→Build draait de
  componenttuner AUTOMATISCH op de geassembleerde som (`pendingNetTune`-effect) — tak-syntheses
  worden per tak beoordeeld, alleen de tuner ziet het samenspel (gemeten: 31°→2,2° fase,
  score 16→91 in één klik).
  **Werkflow (één klik) = FULL-CHAIN CROSSOVER-SCAN (jul 2026, `designChain.ts`)**: met
  gemeten impedanties draait "Optimize — design for me" per overgangspunt-kandidaat de HELE
  keten — vf-rondes (re-seed van beste, <1% stop, max 12) → synthese → assembled netTune —
  en laat de EINDresultaten concurreren (`runDesignChain`+`crossoverVariants`+`rankChainResults`;
  ranking: targets-gehaald eerst, dan blended score op de priority — **de rimpelterm daarin is
  sinds jul 2026 de HELE-BEREIK avg |afwijking| (×π/2, zodat een gladde ±A-wiebel exact A
  scoort — zelfde rimpel↔fase-balans als de oude piekterm) i.p.v. de piek-±dB**: één smalle dip
  beslist de winnaar niet meer (Sanders doctrine, consistent met de Response-score;
  `avgDevDb` in netOptimizer-report, avg-kolom in de scan-tabel, piek = fallback voor legacy;
  targets blijven bewust PIEK — "rimpel ≤ X" is een nergens-slechter-dan-garantie; de
  zoek-objectives zelf waren al hele-bereik (std) en zijn per de anker-les onaangeroerd), en bij bijna-gelijke
  winnaars (≤5% score, zelfde targets-klasse) wint de GOEDKOOPSTE BOM — Sanders "caps zo
  klein mogelijk": bij gelijke kwaliteit heeft €600 niets te zoeken boven €300; alleen op de
  winnaar-slot gepromoot want paarsgewijze 5%-ties zijn niet transitief. Zelfde principe in
  de multi-start-tuner: bij ≤1% fx-gelijke bekkens wint de goedkopere realisatie (bomFor;
  zonder geprijsde catalogus verandert er niets). Kosten sturen ALLEEN op beslissingsniveau,
  nooit in de zoek-objective — de anker-les. Scan-tabel in de note toont €-totalen per xo). Kandidaten: INSTELBAAR aantal
  stappen (⚙ naast het crossover-punt, 3/5/7/9 — Sanders idee; oneven zodat de pin zelf
  altijd meedoet). **De gepinde range ÍS de zoekruimte, ONDERVERDEELD**: centres gelijkmatig
  van rand tot rand, elke kandidaat gekooid in zijn eigen ±halve-spacing-slice (geklemd op de
  range) — de slices betegelen de range exact, niets erbuiten, buren overlappen niet.
  HARD GELEERD (Sanders "het is geen venster in een venster toch?"): de eerste versie gaf
  elke kandidaat wéér het volle ±marge-venster — "2400" op een 2100±300-pin mocht dan tot
  2700 zoeken (buiten de pin) en buurvensters overlapten ~90%, waardoor de fijne
  onderverdeling niets betekende. `crossoverVariants(range, steps)`; UI toont "⏱ ~N×
  runtime" — compute groeit lineair, de pool vangt ~4 tegelijk op. Zonder pin één vrije
  keten. NB: een kandidaat-label is het slice-CENTRUM; de gemeten "overlap … Hz" in de
  strip is de échte akoestische kruising van het gebouwde netwerk bínnen die slice.
  **Adaptief xo-penalty-gewicht (vfOptimizer + netOptimizer, gespiegeld)**: het klassieke
  30·oct² bindt smalle slices niet (Sanders 2e screenshot: "2325" landde op 2152, één
  slice-breedte erbuiten, voor ~0,4 penalty) — gewicht schaalt met (0,15 oct/halve
  breedte)², cap ×100; brede pins (≥±0,15 oct) exact ongewijzigd, ontsnappen uit een
  smalle slice kost nu "geen-kruising"-geld. Geverifieerd: winnaar-slice [1800–2000]
  landde op 1831. **Scan-tabel = KEUZELIJST (Sanders wens)**: elke rij draagt zijn volle
  ChainResult; klik laadt dát kandidaat-ontwerp compleet in Working (specs+synth+getuned
  net, undo-baar), ◂ markeert de geladen rij, 🏆 blijft de ranking-winnaar. Kolomkoppen
  SORTEERBAAR (klik: oplopend → aflopend → terug naar ranking; BOM-loos zakt onderaan bij
  oplopend; nieuwe scan reset de sortering). Sessie-only.
  **Busy-overlay heeft een 250ms-LINGER** (`overlayVisible`): busy-flag-handoffs
  (vf → sync build → assembled tune) hadden één-frame-gaten die de popup milliseconden
  lieten knipperen (Sanders glitch-melding). HARD GELEERD (KOAN-
  meting, Sanders "we halen niet het maximale eruit"): de vf-ranking voorspelt de eindranking
  NIET — xo 1900±200 leek vf-slechtst (0,84 dB) en werd assembled-best (0,33 dB/3,5°), terwijl
  Sanders 2100-pin eindigde op 0,94 dB/12,5°; scannen op de eindmeting loont dus ~3×. Winnaar
  landt compleet (specs+synth+getunede parts) in Working; de scan-uitslag rendert als échte
  tabel (`chainScan`-state + `.scan-table`, winnaar 🏆, gerankte rijen met ripple/fase/BOM —
  de note houdt alleen winnaar + snap/safety-notes); teller toont "xo 1900 Hz (1/3)". ZONDER pin draait éérst één vrije keten; de twee gepinde
  vervolg-kandidaten rond de gevonden kruising (`followupVariantsFor`, ±12% centres) zijn
  RESCUE-ONLY: ze draaien alléén als de vrije keten de staged-targets MIST. Sanders: "xo free
  lijkt het goed te doen" — klopt, de vrije keten won beide metingen, dus targets gehaald =
  snel klaar met één keten. Maar één keten in een slecht bekken heeft geen concurrentie
  (de oude Positie-run: 9,1° avg bij target 10° — bijna-ramp), dáár is de redding voor.
  Geen targets gezet → ook één keten. Zonder impedanties: klassieke vf-rondes (geen build).
  **Positie-profiel = PREMIUM-FIT + POSITIE-SNAP (Sanders eigen recept, gemeten)**: budget-
  parasieten al tijdens het fitten meenemen sleepte de hele keten een slechter bekken in
  (Positie 9,1° avg vs Premium 3,4°, zelfde settings — een 0,7mm-trapspoeltje ≈ 0,7 Ω DCR
  seedt élke vervolgstap). designChain geeft de synthese daarom premium-prefs en alléén de
  eind-snap (die met echte DCR/ESR hercheckt) de positie-tiers. Gemeten op Sanders settings:
  0,37 dB/2,8° bij BOM €223 — kwaliteit van Premium (€573) én goedkoper dan de oude Positie
  (€233 bij 9,1°); wint ook van Sanders handwerk (2,9°/€437). NB: bindende serie-keuze
  begrenst GEEN waardes (waarde-bewuste terugval zakt door naar een dekkende pool) — een
  "Alumen → dus ≤10 µF"-semantiek zou een waardevenster-feature zijn, bewust nog niet gebouwd.
  Alles deterministisch (geen wall-clock; `vfRunStats` toont rondes+sims na afloop). Het beste
  resultaat wint, wordt passief gebouwd én gesimuleerd — alles landt in de vaste **Working-tab**
  (id 'working', wordt overschreven per run, met undo). Opslaan = klassiek Save/Save-as-paar
  (Sanders wens, twee rondes): "Save as new" vraagt een naam (inline input, Enter/Esc), bewaart
  het actieve ontwerp als tab en MAAKT DIE ACTIEF (opslaan = actief worden; herkomst-tab blijft
  als ghost achter); "💾 Save" OVERSCHRIJFT de laatst-opgeslagen filter-tab met het actieve
  ontwerp en springt ernaartoe (target = `lastSavedId`, gepersisteerd als `lastSavedDesignId`;
  disabled zonder target of wanneer de actieve tab zélf het target is — tabs bewerken live).
  Synthese-modus (acoustic/filter curve) = dropdown naast de Optimize-knop én in het Passive
  synthesis-paneel (zelfde state).
  Combined-curve heet "Combined — {tabnaam}" zodat tabs vs. ghosts optellen. "Build passive filter" bestaat nog
  voor handgemaakte virtuele filters en opent per klik een NIEUWE "Passive build N"-tab
  (accumuleert, springt naar de Network-tab; Sanders keuze — alleen de Optimize-flow
  overschrijft Working). Optimizer-instellingen
  ingeklapt achter ⚙ Settings. **vfBypass**: virtuele filters uit de sim (instellingen blijven) — auto-aan bij
  passive build (anders dubbel gefilterd), auto-uit na optimizer-run (resultaat moet zichtbaar)
- `components/Chart.tsx` — eigen SVG-chart: log/lineair, kleur-langs-lijn (pointColors), zones
  (bands), hover-tooltip, legend-toggles. Kleuren gevalideerd via dataviz-skill.
  **Gestreepte series tonen hun dash-patroon in de legend-chip** (svg-lijntje i.p.v. blokje;
  let op `.chart svg { width:100% }` — de dash-chip heeft een specifiekere regel nodig).
  Ghost-curves krijgen elk een eigen gedempte tint (`--viz-ghost1..4`, licht+donker) — met
  identiek grijs waren de legend-chips van meerdere tabs niet uit elkaar te houden.
  Topbar-chips Integration/Fase P95 kleuren mee met de tier (ok ≥90/≤45°, warn ≥75/≤90°,
  anders bad). Schematic-editor heeft undo én REDO (`schFuture`, Cmd/Ctrl+Z en
  Cmd/Ctrl+Shift+Z of Ctrl+Y; verse edit wist de redo-tak).
  **Interactie (UI-fase A)**: wheel = X-zoom om cursor (Shift = Y), drag = pan, dubbelklik/reset-
  knop = terug; puur view-transform (sim onaangeroerd), "use as view range" commit de zoom naar
  fMin/fMax (en een commit reset de zoom). Gekoppelde crosshair over alle log-x-charts
  (module-level store + useSyncExternalStore); lineaire (tijd-)charts doen niet mee. Verticale
  `xBands`/`xMarkers` (o.a. integration bandwidth + overlap-centre in de fase-chart).
  **Fase-kleurladder (display-only, App.tsx `phaseTier`)**: 15/45/90/120° — groen alléén ≤15°;
  de fysische 45/90/120°-ankers in integration.ts blijven de score bepalen.
  Fase-chart toont ook filter-fase per tak (arg van totale transfer) + ruwe driver-Δφ (dashed).
  **Per-driver-totaalfase (jul 2026, Stefans "horen de stippellijnen niet op elkaar te
  liggen?")**: "Woofer/Tweeter phase (total)" staan standaard AAN (Sanders eindkeuze) en de
  filter-fase-per-tak-stippellijnen standaard UIT via `defaultOff` op Series (géén aparte
  checkbox, de legend ís de toggle; Chart seedt defaultOff-ids één keer in de hidden-set,
  een user-klik wint daarna altijd). De totals tekenen de TOTALE fase per
  driver — RECHTSTREEKS result.woofer/.tweeter.phaseDeg (de arrays waarvan de relatieve
  curve het verschil is, dus ze tekenen overal waar die tekent), beide minus een GEDEELDE
  ~1-octaaf-trend van de combined-systeemfase — verschil onaangetast, samenvallen-bij-0°
  exact; tak >60 dB onder de som wordt gemaskeerd (draagt niets bij, fase betekenisloos).
  HARD GELEERD (2× Sanders "geen lijnen"): totalen zelf reconstrueren uit base + opnieuw
  ge-unwrapte filter-arg wordt ruis waar |H| van een tak numeriek doodloopt (unwrap
  random-walkt op numeriek stof) en breakPhaseWraps knipt dan de hele lijn weg; ook een
  globale bulk-delay-fit als referentie liet op echte metingen een steile rest-helling
  achter (zelfde symptoom) — demo-data verhulde beide.
  De filter-fase-stippellijnen
  zijn alleen wat het netwerk toevoegt; de verwarring daarover was de aanleiding

## De ontwerpers-sequence, geport naar 2-weg en solo (aug 2026)

Sanders vraag "welke leermomenten kunnen we van de 3-weg gebruiken voor de 2-weg en de single
driver" — de drie omkeringen bleken alle drie óók in de 2-weg-keten te zitten; hij was er alleen
nooit naar gevraagd. Wat gedeeld was (staged-snoeidiepte, catalogus-realisme, spoel-tier-
vrijstelling, DCR-plafond, snap-Z-bewaking) liftte al gratis mee.
- **Z-vloer als ranking-klasse in `rankChainResults`** + `zFloorStrict` in de 2-weg-keten én in
  `runSoloChain` (buildSoloNetwork schrijft die seed zelf — dezelfde redenering).
- **`physWin2`** (App-memo): hetzelfde gemeten venster voor het 2-weg-paar — vloer =
  max(2×Fs, reach, excursie), plafond = min(gemeten bundeling, lobing tegen de tweeter met
  auto-k, eigen array-afstand, breakup/N). Dit is het openstaande roadmap-punt "Fs-vloer voor de
  HP-knie in de vfOptimizer-bounds", gegeneraliseerd: het begrenst de vrije scan (vervangt de
  tweeter-geankerde schatting) én oordeelt via `judgeWindow` over de GELEVERDE kruising. Niets
  gemeten = oude schatting; een degeneratief venster oordeelt niet.
- **Leiband op de 2-weg assembled tune** (`branchTargets`). GEMETEN A/B op de KOAN-keten
  (doel 1 dB/10°, verder identiek): zónder piek 1,064 · avg 0,592 · fase 9,71° · kruising
  **4230 Hz** · 19 parts; **mét** piek 0,883 · avg 0,312 · fase 3,58° · kruising **2965 Hz** ·
  16 parts. Beter op élke as, en zonder leiband liep de kruising ruim een halve octaaf boven het
  ontwerp — hetzelfde tak-herbouw-gedrag als bij 3-weg, nu ook in 2-weg aangetoond.
- **BEWUST NIET geport**: de piek-bewuste amplitudeterm in de 2-weg-objective (destijds gemeten:
  de EQ-trede + breakup-guard dekken dat geval al — "niet aanraken wat niet stuk is"), en
  niveau-eerst (de 2-weg-EQ-trede wast niveauverschillen al weg en zijn kandidaten leunen niet
  op rauwe ankers).
- **`lobingKFor` (driverLimits)**: strengheid uit de PAAR-AS i.p.v. één globale knop — horizontaal
  gescheiden drivers (een center) loberen ÓVER de bank (streng, k 0,5), verticaal gestapelde naar
  vloer/plafond (Dickason k 1,0), gemengd interpoleert. UI-stand `auto` (default voor nieuwe
  sessies; opgeslagen keuzes blijven). Op Sanders center: wooferpaar 350 mm horizontaal houdt
  zijn 490 Hz-plafond, M-T 70 mm verticaal gaat 2450 → ~4900 Hz.
- **Spoel-tier-vrijstelling (`preferredPools`)**: tier-voorkeur geldt NIET voor spoelen — DCR is
  een positie-eigenschap, geen tier (de al opgeschreven doctrine). Gemeten op Sanders center:
  het Positie-profiel zette twee Mundorf Zero-Ohm (€319 + €228) in het woofer-seriepad terwijl
  een P-core van €11 met 0,2 Ω meer DCR in dezelfde catalogus stond. Het DCR-plafond blijft de
  eerlijke spoelbeperking; daarbinnen beslist de kostenterm. Expliciete serie-binding wint nog.

## Gedeelde kern voor drie engines (jul 2026, Sanders "misschien kunnen ze wat delen")

- **`bandMetrics.ts` — één implementatie van "hoe vlak is deze respons over deze band"**
  (mediaan, mean, std, gemiddelde afwijking, piek ±, en apart `peakExcess`/`peakDeficit`),
  plus `reachableBand` (de band die een cut-only correctie kan halen) en `flatnessObjective`
  (std, optioneel gemengd met de grootste positieve uitschieter). Bestaansreden: dit stond
  VIER keer los geïmplementeerd — tuner, solo-engine, scan-ranking, paneel — en dat is exact
  de bug-familie die het meest heeft gekost: elke bewaker oordeelde op zijn eigen privé-
  definitie van vlakheid, waardoor een correctie zijn eigen getal kon verbeteren terwijl het
  getal dat de ONTWERPER leest slechter werd. Met drie engines is dat geen risico om te lopen.
  Solo-engine en `medianOf` in de tuner draaien erop; `responseStats.ts` blijft de
  gekalibreerde DISPLAY-score op dezelfde definities.
  **BEWUSTE UITZONDERING**: `bandStd` ín `netOptimizer` blijft zijn eigen (one-pass) rekenwijze
  houden. Die functie ÍS de 2-weg-zoek-objective; de vormen zijn wiskundig gelijk maar niet
  bit-identiek, en de anker-les (zie `Z_FLOOR_OHM`) is dat élke verstoring de deterministische
  simplex een ander bekken in stuurt. Cosmetische netheid is dat risico niet waard.
- **Kruising-termen zijn PAAR-eigenschappen** (`pairMetrics` in netOptimizer): akoestisch
  kruispunt, vallei-check, akoestische hellingen, breakup-guard en bescherming van de bovenste
  driver horen bij één AANGRENZEND DRIVERPAAR, niet bij het ontwerp als geheel. Solo = 0 paren
  (alles vervalt), 2-weg = 1, 3-weg = 2 en itereert simpelweg. Met precies één paar is de
  rekenkunde onveranderd — de determinisme-tests pinnen dat vast. Dit vervangt de verspreide
  `if (solo)`-takken door "geen paren", en maakt 3-weg een kwestie van de lijst vullen.
- **GEMETEN, niet aangenomen: de 2-weg-engine heeft de peak-blindheid NIET nodig.** Een
  geïnjecteerde smalle +10 dB-resonantie op 12 kHz (5,5× de kruising, dus buiten het venster
  van de breakup-guard): de ontwerpstap zet er twee banden op, en na bouwen + tunen + snap is
  de uitschieter −0,4 dB — de notch overleeft de hele keten. Bij solo verdween hij juist
  (136 → 108 → 116 → 125) omdat die realisatie een 269 Ω-dempingsweerstand nodig had die de
  catalogus niet voert. Zelfde blindheid in de metriek, andere fysica in de realisatie. Dus
  GEEN peak-term in de 2-weg-objective: niet aanraken wat niet stuk is.

## Single-driver mode (jul 2026, Sanders FRS8-validatie)

Eén geladen meting is genoeg: het lege slot krijgt in de sim een **stille ghost-tak**
(`SILENT_GHOST_DB = −400`, App.tsx) zodat `combine()` en elke downstream-consument hun
twee-tak-vorm houden — de combined ÍS de solo-tak (1e-20 in amplitude; ver onder het
−60 dB-fasemasker én het 20 dB-overlapvenster, dus phaseStats/integration degraderen vanzelf
naar null/geen-overlap). `soloDriver` ('woofer'|'tweeter') stuurt de UI: ghost-curves,
null-check, relatieve fase, tier-zones/align-legends, integration-strip, tweeter-adjustment
en het ghost-filterblok verbergen; het fase-paneel kopt "{driver} phase (total)".
"New from template" scaffoldt alleen het geladen slot; de orde-templates (2-weg LP+HP) zijn
disabled. Bestaansreden: VALIDATIE.md — netwerk op een echte solo-driver (FRS8) meten en de
sim 1-op-1 tegen de meting leggen. Bewust de eerste trede van de N-weg-generalisatie (fase 4).

**Solo-optimizers (jul 2026, Sanders "juist wél optimizen, solo-georiënteerd")** — de
architectuurkeuze na zijn "3-weg optimaliseert straks ook anders": gedeelde kern +
**eigen structuur-zoeker per topologie**. (a) `netOptimizer` kreeg `opts.solo` ("0
driver-paren"): álle kruising-verankerde termen (xo-penalty incl. de altijd-120, vallei,
breakup, tweeter-protectie, acoustic slopes) zijn paar-eigenschappen en vervallen; fase
rapporteert 0 (een constante 180°-term zou de %-beslispoorten — challenge 1%, prune 10%,
ladder 1% — vergiftigen); objective = puur tak-vlakheid; Z-vloer/serie-plafond/krimpladder/
drift-catch/snap/staged blijven; directivity uit (paart hoeksets over beide drivers); duo-pad
bit-identiek (volle suite = regressie). (b) `soloOptimizer.ts` = de eigen solo-engine:
`optimizeSoloFilter` (greedy cut-only EQ/shelf-kandidaten tegen mediaan-vlak, joint-NM-refine,
full-grid-audit ≥0,5%, trapmethode-stop op ripple-target, deterministisch; KOAN-mid:
6,8→1,1 dB piek, notch op de 5,6 kHz-breakup gevonden) + `buildSoloNetwork` + `runSoloChain`
(design → topologie → solo-netTune, worker-request 'soloChain'). **HARD GELEERD (eerste
chain-poging hergebruikte de 2-weg-synthese)**: een shunt-trap naar ground doet NIETS aan een
ideale spanningsbron — in een crossover levert de ladder de bronimpedantie, solo niet. De
solo-topologie is de klassieke breedbander-correctie: **parallelle LCR-trap ín het seriepad**
(R = Zd·(10^(d/20)−1) op |Z|(f0)), serie-L∥R (highShelf-cut/baffle-step), serie-C∥R
(lowShelf-cut), plus **gated Zobel** over de driver (|Z|-stijging ≥1,3×, textbook-seed) —
structuur van de engine, waardes van de tuner ("Add notch + Optimize components",
geautomatiseerd). Gemeten op de synthetische FRS8 (bult 8 kHz): Response 58→94, peak
4,78→0,64 dB, BOM €5.
**GEVOELIGHEIDSBUDGET (`sensitivityBudgetDb`, default 6 — Sanders eerste echte solo-run,
jul 2026)**: std-vlakheid is NIVEAU-BLIND, dus "alles onder 10 kHz weggooien" vlakt net zo
goed als "de 5,6 kHz-breakup temmen" — en met cut-only is de shelf de goedkoopste weg. Zijn
uitkomst: twee low-shelf-cuts (33 Ω/2,2 Ω serieweerstanden, geen énkele spoel in het schema),
−15 dB onder 10 kHz, Response 0, peak ±19,9 dB — de engine meldde succes omdat het puin glad
was. Dit is de solo-tegenhanger van de dode-tak-degeneratie: een toestand die geen
responsmetriek ziet. Handhaving als FEASIBILITY (kandidaat-poort + push-back in de refine,
zoals de waardevensters), nooit als kwaliteitsterm in de objective — de anker-les. Meet op de
MEDIAAN (een diepe smalle notch — het hele punt — mag niet als "verloren gevoeligheid" lezen,
een brede shelf wel). Plus: **Q-vloer 0,7 op peak-banden** (bij Q 0,3 is een "piek-cut"
gewoon breedband-verzwakking in vermomming) en shelf-seeds geklemd op het RESTERENDE budget.
**`dipLimit` in het resultaat**: cut-only kan een dip niet optillen, dus een dip is de eerlijke
bodem onder de vlakheid — de note meldt hem ("limited by a 4,7 dB dip at 17150 Hz") zodat een
matige score als fysica leest i.p.v. een mislukte run. **Dezelfde blindheid zat in de TUNER**
(zijn solo-objective is óók std-vlakheid, dus hij had geen enkele reden Sanders 33 Ω terug te
draaien): `netOptimizer` solo kreeg daarom `medianDb` in de metrics, een `soloSensOk`-gate in
de staged safe-checks en een EINDPOORT die een resultaat weigert dat >6 dB onder het kale
driverniveau landt (seed blijft staan + uitleg-note). Referentie = de RAUWE driver
(ghost = −400, dus per punt max(w,t) ÍS de driver); een al gepadde seed houdt zijn eigen
niveau als referentie (gate vuurt alleen als het resultaat het seed-verlies vergroot).
Beslisniveau, nooit in de objective — de anker-les. **Cap is SEED-RELATIEF**
(`soloLossCap = max(6, verlies van de seed)`): baffle-step-compensatie kost legitiem 6–10 dB
en Sanders eigen 12W8524-filter geeft ~10 dB uit — de muur belet de tuner om er MEER bij te
doen, hij bevraagt nooit het startpunt van de ontwerper. Naast de eindpoort staat de cap ook
als BARRIÈRE in de solo-tune zelf (exact 0 binnen de cap, dus het zoekpad in gezond gebied
blijft ongemoeid — zelfde argument als de bouwbaarheidsvensters); zonder die muur liep de
tuner er telkens ín en gooide de eindpoort de hele tune weg (gemeten op Robberts 12W8524:
afgewezen bij 12,6 en 20 dB verlies; mét muur wordt hij geaccepteerd en verbetert 1,39 → 0,97 dB).
**BREEDBANDER OVER HET HELE BEREIK (jul 2026, Sanders "hij neemt de gehele range op zich")**:
"zet je view range smaller" is géén antwoord als de driver het hele bereik moet dragen. Maar
een 30 dB-klif boven 10 kHz is met cut-only niet vlak te maken — alleen te BENADEREN door
overal 30 dB weg te gooien. Daarom `designBandFor`: de aangevraagde band minus DODE RANDEN
(buitenste punten die verder dan het gevoeligheidsbudget onder de mediaan liggen; drempel ÍS
het budget, dus zelf-consistent: wat je niet kunt betalen is per definitie onbereikbaar).
Alleen de buitenste bereikbare punten begrenzen — een mid-band dip wordt nooit uitgesneden,
die zie je in de score. De ZOEKTOCHT (kandidaten, escalatie, targets, audit, én de band die
de solo-tuner meekrijgt) loopt op die ontwerpband; élk gerapporteerd cijfer blijft op de
AANGEVRAAGDE band, zodat de klif zichtbaar blijft. Gemeten op Robberts 12W8524 (110 Hz–20 kHz
gevraagd, budget 6): ontwerpband 111–9342 Hz, hele-bereik-piek 22,9 → 1,7 dB in-band. Note
meldt beide banden + wat erbuiten onbereikbaar is; `inBandBefore`/`inBandAfter` bestaan zodat
een in-band "na" nooit tegen een hele-bereik "voor" wordt gezet (dat vleit met exact de
grootte van de klif). **Budget is een INSTELLING** (⚙ Settings in solo, `soloSensDb`,
default 6 dB, gepersisteerd): 6 ≈ een baffle-step, goed voor een driver die nog een kruising
krijgt; een breedbander is 10–15 dB waard. Gemeten sweep op de rauwe 12W8524 (hele-bereik
avg): 6 dB → 2,86 · 10 dB → 2,26 · 12 dB → 2,22 · 15 dB → 2,69 (voorbij ~12 loopt de
ontwerpband de klif in en verdunnen de traps). Efficiëntie vs. hele-bereik-vlakheid is een
ontwerperskeuze, geen constante van mij.
**BODEM-MODUS / absoluut niveau-doel (`targetLevelDb`, Sanders idee jul 2026 — "een bodem op
SPL-niveau tot waar de engine mag werken")**: DE betere formulering, en hij lost het
kernprobleem bij de wortel op. Het relatieve budget meet spreiding rond een ZWEVEND gemiddelde,
dus "vlakker" kan ook door het gemiddelde te verplaatsen — vandaar al het vangnet-werk. Een
VASTE bodem is niet te gamen (cut-only kan altijd omlaag, nooit omhoog: "vlak op 95 dB" is
precies de vorm die passief kán) en één getal doet wat eerst twee gekoppelde parameters deden:
hoeveel niveau je inlevert ÉN hoe ver de band reikt (`reachableBandFor` = waar de driver ≥ de
bodem zit). Gemeten op Robberts 12W8524 (110 Hz–20 kHz): bodem 122 → reikt 9,6 kHz · 118 →
11 kHz · 114 → 13 kHz · 106 → 14,9 kHz, en hele-bereik avg 2,12 bij bodem 114 tegen 2,22 voor
het beste relatieve budget. Twee dingen die erbij hoorden: (1) de engine kreeg een
NIVEAU-ELEMENT — een negatieve `spec.gainDb` landt als serie-pad-weerstand in
`buildSoloNetwork` (dat veld werd daarvóór stil genegeerd); met alleen EQ-banden kun je een
passband van 130 dB nooit naar een doelniveau brengen. (2) **HARD GELEERD (in de app
geverifieerd): niveau en VORM moeten gescheiden blijven** — kandidaten meten prominentie tegen
het EIGEN gemiddelde van de respons, ook in bodem-modus. Tegen de vaste bodem leest de hele
band als "15 dB te hard", wint de tilt/shelf-kandidaat élke ronde en stapelen breedband-cuts
zich op: drie low-shelf-cuts, géén notch op de 7 kHz-breakup, en 4 banden SLECHTER dan 2
(peak 8,62 vs 3,41). Na de scheiding: 4 banden → peak 3,23 / avg 1,59 mét pad 12,4 Ω.
UI (herbenoemd na Sanders "misschien een invoerveld voor hoe laag hij mag zakken?" — hij las
een paneel dat het antwoord TWEE keer bevatte en zag het niet: "Sensitivity budget" is jargon
en de bodem-checkbox stond uit, waardoor dat veld verborgen was): het relatieve veld heet nu
**"May drop by … dB"** met een absolute uitlezing ernaast ("→ down to 114 dB (driver sits at
129)"), en de bodem-schakelaar heet **"or flatten to a fixed level"**. Max verhoogd 20 → 40 dB.
Gemeten met "may drop by 15" + 4 banden op Robberts 12W8524: Response 0 → 22, hele-bereik avg
2,07 dB, in-band (113 Hz–13 kHz) peak 11,16 → 2,29 dB / avg 0,96 — beter dan élk relatief
budget hiervoor en dicht bij Sanders handwerk (1,93). Verder de ⚙ Settings-keuze met live "driver sits at X dB · reaches A–B",
default-voorstel mediaan−10; de bodem staat in de dB-schaal van de geladen FRD. Ook gefixt:
de solo-band werd op 300 Hz geklemd (2-weg-aanname) — een breedbander vanaf 110 Hz moet
vanaf 110 Hz ontworpen worden.
**HELE-BEREIK nooit-slechter-poort (jul 2026, Sanders avg ±5,66-run)**: élke nooit-slechter-
garantie beoordeelde tot dan de band die hij zélf optimaliseerde (ontwerpstap op de
ontwerpband, tuner op zijn eigen band). Geen daarvan belooft het getal dat de ONTWERPER leest —
gemiddelde afwijking over het gevraagde bereik. Een correctie kan zijn eigen band verbeteren en
het hele bereik tóch slechter maken (passband 10 dB omlaag terwijl de onbereikbare top blijft
staan); dat leveren is onverdedigbaar, want géén filter was dan beter. `runSoloChain` meet het
geleverde netwerk daarom na op de GEVRAAGDE band tegen de kale driver en levert bij verlies de
kale driver + de reden ("try a lower target level, or a narrower view range"). **HARD GELEERD
in dezelfde poort (Sanders "Response 100 met een rechte lijn")**: die kale terugval mag NIET
door de R/L/C's uit het gebouwde netwerk te FILTEREN — die componenten ZIJN de schakels tussen
de bus-punten, dus wat overblijft is een generator, een wees-draad en een LOSGEKOPPELDE driver.
Die simuleert als een kaarsrechte lijn en scoort vervolgens een perfecte 100 (een constante
heeft geen afwijking) — de degeneratie die geen responsmetriek ziet, nu in het vangnet zelf.
Terugval wordt daarom VERS gebouwd via `buildSoloNetwork` met een lege spec; regressietest eist
|H| = 0 dB (±0,5) over de hele band.
NB nog open: `buildSoloNetwork` realiseert HP/LP NIET (alleen EQ-banden + pad + Zobel) — een
virtuele high-pass staat dus niet in het gebouwde netwerk.
**BODEM-MODUS AFGEMAAKT (jul 2026, Sanders "flatten to a fixed level lijkt niet te gebeuren
+ de 7 kHz-piek wordt niet aangepakt")** — drie gaten in één screenshot: (1) een diepe pad was
één serieweerstand, maar tegen een Z die 7 → 35 Ω stijgt volgt de verzwakking de Z-curve
(+14 dB tilt i.p.v. een niveau) → `buildSoloNetwork` bouwt bij ≤ −6 dB nu een echte
**constant-impedantie L-PAD** (Rs = Z0(1−a), Rp = Z0·a/(1−a), Z0 = mediaan |Z|; Rp ≪ |Z|
overal, dus de deling Rp/(Rs+Rp) is frequentie-vlak en de versterker ziet ≈ Z0); (2) de
componenttuner was bodem-blind (std is niveau-invariant) en wiste het niveau-doel — 
`netOptimizer` kreeg `soloTargetLevelDb`: de solo-amplitudeterm wordt dan RMS-afwijking van
het VASTE niveau (geen extra term — het ÍS de objective in die modus); (3) de refine tunede
gain mét de banden, en gain −25 ≡ shelves-overal-−25: het niveauwerk droop naar twee gestapelde
low-shelfs, verbrandde het bandenbudget en de breakup hield géén band over → **gain staat VAST
op (bodem − mediaan)**, pad doet niveau, banden doen vorm (zelfde scheiding als de kandidaten).
Gemeten (12W8524, "Flat at 104" op een 129 dB-driver): mediaan landt op 103,6 · L-pad
9,8 Ω + 0,60 Ω · trap @ 6805 Hz · 7 kHz van 111,9 → 103,4. NB: bodem-modus optimaliseert
vs-bodem; de Response-score blijft mediaan-relatief en kan iets lager lezen dan de
"May drop"-modus met ladder — dat is de betekenis van de modus, geen bug.
**PEAK-BEWUSTE solo-objective + catalogus-bereikmelding (jul 2026, Sanders 2× "de piek bij
7 kHz wordt niet aangepakt")**: de ONTWERPSTAP deed het goed (notch @6919 Hz −18 dB, 7 kHz van
136,3 → 108,4 dB) — de stappen erná braken het af: componenttuner 108 → 116, catalog-snap
116 → 125, allebei terwijl hun eigen metriek "verbeterde". Oorzaak: RMS-vlakheid merkt een
smalle resonantie nauwelijks (een 20 dB-piek beslaat een paar procent van de band), terwijl het
juist het eerste is wat je ziet én hoort. De solo-amplitudeterm is nu peak-bewust:
`targetStd = √(std² + 0,35·maxPositieveExcursie²)` t.o.v. de mediaan (of de bodem in
bodem-modus), zodat tune/prune/krimpladder/snap verdedigen wat de ontwerpstap won. ALLEEN solo
— het 2-weg-pad heeft daar zijn breakup-guard voor en blijft onaangeroerd.
**Catalogus-bereikmelding**: de tuner wilde 269 Ω en 118 Ω dempingsweerstanden voor zijn traps,
de geïmporteerde catalogus stopt bij 33 Ω → de snap leverde stil traps met een derde van de
diepte. Een dekkingsgat is onzichtbaar in de waardes en leest als mysterieus fit-verlies, dus
de snap meldt nu welke slots tegen de rand van het assortiment aanlopen ("R3 wants 46,1 Ω,
catalog offers 33,0 Ω — add those values (🗂 Manage…) or switch Snap to catalog off").
**"MAY drop" is een PLAFOND, geen opdracht (jul 2026, Sanders "20 dB geeft een slechter
resultaat dan 15")**: het veld zegt MAY, maar de engine besteedde altijd alles. Het bedrag
voedt de bereikbare band (`designBandFor`), dus méér toestemming verbreedde de band, spreidde
dezelfde handvol correctiebanden dunner en de 7 kHz-breakup verloor van de klif. Gemeten
(hele-bereik avg): 6 → 2,35 · 10 → 2,17 · 15 → 2,76 · 20 → 2,54 · 25 → 3,65, met de trap die
kwam en ging — erratisch in precies de richting waarvan een ontwerper veiligheid verwacht.
`runSoloChain` is nu een wrapper die de keten draait op een ABSOLUTE ladder van bestedingen
([6,10,15,20,25,30,40] ∩ ≤plafond) en de beste HELE-BEREIK-uitkomst houdt; een hoger plafond
voegt alleen kandidaten TOE, dus het resultaat kan nooit slechter worden (gemeten na de fix:
2,35 · 2,17 · 2,17 · 2,17 · 2,17, trap overal aanwezig). Ties gaan naar de KLEINSTE besteding
(gelijke vlakheid voor minder rendementsverlies) en de note meldt "spent 10.0 of 25.0 dB
allowed — more attenuation measured worse over the whole range". Kosten: plafond 6 = één run
(zoals voorheen), hoger plafond = meer runs — de gebruiker vraagt zelf om die bredere zoektocht.
Bewust NIET in bodem-modus: daar heeft de ontwerper het niveau zelf benoemd.
**Bypass-C-escalatie alleen op ECHTE pad-weerstanden (jul 2026, Sanders "Tidy layout doet
niets")**: de kandidaat-filter keek naar COÖRDINATEN ("zit er al een C op deze twee punten")
en "niet geaard". Beide te zwak — de damping-R ín een parallelle LCR-trap deelt de knopen maar
niet de rijen (→ 4 leden in één parallelgroep, die de auto-placer terecht weigert), en een
Zobel-R is ongeaard maar hangt in een keten naar ground (een parallel lid dáárin kan tidy per
definitie niet tekenen). Nu: netlijst-gebaseerde parallel-companion-check + `busPositions`
serie-pad-eis, precies de gedocumenteerde bedoeling ("bypass-C over serie-weerstanden"). Gemeten na de fix (KOAN-mid, volle
200–20k): notch @5641 Hz + shelf, peak 10,10→4,56 dB, kosten 2,6 dB gevoeligheid; op de
verstandige band 300–8000 Hz: Response 63→89. UI: "Optimize — flatten driver", solo-"Build passive filter" bouwt
de topologie uit de huidige spec (nieuwe "Solo build"-tab, waardes = textbook-seeds),
⚙ Optimize components solo-tuned (note zonder fase), wizard slaat de Crossover-stap over,
kruising-settings disabled met uitleg. 3-weg wordt dezelfde gelaagdheid met TWEE paren.
**Wizard-stappen komen uit een LIJST (`wizardSteps`, jul 2026)**, niet uit een vast aantal met
index-rekenwerk: solo laat de Crossover-stap weg, en de oude `st + (solo ? 2 : 1)`-sprongen
lieten de kop "Step 3 of 4" zeggen terwijl de gebruiker er drie liep — mét het overgeslagen
bolletje gevuld. Bolletjes, "Step x of y" en beide navigatieknoppen lezen nu uit dezelfde lijst,
dus een stap toevoegen (3-weg heeft een tweede kruising nodig) is één regel i.p.v. weer een
off-by-one. `id` blijft het nummer waar de inhoudsblokken op schakelen; een effect verplaatst de
wizard naar een geldige stap als de lijst onder hem verandert (driver erbij/eraf tijdens gebruik).

## 3-weg-modus in de App (aug 2026, fase-4 trede 2b)

`midDrv` = de MIDDENtak (state `woofer`/`tweeter` zijn de low/high ROLLEN, naam-agnostisch);
`threeWay` = alle drie RESPONSIES geladen; sim somt dan via `combineN` (per-tak adjust:
`midOffsetMm`/`midTrimDb`/`midInverted` naast de tweeter-velden) en het result houdt de
2-weg-VORM (woofer=low, tweeter=adjusted high, combined* = drie-tak-som) zodat élke
combined-consument blijft werken; `sim.mid` rijdt mee voor de charts. Netwerk-transfers in
3-weg via `slotTransfersN` (ambigu ⇒ xoError, geen raden). **`midIgnored`** (mid-data zonder
volledige 3-weg): luide banner én de mid-Z blijft uit de solver-map — anders verschuiven de
canonieke sleutels stil onder een lopend 2-weg-ontwerp (precies de stille fout).
UI: derde import-slot + ✕, amber `--viz-mid`, mid-filterkaart (hp+lp = bandpass, gratis in
het spec-model), fase-chart toont de twee AANGRENZENDE paren (w-t-verschil betekent daar
niets), SPL-handles ook op de mid. GEGATE met uitleg-titles (paar-eigenschappen, trede 4):
optimizers, synthese, netOptimize, vxp-export, integratie/phaseStats, directivity/sonogram,
tolerantie-band, tab-ghosts, target-curves, templates (alleen Blank-scaffold, mét alle drie
drivers). [Stand aug 2026: optimizers/synthese/netOptimize (trede 3–4c) én
directivity/sonogram (zie onder) zijn inmiddels ONT-gate; vxp-export, tolerantie-band,
tab-ghosts en target-curves zijn nog 2-weg.]
**Fase-chart in 3-weg = ÉÉN genaaide lijn (aug 2026, Sanders "een berg lijnen over
elkaar")**: default toont het paneel alleen "Relative phase — active pair" — per frequentie
de relatieve fase van het ACTIEVE paar (mid-vs-woofer bínnen het W-M-overlapvenster,
tweeter-vs-mid bínnen het M-T-venster, NaN-gat ertussen: daar draagt geen paar over), per
punt tier-gekleurd zoals de 2-weg-hoofdlijn. Fysisch verdedigbaar omdat een paar-curve
buiten zijn eigen overlapvenster toch niets betekent. Elk paar-venster is ÉÉN AANEENGESLOTEN
span (eerste t/m laatste overlap-punt, Sanders "happen in de lijn"): de rauwe
per-punt-|ΔdB|≤20-test flikkert aan de randen en tekende beten en losse eilandjes;
binnenpunten die de test even missen dragen gewoon een betekenisvolle relatieve fase
(phaseErrorDeg bestaat op élk integratiepunt). De twee volledige paar-curves én de
drie totaal-lijnen zijn in 3-weg `defaultOff` (de legend ís de toggle — 2-weg houdt de
totals default AAN, Stefans check / Sanders eindkeuze). Paar-keuze bij dubbele dekking:
onder het meetkundig gemiddelde van de twee overlap-centra wint het lage paar.
**Directivity + sonogram in 3-weg (aug 2026, Sanders "werken niet")**:
`computeDirectivityN` in directivity.ts — N takken via combineN, elk met eigen transfer +
BranchAdjust; het oude `computeDirectivity` is er een dunne wrapper over (combine ≡ combineN
voor K=2, dus de bestaande tests dekken de kern). App-memo: 3-weg = drie lagen (woofer/mid/
tweeter-transfers + mid-adjust), mid-hoekset VERPLICHT (mid-loze som zou stil fout zijn ⇒
null). HARD GELEERD: `angleResponsesOn` moet in 3-weg dezelfde banded-behandeling krijgen als
de 0°-takken (clampEdges + stille ghost buiten het eigen meetbereik) — het union-grid begint
onder het bereik van de tweeter-hoekbestanden (~640 Hz) en een kale resample GOOIT dan, de
catch maakte er stil null van en het paneel bleef gewoon leeg. Sonogram lift gratis mee (leest
het directivity-resultaat). Browser-geverifieerd op Robberts volle hoekset (0/10/20/30° × 3).
**W-M-fysica-venster (aug 2026, Sanders "moet W-M altijd handmatig?")**: nee — het
2-weg-saneFree-recept gegeneraliseerd. Vloer = 2×Fs uit de GEMETEN mid-impedantie
(`midHpFloor`, zelfde piek-detectie als de tweeter-vloer via `fsFloorFrom`, zoekvenster
60–1500 Hz; Robberts mid: Fs 176 ⇒ vloer 353 Hz — precies de regio die de tuner al verkoos
boven het niveau-anker); plafond = woofer-conus-beaming (`wooferSizeInch`-veld, zelfde formule
als midSizeInch; 8" ⇒ 1966, geklemd op 1500). `crossover3Variants` kreeg `lowWindow`
{floorHz, ceilHz}: de vrije W-M-as doorzoekt dát venster, overlap-anker alleen nog als
fallback; ⚙ toont "W-M window 353–1500 Hz (2×Fs mid / woofer beaming)" live. HARD GELEERD in
de test: één bekend fysica-anker moet van een tegensprekend niveau-anker WINNEN — bij het
w≡m-fixture viel het overlap-centrum op de eerste grid-frequentie en de degeneratie-terugval
gooide de vloer weg; nu krijgt de ontbrekende kant een octaaf ruimte vanaf het bekende anker,
en alleen twéé strijdige fysica-ankers (grote mid + kleine woofer) vallen terug. Low-as-clamp
1200 → 1500 (een klein-woofer-venster zit daar legitiem boven; de UI-pin tot 2000 werd er ook
door geplet). Persistent: wooferSizeInch in project/snapshot/restore/autosave-deps. Autosave-deps uitgebreid (midDrv + mid-adjust — de harde les). Demo-load reset
midDrv (anders wordt KOAN stil een 3-weg). 2-weg/solo bit-onaangeroerd: volle suite (394)
groen + browser-check op Sanders v1-autosave (restored identiek door het nieuwe leespad).
**Per-tak-banden (trede 4b)**: in 3-weg spant het sim-grid de UNIE van de meetbereiken
(2-weg houdt de doorsnede — bit-compat); `banded()` zet een tak buiten zijn eigen
meetbereik op de stille ghost — eerlijke vloer: de som draagt alleen echte bijdragen en
de tuner-drive-bescherming bewaakt de tweeter daar elektrisch (Robberts tweeter-FRD
begint op 640 Hz; de 400 Hz-overname is nu ontwerpbaar). `maskSilent` maakt gaps in de
SPL/fase-charts (geen −400-klif); tak-syntheses fitten op hun eigen sub-grid
(`synthBanded`, arrays NaN-gepad voor de SynthChart; `rawSpl` clampt in 3-weg — de
slicing snijdt de geclampte punten weg, zelfde patroon als verification).
**Per-paar-scores (trede 4b)**: `pairScores`-memo = per aangrenzend paar
combine+computeIntegration+computePhaseStats (stille regio's vallen vanzelf uit het
overlapvenster) — topbar-chips "Overlap laag/hoog Hz" + slechtste-paar Fase P95,
SPL-strip "W-M/M-T score · Hz", fasepaneel per-paar-flatnessregel, paar-markers in de
fase-chart. Nog open (4b-staart): pairwise timing-verdicts met eigen fitband per paar.
**Trede 5 (aug 2026) — vxp-export in 3-weg**: de export was 2-weg-bedraad op drie plekken
(`isTweeterModel` als enige rolvraag, hoekset via `tw ? tweeter : woofer`, en twee excess-delays
genormaliseerd op elkaar). Nu resolvet hij model → ROL via `pickSlotsN` — dezelfde mapping die de
solver gebruikt, dus een mid kan niet als woofer exporteren met de verkeerde responsie, hoekset
én delay; ambigu valt terug op de oude isTweeterModel-vraag. De delay-normalisatie loopt over
álle geladen drivers (vroegste 0), wat bij twee drivers exact de oude rekensom is, en de note
noemt de rollen die werkelijk geëxporteerd zijn. GEVERIFIEERD in de browser met drie
ONDERSCHEIDBARE bestanden per rol: woofer→WOOFERFILE 50,1 µs · mid→MIDFILE 67,8 µs ·
tweeter→TWEETERFILE 0 µs — elke rol zijn eigen meting en zijn eigen excess-delay. Dit was het
laatste echte gat in fase 4: een 3-weg-ontwerp kon tot nu toe niet naar Stefan.
**Trede 3 (aug 2026) — bandpass-tak**: `deriveTopology` cascadeerde HP→LP al bij beide
knieën enabled (nu test-gepind op de gemeten KOAN-mid); `filterTemplates` bouwt 3-weg
(LP@600 / bandpass 600–3000 / HP@3000, generiek 8 Ω; mid = 2×orde, id-counters gedeeld
over de twee ladders); App: "Build passive filter" in 3-weg = drie tak-fits (zFor
'woofer'/'mid'/'tweeter', gShift over drie takken) → één merge in een Passive build-tab
+ note "assembled tune volgt" — netOptimize blijft gegate (paar-oordeel, trede 4);
template-modellen via pickSlotsN (zModels-laadvolgorde ≠ takvolgorde), way-select volgt
de geladen set.
**Trede 4c (aug 2026) — de 3-weg-ontwerpketen (`threeWayChain.ts`)**: per (xoLow, xoHigh)-
kandidaat een doelontwerp uit de structuur-zoeker (`threeWayDesign.ts`, zie onder — v1 zette
hier nog vaste textbook-LR4-specs) + niveau-trims uit tak-medianen
(cut-only) → tak-synthese op alive-subgrids → twee-paar-netTune; 2×2-kandidaten rond de
rauwe paar-kruisingen; ranking gate't eerst op zOk (versterker-verdict — Z is
ontwerpfysica in 3-weg, nooit een objective-term), dan targets, dan de blend, tie →
goedkoopste BOM. Worker 'chain3One' + `runChain3Scan` (pool). App: 3-weg-pad in
runVfOptimize (winnaar → Working + specs → vFilters + synth-state), wizard zonder
Crossover-stap. Gemeten op Robbert: 411/2520 Hz → 0,79 dB avg/9,7°, paren 99/99.
**ABSOLUTE Z-vloer in de ranking (aug 2026, Sanders "het filter moet echt sensible zijn")**:
`zOk` is RELATIEF — het zegt alleen dat de tune de dip niet erger maakte dan de seed waar hij
mee begon. Een kandidaat wiens seed al ónder de vloer zat passeerde daarmee élke poort en won
de scan met een versterker-vijandige last. GEMETEN op Sanders 3-weg: geleverd Z-minimum
**2,2 Ω @ 2731 Hz** terwijl strip, poorten én ranking allemaal groen stonden; zijn staged-run
op 1 dB/15° werd vervolgens in zijn geheel afgewezen omdat de tuner op 1,9 Ω uitkwam — het
ontwerp was dus niet eens meer te verbéteren, want élke zet werd beoordeeld tegen een
startpunt dat al in het gevarengebied lag. Het absolute getal was nergens afleesbaar:
`netOptimizer` rapporteert nu `after.zMinOhm` (het SLECHTSTE van eval-grid en safety-grid — een
smalle dip buiten een ingezoomde view range bereikt de versterker toch) en `Chain3Result`
draagt hem. Ranking = KLASSE naast zOk (`zClass` = zOk-falen weegt zwaarder dan een eerlijk
lage last), nooit een score-term: de anker-les houdt fysica op beslispunten, en een last die
een ontwerper niet zou publiceren mag niet met een tiende dB terug te kopen zijn. Een
ONGEMETEN minimum wordt nooit gestraft. Zichtbaar of het bestaat niet: "Z min"-kolom in de
scan-tabel (glyph eerst, kleur versterkt alleen), de waarde op elke kandidaat-regel, en een
winnaar-note die onderscheidt tussen "er ís een gezonde kandidaat, hij scoort alleen minder
vlak" en "geen enkele kandidaat haalde het" — dat tweede is een eigenschap van déze drivers in
déze topologie (drie parallelle takken rond een overgang), geen tuning-misser.
**GEPROBEERD EN TERUGGEDRAAID — dood-gewicht-veeg (aug 2026)**: de staged PRUNE is gegate op
`meets()` (snoeien kost kwaliteit, dus je mag alleen kwaliteit uitgeven die je over hebt), en
daardoor levert een ONHAALBAAR doel HELEMAAL geen opruiming. Gemeten op Sanders 3-weg (doel
1 dB, geleverd 2,22 dB): de tweetertak droeg een 6,8 mH SHUNT-spoel — 186 Ω op de 4364 Hz-
overgang tegen een ~6 Ω tweeter, dus een open verbinding mét prijskaartje, BOM-regel en
schema-slot. De WAARNEMING klopt. De OPLOSSING niet: een veeg die onderdelen verwijdert
waarvan verwijdering <0,5% van fx kost maakte het geleverde filter meetbaar SLECHTER — zelfde
9-kandidaat-scan, winnende kandidaat 2,22 → 3,20 dB piek (veeg vóór de prune) en 2,22 → 3,09
(veeg als laatste stap). De nooit-slechter-controle die ik erop zette vuurde NOOIT, en dát is
het leerzame deel: op het moment dat de veeg draait degradeert hij niets — het verlies ontstaat
STROOMAFWAARTS, in de amp-reparatie en de catalogus-snap, die op een netwerk met één onderdeel
minder anders landen. Precies de "bewaker op trede N, stil ongedaan gemaakt op trede N+1"-vorm
van de drie bugs hierboven, nu met mijn eigen bewaker als slachtoffer. Afgrenzen zou de hele
staart twee keer per kandidaat kosten (de snap is het dure deel) en een bewaker op een bewaker
stapelen is precies hoe het objective-anker eerder sneuvelde. Voor wie het oppakt: het
criterium moet FYSISCH zijn (impedantie van dít element tegen de tak waar het in zit, over de
band waar die tak werkelijk bijdraagt) i.p.v. een delta op de gemengde objective — een
onderdeel dat écht inert is kan de stroomafwaartse stappen niet verplaatsen en heeft dus geen
terugdraai nodig.
**DE ONTWERPERS-SEQUENCE (aug 2026, Sanders "mijn gevoel zegt dat de huidige sequence niet
klopt" — en dat gevoel was juist)**: drie omkeringen t.o.v. hoe een topontwerper werkt, in één
ronde rechtgezet. De toetssteen: bij een ontwerper stuurt de som nooit de structuur — de som
valideert; structuur komt uit niveau + fysica. Élke bewaker die we om de tuner heen bouwden
(kooien, adaptieve xo-gewichten, pin-reparatie, de lek-term in de ontwerpstap) was een
symptoom van de omgekeerde volgorde. (1) **Niveau eerst**: `crossover3Variants` trimt élke tak
naar de stilste (cut-only, medianen over fysica-gesplitste passbands) vóór de ankerbepaling —
de rauwe ankers lazen de kruising van een luidspreker die na het padden niet bestaat
(test: ankers zijn niveau-invariant, +8 dB tweeter verzet geen kandidaat; bewezen falend op de
oude code). Anker-only bewust: designThreeWay her-leidt zijn trims per knie — één eigenaar per
beslissing. (2) **De geleverde overname wordt beoordeeld**: `judgeWindows` (pin = belofte,
gemeten venster = fysica; de kooi blijft boekhouding), `xoWindowOk` als ranking-KLASSE tussen
Z-vloer en targets, `pairOverlapOct` gerapporteerd (netOptimizer geeft de integratie-bandbreedte
per paar door — geen extra solve) in scan-tabel + note. Een kruising voorbij het bundelpunt is
off-axis een ándere luidspreker, hoe vlak de som ook is — Sanders build: W-M op 1069 Hz met
3,2 oct overlap tegen een 629 Hz-plafond, en het paneel gaf dat paar een 99 (integratie beloont
brede overlap — juist voor een 2-weg-sóm, achterstevoren voor een overname). (3) **De tuner aan
de leiband**: de keten geeft per tak het akoestische DOEL mee (spec × gemeten responsie,
gemaskeerd op alive + eigen-piek−25 dB) en de objective draagt een corridor 2·(afwijking
voorbij ±3 dB)² — exact 0 erbinnen (bouwbaarheidsvenster-patroon), dus fase uitlijnen en ±3 dB
trimmen blijven gratis en een tak-herbouw van 10 dB kost ~60. Gewicht 0,5 was GEMETEN te zacht
(6,7 dB ontsnapping op het pad-loze testnet); alleen de keten geeft targets (een user-netwerk
heeft geen ontwerpdoel), plain paths bit-identiek.
**GEMETEN A/B, zelfde 9 kandidaten, targets 3 dB/15°**: referentie-winnaar 2,43/0,83 dB maar
W-M-paar 30,9° avg/P95 59°, kruisingen 578/8786 (buiten venster), 25–29 parts (10 prijsloos);
sequence-winnaar 3,05/1,05 dB met paren 9,6°/8,7° (P95 22/23°), overlap 1,6/1,6 oct,
kruisingen 418/4823 (binnen beide vensters), Z 2,8 Ω resistief, **18 parts, 18/18 geprijsd**.
De ruil is die van de ontwerper zelf: ~0,4 dB on-axis-vlakheid koopt gebalanceerde overnames,
een gezonde last en een derde minder onderdelen — en dat lage aantal is een BIJPRODUCT van de
volgorde, geen snoeidruk. De vlakkere rijen staan nog in de tabel, mét de glyphs die uitleggen
waarom ze verloren.
**Per-paar-pins + per-paar-flanken (aug 2026, Sanders settings-review)**: in 3-weg vraagt
"Crossover points (low + high)" twéé pinnen (laag xoLowFreqHz±xoLowMarginHz, hoog = de
bestaande xoFreqHz±xoMarginHz) — gepinde as = kandidaat-collapse in de scan én
`xoRangePairs`-pin in de tune (dé fix voor de vrij schuivende kruisingen, 411→1237); en
vier flank-doelen: acSlopeWoofer (woofer-LP laag), acSlopeMidHp (mid-HP laag — "de mid
heeft twee flanken"), acSlopeMid (mid-LP hoog), acSlopeTweeter. netOptimizer:
`acousticSlopes.low` + `xoRangePairs` per paar in fx (2-weg bit-identiek: één paar = de
oude twee one()-calls). Alles gepersisteerd (design-velden + autosave-deps).
**Gekoppelde-paren-poort (aug 2026, Sanders "W-M raakt de SPL en dus M-T")**: de paren
delen de mid-tak, dus een gemiddelde fase-metriek laat de tuner de ene overgang stil
inruilen tegen de andere. `pairPhaseDeg` (uniform gemiddelde per paar) rijdt mee in de
metrics + het rapport; élke staged-beslispoort (meets/prune/escalatie/reparatie) en de
chain-ranking oordelen op het SLECHTSTE paar (`phaseGate`/`worstPhase`); de
zoek-objective houdt het gemiddelde (anker-les). 2-weg bit-compat: één paar ⇒
m.phaseDeg. Scan-note toont "(W-M x° · M-T y°)".
**Kandidaat-kooien + instelbaar aantal (aug 2026, Sanders eerste echte 3-weg-run)**: zijn scan
leverde een ontwerp met knieën op 490/3000 Hz dat AKOESTISCH kruiste op 1256/6361 Hz — de
mid-tweeter-overgang een octaaf te hoog, midden in de mid-breakup, en dáár stond zijn fase-P95
op 50°. Oorzaak: `crossover3Variants` gaf alleen kandidaat-CENTRA, en de keten zette
`xoRangePairs` alleen als de gebruiker zelf pinde — zonder pin `[null, null]`, dus niets hield
de kruising vast (exact de 2-weg-les "vrij schuivende kruisingen", die 3-weg nooit had
gekregen). Nu draagt elke kandidaat zijn eigen KOOI per as (`sliceAxis` betegelt de as in
log-ruimte: gepinde as = de pin onderverdeeld, vrije as = de omgeving van de rauwe kruising
×0,75…×1,4), en die kooi voedt zowel het knie-venster van de ontwerpstap als `xoRangePairs`
in de tune — ontwerp en tune moeten het eens zijn over waar deze kandidaat woont.
`xo3Steps` (⚙, 1/2/3 → 1/4/9 ketens, gepersisteerd) werkt GEPIND ÉN VRIJ — Sanders wens; de
2-weg-`xoScanSteps`-select is in 3-weg verborgen (twee betekenissen van "steps" naast elkaar).
Kandidaten worden GEDEDUPLICEERD op (xoLow, xoHigh): de clamp xoHigh ≥ 2,5×xoLow kan twee
stappen op hetzelfde punt zetten (bij steps=3 clampten de twee laagste hoog-stappen van de
767 Hz-rij allebei naar 1918), en dat kostte een volle keten-runtime aan een dubbel resultaat
terwijl de voortgangstabel — op LABEL gekeyed — de rij stil opslokte: "9 kandidaten" toonde
als 8 en er draaiden er 9. In de browser gevonden door de rijen te tellen.
`after.xoHzPairs` wordt nu gerapporteerd en de scan-note toont "crosses x/y Hz": een ontwerp
kan élk vlakheidsdoel halen terwijl zijn overgangen een octaaf naast de knieën liggen, en dat
was nergens afleesbaar.
**GEMETEN, en eerlijk gemengd** (Robbert, zelfde kandidaat, staged targets, geen pin):
ongekooid ontwierp 345/1620 → leverde 363/**3954**, avgDev 1,172, paren 5,0/18,6°; gekooid
ontwierp 341/1844 → leverde 363/**2776**, avgDev 1,341, paren 8,0/14,5°. De kooi halveert de
drift en verbetert het slechtste paar 22%, maar kost 14% vlakheid — en de kruising ontsnapt
nog steeds (2776 boven de kooigrens 1844). De xo-penalty is ZACHT (kwadratisch in octaven,
adaptief gewicht pas onder ±0,15 oct halve breedte), dus een brede kooi bindt niet echt; de
winst zit vooral in kandidaten die eindelijk écht verschillende gebieden verkennen i.p.v. naar
hetzelfde bekken te convergeren. Meer stappen ⇒ smallere kooien ⇒ strakker gebonden.
**De drift-oorzaak: GEVONDEN via tak-dissectie, en het was NIET mijn eerste hypothese
(aug 2026, drie metingen diep)**. Hypothese 1 was: de breakup-guard bewaakt `[xo×1,6…xo×4]`
(kruising-verankerd), dus een weggedreven kruising blindt zijn eigen bewaker — plausibel, en
WEERLEGD: een resonantie-verankerde extra guard-band (`breakupHzOf`, lokale-trend-piek) maakte
álles meetbaar slechter (avgDev 1,17→1,31 ongekooid) én Robberts mid heeft helemaal geen
scherpe resonantie (null — zijn "breakup" is een brede bult). Volledig teruggedraaid.
Onderweg twee proces-lessen: (1) het eerste meetscript had zijn EIGEN piekdetectie i.p.v. de
engine-functie en rapporteerde cijfers die de engine nooit zag — meet altijd door de echte
functie; (2) een hele-band-mediaan als piekreferentie wijst bij een 50 dB-klimmende respons
gewoon "waar de curve het hoogst is" aan — een breakup is een LOKALE piek (±½-octaaf-venster).
**De echte oorzaak (tak-dissectie: target vs synth vs tuned |H| op probe-frequenties)**: de
synthese volgt het doelontwerp op 0,4 dB — ONSCHULDIG; de TUNER herbouwde de tweeter-tak
(doel BW3@1620/−5,4 dB@2k → geleverd −29,5 dB@2k) omdat het lek-venster ONDER de kruising
(`[xo/4…xo/1,6]`, tweeter ≥20 dB onder de som) bij BW3@1620 met déze hete tweeter
ONVERVULBAAR is (~17 dB op 1 kHz) — de tuner "lost" dat op door de kruising omhoog te duwen.
De ontwerpstap koos die structuur omdat hij de guard NIET kende: de 2-weg-ontwerper heeft de
lek-term (0,02·leakSq) wél in zijn objective, `designThreeWay` had hem niet. **Fix: de
ontwerpstap draagt nu dezelfde lek-term op hetzelfde gewicht** (netOptimizer-definitie,
per paar rond het gemeten overlap-centrum van dat paar) — een fundamental die de tuner
handhaaft moet zichtbaar zijn voor de trap die de structuur kiest, anders vechten ze en wint
de tuner. Gemeten daarna: ontwerp kiest ZELF LR4@2700, tuner respecteert het (−17,0 vs doel
−16,1 @2k), geleverde M-T-kruising 2838 vs ontworpen 2700 — de strijd is weg.
**Scan-ankers = het overlap-centrum van het paneel** (computeIntegration op het rauwe paar —
zelfde definitie als de "Overlap x/y Hz"-chips): de eerste versie (`firstCross`, "eerste punt
waar boven ≥ onder") vond bij een hete tweeter de ónderrand van het zoekvenster en bij een
mid-stiller-dan-woofer niets (meetkundig-gemiddelde-fallback) — ankers 548/1800 Hz waar het
paneel 1631/5455 zegt; de scan zocht in de verkeerde buurten en de tuner bleef richting de
echte overname-regio ontsnappen. NB nog open: het W-M-anker uit het overlap-centrum is zwak
bewijs (die niveaus KRUISEN nooit echt — W-M-keuze is conus-grootte/directiviteit-domein, de
tuner wil op Robbert lager dan het anker) en de topbar zegt "Timing unreliable" — álle
fase-conclusies op deze set staan onder dat voorbehoud.
**Diepere zoektocht in de gezamenlijke tune (aug 2026, zelfde ronde)**: de tak-synthese
schakelt boven 9 dims al blok-coördinaat-verfijning in ("past ~10 dims crawlt één simplex"),
maar de ASSEMBLED tuner had dat nooit gekregen — en een 3-weg-netwerk draagt 16–25 vrije
waardes. `tune()` doet nu na de multi-start overlappende 6-dim blokken (stap 3) plus één
strakke volledige polish. Blokken zijn INDEX-gebaseerd: gemergede parts komen in TAK-volgorde
binnen, dus opeenvolgende slots delen meestal een tak en de overlap overbrugt de naden — dat
is precies wat verhindert dat het "de paren apart tunen" wordt. De koppeling blijft intact:
elk blok wordt gescoord door dezelfde VOLLE objective (beide paren, hele netwerk) en alleen
geaccepteerd als die verbetert — zoekdiepte, geen objective-wijziging (anker-les). Gegate op
3-weg (`midB !== undefined`) zodat 2-weg bit-identiek blijft, en op de VOLLE tunes
(budgetScale ≥ 1, geen amp-floor-reparatie): de 0,6-schaal-retunes zijn lokale herstelstappen
vanaf een al goed punt waar de diepe zoektocht zijn runtime niet terugverdient.
**GEMETEN, hele keten A/B op Robberts echte 3-weg-set (411/2520 Hz, filter-modus)**: oud
(textbook-LR4 + polariteit-zoals-geladen, geen blok-verfijning) → piek-rimpel 5,13 dB /
avgDev 1,055 dB / fase 10,5° / paren 9,0–11,9°; nieuw → **1,58 dB / 0,628 dB / 6,6° /
6,1–7,0°**. Piek ruim 3× beter, hele-bereik-afwijking 40% beter, slechtste paar bijna
gehalveerd. Kost wél runtime (de blok-passes zijn echte MNA-solves) — dat is de bewuste ruil
voor "het beste resultaat".
**Structuur-zoeker (`threeWayDesign.ts`, aug 2026 — Sanders "we moeten voor het beste
resultaat gaan")**: de staged-v1-keten ging van vaste textbook-LR4 + polariteit-zoals-geladen
rechtstreeks de synthese in. Twee beslissingen die de componenttuner NOOIT kan repareren
(hij verzet waardes op een VASTE topologie en een VASTE polariteit), en de 2-weg-les
"EQ wast alignment-verschillen weg" gaat hier niet op — de 3-weg-keten heeft geen EQ-trede.
`designThreeWay` enumereert daarom alignment(laag) × alignment(hoog) × mid-polariteit ×
tweeter-polariteit = 64 structuren op PURE filtermath (evalDriverFilter × applyTransfer ×
combineN, geen enkele MNA-solve), verfijnt de basisknoppen van de beste 4 met NM, en levert
de winnende doelspecs. GEMETEN op Robberts set: de 64 structuren spreiden de combined-std
van 1,39 tot 6,52 dB (factor 4,7) — de keuze is dus geen formaliteit; de slechtste rijen zijn
precies de polariteit-suckouts. Op ZIJN drivers wint LR4/LR4 non-inverted (de oude
textbook-gok zat dus goed, maar nu is dat GEMETEN i.p.v. aangenomen).
Doctrines die erin zitten: één kruising = één beslissing (het paar deelt knie én alignment —
`woofer.lp ≡ mid.hp`, test-gepind); polariteit wordt ABSOLUUT bepaald en overschrijft de
inkomende checkbox (de UI volgt daarna via `setMidInverted`/`setInverted`, anders simuleert
de app een ander ontwerp dan er gefit is); fase-metriek = uniform gemiddelde + P95-term,
exact de 'band'-definitie van paneel en 2-weg-objective (de "elke bewaker zijn eigen
privé-definitie"-bugfamilie); objective middelt de PAREN (glad voor de simplex — anker-les),
de gekoppelde-paren-WORST-regel blijft op de beslispoorten; EQ-banden bewust NIET (die zijn
synthese-gereedschap, acoustic-doctrine). Bindende keuze per kruising via `structureLow`/
`structureHigh` — de ⚙-dropdown "HP/LP preference" was in 3-weg wél zichtbaar maar werd
GENEGEERD; nu twee dropdowns (laag/hoog), zelfde conventie als de flank-doelen
(`hpLpPrefLow` gepersisteerd, mét autosave-dep).
**PER-PAAR TIMING-VERDICT OP EXCESS-FASE (aug 2026, Sanders "ik vermoed dat mid/tweeter een
gedeelde tijdlijn hebben") — de 4b-staart, en het was een VALS ALARM**: de topbar-chip stond
de hele 3-weg-sessie op "unreliable" en zette daarmee élk fase-cijfer onder voorbehoud. Drie
oorzaken, alle drie fout aan de CHECK, niet aan de metingen: (1) hij vergelijkt
woofer↔tweeter — in een 3-weg de twee drivers die elkaar nauwelijks overlappen (de mid draagt
alles ertussen); (2) op RAUWE fase, die de eigen minimum-fase-rotatie van elke driver opslikt,
dus de R² klapt in zodra een driver afvalt; (3) over een vaste 500–5000 Hz die bij geen van
beide paren past. GEMETEN bewijs dat het de check is: rauwe fase gaf Robberts mid 304 µs
(200–800) én 8 µs (5–8k) — één driver kán geen twee looptijden hebben; op EXCESS-fase geeft
dezelfde mid **−21 µs met R² = 1,000 in élke subband**. Die reproduceerbaarheid ÍS de
vingerafdruk van een gedeelde klok: een losse tijdreferentie levert een willekeurige offset,
geen herhaalbare. `assessPairTimeBase` (timing.ts, unit-getest; `assessSharedReference`
onaangeroerd → 2-weg exact gelijk) + `timing3`-memo in de App: per aangrenzend paar een
excess-fase-fit, chip toont het SLECHTSTE paar, tooltip beide. Twee harde lessen in de
fitband: (a) de FILE-grenzen zijn waardeloos (deze FRD's beginnen op 5 Hz — dat gaf R²=0,101),
dus de band komt uit het echte PASSBAND per driver (binnen 10 dB van het bovenste kwartiel),
geklemd op 200–10000 Hz omdat de FFT-minimum-fase aan zijn randen randeffect is; (b) bij de
rolloff-knie van een driver is fase nooit delay-achtig (tweeter R² 0,68 vanaf 768 Hz, 0,95
vanaf 3 kHz), dus de lage rand wordt in vaste stappen (×1, 1,5, 2,5, 4) getrimd tot beide
fits schoon zijn — deterministisch, en het verdict meldt de band waarop het landde.
UITKOMST op Robbert: **W-M −33 µs (−11 mm) · M-T +39 µs (+13 mm) → beide "plausible"**, dus
gewone baffle-geometrie en een gedeelde tijdbasis. Alle fase-conclusies van deze sessie staan
dus NIET meer onder voorbehoud.
**Band-attributie in de SPL-strip (aug 2026, "spoor de Response-beperking op")**: de
tilt-hypothese was FOUT — gemeten op Robbert is de virtuele som van de ontwerpstap vlak
(LOW 200–700 Hz 109,8 vs HIGH 3k–16k 110,3 → tilt 0,5 dB) en de niveau-trims kloppen. De hele
Response-beperking is een BAND-MISMATCH: de score oordeelt over het ZICHTBARE bereik, de
optimizer ontwerpt vanaf een vloer van 200 Hz. Zelfde ontwerp: avg ±1,04 (200 Hz–18 kHz) vs
±1,84 (20 Hz–20 kHz) — in de app score 77 vs 44, en het verschil is volledig de eigen
afval van de woofer onder 200 Hz (107,8 dB @20 Hz vs 114,7 @500), die een CUT-ONLY passief
netwerk niet kán optillen (alleen evenaren door overal gevoeligheid weg te gooien —
baffle-step-terrein, een bewuste ontwerperskeuze). Dit is exact de bugfamilie waarvoor
bandMetrics is uitgetrokken (twee bewakers, twee banden), dus: `optimizerFloorHz`-memo +
strip-item "designed from 200 Hz", dat ALLEEN verschijnt als het zichtbare bereik onder die
vloer duikt. Bewust géén objective-wijziging (anker-les) en géén verlaagde vloer: laag
meenemen zonder gevoeligheidsbudget is precies de solo-val ("alles omlaag = ook vlak").
NB Sanders HP-vermoeden: een HP op de woofer zou het cijfer juist verslechteren — de afval
ís al de HP van de kast; wat ontbreekt is niet filtering maar zichtbaarheid.
**EQ-trede in de 3-weg-ontwerpstap (aug 2026, Sanders "bouw jij maar eens" — 2-weg-pariteit)**:
de laatste ontbrekende trede. Sanders beste run (Response 27) werd begrensd door precies wat
géén ketentrap kon aanraken: een HF-tilt van de som en de in-band-bulten van de mid. Stage 3
in `designThreeWay` (ná structuur + knie-refine, `eqBandsPerBranch` — gevoed door de
bestaande "EQ bands/driver"-instelling; 0/afwezig = uit, staged-v1 bit-compat, test-gepind):
greedy CUT-ONLY, per ronde (a) een piek-cut op de slechtste POSITIEVE uitschieter van de som
t.o.v. de mediaan, toegeschreven aan de tak die dáár dominant is, plus (b) tilt-gated
shelf-kandidaten (highShelf-cut op mid/tweeter bij >1 dB te hete bovenhelft, lowShelf-cut op
de woofer bij het omgekeerde); elke kandidaat 3-dim NM-verfijnd (freq ±0,67 oct, gain
geklemd ≤0, Q-vloer 0,7 — de solo-les: daaronder is een "piek-cut" vermomd breedbandverlies)
tegen de VOLLE objective (amp + paar-fase + lek), gehouden bij ≥1% winst — een band moet
zijn fysieke componenten verdienen. Specs dragen de banden → de synthese realiseert ze al
(traps/shelf-pads, acoustic-doctrine "gereedschap-niet-doel") → de tuner verfijnt.
Label meldt "· N EQ". Unit-getest op een synthetische +10 dB-bult op 1,5 kHz in de mid:
band landt op de juiste tak nabij de bult, cut-only overal, budget per tak gerespecteerd,
deterministisch. Bijvangst dezelfde ronde: het staged-doel-rimpelveld klemde op max 3 dB
(Sanders kon zijn doel niet kwijt) — beide invoervelden nu max 6.
**PIEK-BEWUSTE amplitude-term in de ontwerpstap (aug 2026, Sanders "het filter moet echt
sensible zijn")**: de EQ-trede stopt op een ≥1%-poort, en de amplitude-term was kale `std` —
die merkt een 3 dB-lift nauwelijks. GEMETEN: het budget van 2 naar 4 banden zetten veranderde
Sanders winnende ontwerp LETTERLIJK niets (byte-identieke cijfers, nog steeds "1 EQ"), want een
tweede band kon zijn 1% niet verdienen terwijl de som 104,6–111,3 dB spande — precies het enige
dat je hóórt was het enige waar geen band zijn componenten voor kon terugverdienen. Dezelfde
blindheid als de solo-engine had, dus dezelfde metgezel op hetzelfde gewicht: `std² +
0,35·peakExcess²` (bandMetrics), alleen POSITIEF en tegen de MEDIAAN — een dip is de eerlijke
bodem van een cut-only ontwerp en mag niet lezen als een fout die de optimizer dan "repareert"
door al het andere omlaag te trekken. Gemeten over het HELE 9-kandidaten-veld (gemiddelden):
piek 3,57 → 3,20 dB · avg 0,99 → 0,96 · fase 20,0 → 17,8°; winnaar piek ±3,4 → ±2,4 dB,
P95 ±2,6 → ±1,8, bouwtolerantie ±10% worst ±4,03 → ±3,07 (RSS ±1,83 → ±1,45), BOM €111 → €92,
en er landen nu 2 EQ-banden waar er 1 landde.
**GEMETEN fysica-vensters voor beide vrije assen (aug 2026, Sanders "het doel is dat de
optimizer dit verzint")**: wat de ontwerper handmatig uit de grafieken las, leidt de scan nu
zelf af. `beamingCeilingHz` (directivity.ts): eerste frequentie waar het ±⅙-oct-gemediane
0°−30°-verschil ≥4 dB komt én dat een HALVE octaaf volhoudt — HARD GELEERD op Robberts mid:
een baffle-diffractie-wiebel (+4,6 dB @1,5 kHz, weg bij 2 kHz) overleeft een ⅓-oct-check en
las als "beaming op 1462" terwijl echte bundeling alleen maar erger wordt met frequentie;
met ½ oct → 8022 Hz, het echte punt. `reachesLevelHz` (bandMetrics.ts): laagste frequentie
waar een driver binnen 6 dB van zijn passband komt — referentie = BOVENSTE KWARTIEL, niet
de mediaan (een driver die over zijn hele bereik gemeten is besteedt octaven aan flanken;
de mediaan zakt daardoor onder de passband en noemde de flank te vroeg "op niveau").
Vensters: W-M-vloer = max(2×Fs mid, mid-reach), W-M-plafond = gemeten woofer-beaming;
M-T-vloer = max(2×Fs tweeter, tweeter-reach), M-T-plafond = gemeten MID-beaming (dicht ook
het "vrije hoge as is zwak"-gat); size-formules zijn terugval zonder hoekdata.
`crossover3Variants` kreeg `highWindow` (spiegel van lowWindow, gedeelde `freeSpan`-logica);
App-memo `physWin3` voedt scan én ⚙-uitlezing ("W-M 353–629 Hz (measured beaming) · M-T
1310–7000 Hz (measured beaming)" — live op Robberts data; W-M-kandidaten 353/472/631 = exact
het eerder met de hand afgeleide advies). NB eerlijk: Robberts mid REIKT wél tot ~170 Hz
(104-106 dB gemeten op 162-185 — de FRD is de waarheid; mijn eerdere "pas op 550"-aflezing
van een screenshot was fout), dus daar regeert de 2×Fs-vloer; de reach-vloer is het vangnet
voor drivers die het niet doen. Synthetische unit-tests pinnen blip-robuustheid,
staart-robuustheid en de null-gevallen.
**Gemeten plafond mag de vrije rails oprekken, nooit voorbij het bundelpunt (Sanders
breedbander-observatie + "maar de bundeling zal anders zeggen")**: een breedband-mid geeft
qua fase/SPL de beste M-T rond 8,7–9 kHz (gemeten: 3–7° paar-fase daar vs ~10° op 4,9k —
minder filterordes, natuurlijke rolloff doet de flank, tweeter luiert), maar zijn gemeten
bundelpunt is 8022 Hz. De regel: een GEMETEN plafond boven de klassieke rail (7000 hoog /
1500 laag) rekt de vrije rail op TOT dat bundelpunt (kandidaat op 8022 kan nu vrij gevonden
worden), maar nooit erverbij — voorbij het gemeten bundelpunt is PIN-terrein: de fysica
begrenst de vrije zoektocht, alleen de ontwerper stapt er expliciet overheen, en de
in-room-term + xoPinNote prijzen/melden die keuze eerlijk. Test-gepind (ceiling 8500 ⇒ max
vrije kandidaat ≤8500, zonder venster blijft 7000/8000).
**Pin-zichtbaarheid (Sanders "lijkt de range te negeren … bypassen met een expliciete
waarschuwing")**: de pin ÍS de expliciete bypass van élke afgeleide regel, dus (a) een
niet-gehouden pin leidt de scan-note nu met "⚠ PIN: could not hold …" i.p.v. begraven te
staan, en (b) de ⚙-venster-uitlezing toont bij een actieve pin "W-M pinned · M-T pinned —
pins override the derived windows" i.p.v. het vrije venster te blijven tonen (dat las als
"hij negeert mijn range"). NB de verwarring in zijn screenshot: Filter-bands-KNIEËN
(LR4@479/2710) zijn elektrische doelen en blijven vrij — de pin zit op de AKOESTISCHE
kruising; knieën ver van de pin zijn geen bewijs van een genegeerde pin.
**In-room weight in 3-weg (aug 2026, Sanders "is de 2-weg-engine hier ook blind voor?")**:
nee — de 2-weg weegt met hoekdata de energy-average-vlakheid mee (dirWeight, default 25%),
en juist dáár verschijnt een directiviteits-trap bij de overname die on-axis onzichtbaar is.
De 3-weg gooide angleData weg ("2-weg-vocabulaire", trede 4a) — terwijl Sanders woofer
gemeten −3,5 dB @30°/600 Hz doet en de mid daar nog rondstraalt. Nu: netOptimizers
hoek-blok somt in 3-weg DRIE takken per hoek (combineN-semantiek, elk met eigen transfer +
adjust; mid-hoekset VERPLICHT om te armeren — een twee-tak-som zou stil fout zijn),
`Chain3Input.angleData` + settings.directivityWeight/ampTarget, App levert de banded
hoeksets (zelfde ghost-behandeling als de 0°-takken). GEMETEN (zelfde vrije kandidaat, A/B):
on-axis-only leverde de W-M-overname op 3033 Hz — midden in het bundelgebied — met fase
63/40°; met in-room 25% op 919 Hz met fase 32/35° en betere rimpel. De term stuurt dus
meetbaar wég van de bundeling; het paneel-advies blijft: pin W-M ~575±75 op déze drivers
(de energy average is een gewogen gemiddelde, geen harde muur). NB de ontwerpstap
(designThreeWay) is nog on-axis — de tuner en de ranking dragen de term. NB2, eerlijke
kanttekening uit dezelfde meting: het vrije M-T-anker (overlap-centrum op de RAUWE
responsies) vindt bij een hete tweeter alsnog het láge kruispunt (~1200→1800-vloer) — het
"paneel-anker 5455" uit een eerdere sessie kwam van een GEFILTERDE staat. Vrij scannen op
de hoge as blijft dus zwak op hete tweeters; de pin is daar het gereedschap.
**Pin-semantiek + hold-the-pin-reparatie (aug 2026, Sanders "zou niet boven de 575 mogen")**:
drie lagen, in volgorde gebouwd. (1) `slicePinned`: een pin betekent LETTERLIJK wat de
ontwerper intypt — marge exact (de oude ≥2%-van-f-vloer maakte van 8700±50 stil ±174; de
2%-ademruimte zit nu op de kooi-RAILS), pin-centrum draait altijd zelf mee (rand-tot-rand-
log-slicing legde het midden op het meetkundige centrum: 400±200 → 346, nooit 400), gepinde
rails volgen de UI-invoerlimieten (150–2000 laag, tot 12000 hoog — de v1-caps 7000/8000/1500
pletten Sanders 9 kHz-pin stil naar 7 kHz). (2) Kooien van rand-kandidaten worden op het
PIN-VENSTER geklemd — de "nooit nul-breed"-verbreding stak eerst een halve spacing vóórbij
de pinrand (575-kandidaat → kooi-top 623) en brak de belofte opnieuw; mét de klem houdt de
gewone zachte penalty de kruising al binnen (gemeten: geleverd 578 op een 575-pin, geen
reparatie nodig). (3) Vangnet: `xoPinHard`-reparatie-pass in de keten (Z-vloer-doctrine —
eerst normaal tunen, alléén bij ontsnapping van een GEPINDE as een lokaal geseedde retune
met stijve barrière; vrije-as-kooien zijn boekhouding, geen belofte). HARD GELEERD: de
xoF-kruising is een TRAPFUNCTIE van de componentwaardes (verspringt per gridpunt), dus de
stijve 1200·oct²-barrière heeft op zijn plateau geen gradiënt en de warm-geseedde simplex
zakte terug naar vlakheid (gemeten: bleef op 705). De reparatie kreeg daarom een CONTINUE
metgezel (`xoEdgeSq`, alleen in repair-mode): "op de bovenrand van het venster heeft de
bovenste driver de onderste al ingehaald, op de onderrand nog niet" — twee gladde
dB-verschillen, gewicht 20 (3 dB tekort ≈ 180). Gemeten: 705 → 617 mét alleen de barrières,
en met de kooi-klem is de reparatie de terugval i.p.v. het pad. `xoPinNote` rapporteert
eerlijk beide uitkomsten ("pinned crossing held: … → …" / "could not hold … consider
widening the pin") en de App-note toont hem. Plain paths bit-compat: xoEdgeSq is overal 0
buiten repair-mode.
**Wizard-systeemkeuze (Sanders voorstel, aug 2026)**: stap 0 begint met 1-weg/2-weg/3-weg
(`wizardWays`, localStorage 'ads-wizard-ways'; data wint bij openen — volle 3-weg forceert 3,
exact twee buitentakken 2) en toont alléén de bijbehorende slots; **Next blokkeert op
`wizardMissing`** (tooltip + regel noemen wat mist), meer-geladen-dan-gedeclareerd geeft een
⚠-note (`wizardOverloaded` — de app volgt de DATA, nooit de keuze; begeleiding, geen tweede
bron van waarheid). 3-weg-pad eindigt op stap 0 met "Open Network editor →" (de
Goals/Crossover/Components-stappen zijn optimizer-gebonden en die optimizer is trede 4);
de 🧙-knop opent bij threeWay daarom óók op stap 0. Demo-knop alleen bij 2-weg (KOAN ís
2-weg).

## Workspace-layout (UI-fase B, jul 2026)

- App = `.app-shell`: topbar (titel + status-chips: timing-verdict/integratie/overlap/fase-P95 +
  layout-toggle + theme) boven een 2-koloms `.workspace`. Links `.design-pane` met tabs
  **Import | Setup | Filters | Network** (persistent in localStorage 'ads-ui-tab'; intern id
  'data' = Setup-label); rechts `.analysis-pane` met alle charts, SPL optioneel sticky
  (📌-knop, 'ads-ui-splpin'). Beide panes scrollen onafhankelijk.
- Import-tab = file-dialogen + project-save/load + **"Imported files"-inventaris**: per driver
  (0°-FRD, hoek-FRD's, ZMA) en vxp-project elke file met een vrije notitie (`fileNotes` in
  ProjectState, key "group:filename", mee in autosave én projectfile). Setup-tab = view range/
  driver phase/tweeter adjustment/vxp-variant + timing sanity; Filters-tab = virtual filters +
  passive synthesis; Network-tab = netwerk-editor (workspace krijgt dan `wide-left` — de
  schematic-editor heeft breedte nodig). Scores zijn compacte `.score-strip`s ÍN het
  bijbehorende chart-paneel (Response flatness + gedempte integration-items in het SPL-paneel,
  phase flatness in het fase-paneel — Sanders wens jul 2026: geen losse sectie onder de chart)
  — de grafiek is de hoofdzaak; vrijwel elk control heeft een title-tooltip (helpers — maar een
  tooltip is hover-only, dus icoon-only knoppen hebben daarnáást een `aria-label`).
- **Layout-toggle in de topbar** (naast thema, localStorage 'ads-ui-layout'): Auto (volgt
  vensterbreedte, **split ≥1000 px**) / Split (altijd twee panes, ook smal) / Stacked (altijd de
  klassieke stapeling, gecentreerd op max 920 px). CSS: media query gegate op
  `:not(.layout-split)`, geforceerd-stacked blok op `.layout-stacked`, `#root:has(...)` voor de
  hoogte. **De drempel stond op 760 px omdat het Claude-browserpaneel ~800 px is — dat was
  precies de verkeerde conclusie (jul 2026, gemeten)**: op 800 px leverde split een SPL-chart van
  263 × 93 px op met een 144 px score-strip erbóven, dus de grafiek — de hoofdzaak — was het
  kleinste ding op het scherm. "Split zodra het past" heeft ruimte nodig voor én een design-pane
  én een leesbare grafiek; onder ~1000 px is er geen van beide en geeft stacked de chart de volle
  breedte (gemeten: 726 × 258 px in hetzelfde venster). Split blijft handmatig forceerbaar.
- **Splitter-positie is een FRACTIE, niet pixels** (`ads-ui-panefrac`, legacy `ads-ui-panew`
  migreert éénmalig tegen de huidige vensterbreedte). Hard geleerd: een pane die op een breed
  scherm naar 704 px was gesleept reisde mee naar een 800 px venster, waar alleen de
  `calc(100% - 346px)`-guard nog tussen de charts en niets in stond. Een aandeel schaalt mee, dus
  de voorkeur betekent op elk scherm hetzelfde; de design-pane is bovendien op 60% geplafonneerd.
  De splitter is toetsenbord-bedienbaar (tabIndex, pijltjes 2%/druk, Home = terug naar
  automatisch) — een sleep-handle die alleen op een pointer reageert is voor het toetsenbord
  onbereikbaar.
- **Fase C — grafieken à la carte**: toggle-chips boven het analysepaneel (Directivity/Sonogram/
  Filter transfer/Impedance/Phase/Time domain, elke combinatie tegelijk, localStorage
  'ads-ui-panels', default alles aan). Uit = óók niet berekend: de memos voor directivity/
  sonogram/timeDomain/phaseSeries gaten op `showPanels`. SPL + integratiescore staan altijd aan
  (chips!). **Impedance-paneel (jul 2026, Robberts "weerstand 3–7 kHz is heel hoog"-tip)**:
  systeemimpedantie |Z| van het actieve passieve netwerk (VituixCAD-pariteit) uit `sol.inputZ`,
  met Z-min-chip op IEC 60268-5-ankers (≥ 0,8× nominaal: groen ≥ 6,4 Ω, oranje ≥ 3,2 Ω, rood
  eronder), Z-min-marker in de chart, max-Z als info-item en tab-ghosts. Doctrine: alleen het
  MINIMUM kan de versterker pijn doen (stroom/warmte); hoge Z (gepadde tweeter + geblokkeerde
  mid-tak boven de kruising) is onschadelijk — hoorbaar enkel via hoge-uitgangsimpedantie-
  versterkers (buizen). NB: de KOAN-mid meet zélf 3,66 Ω min rond 388 Hz — oranje is daar de
  eerlijke driver-waarheid, geen netwerk-fout.
- **Target-curves in de SPL-chart (jul 2026, Stefans "ik heb de targets nodig in de
  grafiek")**: legend-chips "Woofer/Tweeter target" (defaultOff) tekenen de akoestische
  doelvorm van het virtuele ontwerp (zelfde bron als de 🎯 Targets-popup: evalDriverFilter
  op vFilters MET eq:[] — **EQ/shelves zijn gereedschap-niet-doel** (acoustic-doctrine);
  ze meetekenen liet het doel afwijken precies waar de driver niet vlak is, Stefans
  "dan zit het er ver naast"-vondst; tweeter-trim rijdt mee) met ÉÉN gedeeld niveau-anker (gepoolde
  passband-mediaan vs de gemeten driver-responsies) — gedeeld zodat de RELATIEVE
  target-niveaus behouden blijven en een te zachte tak zichtbaar afwijkt i.p.v.
  meegeankerd te worden.
- **Fase D — filter-handles in de SPL-chart**: `handles` op Chart (App: `splHandles`) — holle
  dot = HP/LP-knie (alleen x-drag), volle dot = EQ-band (drag = freq+gain, wheel = Q); alleen
  zichtbaar als de virtuele filters actief zijn (verdwijnen bij vfBypass — anders zou je
  filters bewerken die niet in de sim zitten). Handle-drag wint van pan; wheel-op-handle wint
  van zoom.

## Fysica-conventies & kernfeiten (KOAN-data)

- Gemeten bulk delays: mid 1,708 ms / tweeter 1,755 ms → **Δ47 µs ≈ 16,2 mm** (tweeter dieper),
  R²=1,000. Mic ~50 cm tussen drivers, gedeelde tijdreferentie → offset-regelaar hoort op 0.
  Auto-fill (bij verdict 'plausible', blijft aanpasbaar; skip bij restore): measured → 0,
  minimum → gemeten Δmm; in measured met offset ≠ 0 verschijnt een waarschuwing (dubbeltelling)
- **Rauwe bulk-Δ ≠ akoestisch-centrum-Δ (jul 2026)**: de bulk-delay-fit op rauwe fase (mid
  1,708/tweeter 1,755 ms → "+47 µs tweeter later") absorbeert de min-fase-helling van de driver;
  de EXCESS-fase-fit (gemeten − minimum phase) geeft de echte looptijden (mid 1,729/tweeter
  1,679 ms → tweeter ~50 µs/17 mm EERDER = vóór de mid). Voor de measured-modus-som maakt dit
  niets uit (alleen het rauwe RELATIEVE verschil telt en dat zit in de files); voor élke
  minimum-fase-consument (VituixCAD-brug, export-delays) is de excess-Δ de juiste waarde
- **Measured phase = default en de waarheid** (mits sanity check groen). Auto-regel: nieuwe
  metingen met verdict 'plausible' (gedeelde tijdreferentie) zetten de conventie automatisch op
  Measured — wint ook van de Minimum-default bij vxp-load; project-restore respecteert de
  opgeslagen keuze. Minimum-modus alleen voor VituixCAD-vergelijking (auto-aan bij vxp-load
  zonder plausibele timing) en diagnose. VituixCAD-brug (gecorrigeerd jul 2026): mid Delay
  +50 µs (excess-Δ, staat onder het timing-panel en zit automatisch in de export) — NIET de
  oude "+47 µs op de tweeter" uit de rauwe Δ; Minimum phase UIT + Delay 0 = optie A
- Overnamepunt ~2,2 kHz; tweeter ~5-10 dB heter dan mid; mid-breakup ~5,5 kHz; tweeter-bult →
  Stefans notch 6,5 kHz. In var3 is de mid NIET geïnverteerd (met gemeten fase; origineel wél)
- Drie kruisvalidaties met VituixCAD binnen ~1 dB (CROSSOVER1, var3, gesynthetiseerd netwerk)
- Passief kan niet boosten: virtuele boosts vervallen in synthese; topoktaaf passief vasthouden =
  lowShelf-cut (pad+bypass-C). Synthese normaliseert positieve gains naar relatieve attenuatie
- Spoel-DCR: VituixCAD default 280 mΩ; luchtspoel 1,4 mm ≈ 0,29·(L/mH)^0,65 Ω; serie-woofer-L is
  DCR-kritisch; notch-R absorbeert spoel-DCR

## UI-lessen (hard geleerd, niet regresseren)

- **Filter bands volgen de bypass-state uit ELKE bron** (jul 2026, twee rondes): bypass aan
  (handmatig, Build óf optimizer) → sectie ingeklapt; bypass uit → open; handmatig uitklappen
  tijdens bypass blijft kunnen. Eerste ronde was handmatig-only (Sanders "het resette mijn
  filter bands" — inklappen op een Build las als dataverlies), tweede ronde draaide hij dat
  bewust terug NADAT de ingeklapte header een samenvattingsregel kreeg ("muted · Woofer/mid:
  LP LR4 @2000 — …"). Die summary-regel is dus de voorwaarde: NOOIT kaal inklappen.
  Uitgeklapte inklapsecties (Filter bands, ⚙ optimizer-settings) zijn één omkaderde kaart
  met accent-rand + titelbalk; toolbars zijn gelabelde `.tool-group`-clusters (Start/Export/
  Catalog/Tools/Simulation op de Network-tab, Design/Configure/State op Filters, Measurements/
  Project/Catalog op Import)

- **De legenda mag de grafiek niet overgroeien** (`secondary` op Series, jul 2026): elke feature
  kreeg terecht een legend-chip, maar niemand besloot ooit hoeveel er sámen mochten staan — elf
  SPL-items wikkelden op 800 px naar acht regels (158 px legenda boven een 93 px grafiek).
  Ondersteunende curves (tab-ghosts, tolerantie-envelop, target-vormen) vouwen achter één
  "+N more"-chip. BEWUST alleen presentatie: een opgevouwen curve wordt gewoon getekend, en een
  serie die de gebruiker zélf heeft uitgezet blijft in de lijst staan (anders verdwijnt zijn chip
  buiten bereik). Hard geleerd in dezelfde bouw: tel wat er kán vouwen, niet wat er ís gevouwen —
  op het gevouwen aantal verdween de chip zodra je hem uitklapte, zonder weg terug
- **Kleur is nooit de enige drager** (jul 2026, doorgemeten met CVD-simulatie): blauw↔paars valt
  voor een protanoop volledig samen (ΔE 2 in dark mode) en dat is met géén paars/magenta/roze te
  repareren — alleen amber/oranje scheidt echt, want de blauw-geel-as blijft intact. Die kleuren
  zijn hier bezet door de fase-tiers, dus de app lost het op met PATROON: null-check gestippeld,
  ghosts elk hun eigen dash, impulse/energy-average gestippeld, on-axis dik-massief. Zo houden
  ook samenvallende tinten hun betekenis. (Gecontroleerd: er is geen enkele grafiek waar een
  massieve paarse curve naast een massieve blauwe ligt — in de SPL-plot valt de combined buiten
  het overlapgebied wél terug op paars, maar dáár ligt hij per definitie bovenop de dominante
  driver.) `--viz-tweeter` is om dezelfde reden een TEAL: als groen zat hij op 2,69:1 (onder de
  3:1-grens voor grafiek-elementen) en simpelweg donkerder maken schoof hem naar de rode
  null-curve toe (ΔE 23 → 13)
- **Chart-meubels horen in de grijsfamilie van de interface**: grid/axis/tick waren warm naast
  koele UI-grijzen, wat als een ander systeem las. Hertint op GELIJKE luminantie — zwaarte
  onveranderd, alleen de gele zweem weg. Een vaag raster hoort vaag te blijven
- **Alle popups delen `components/Modal.tsx`** (base-ui Dialog, jul 2026 — eerste externe
  UI-dependency, naast `@number-flow/react` voor de rollende sim-teller in de busy-kaart): wizard,
  Add notch, 🎯 Targets, ❓ Help en 🗂 Catalog manager. Daarvóór hadden vijf popups drie
  verschillende afsluit-gedragingen (Help/Catalog luisterden zelf op Esc, de rest niet) en geen
  van allen een focus-trap of focus-herstel. Drie dingen die je NIET moet terugdraaien:
  (a) **de busy-overlay is bewust GEEN Modal** — hij is een `role="status"` live region, mag
  tijdens een run van minuten geen focus vangen en draagt de 250 ms close-linger met bevroren
  body; (b) base-ui zet de app erachter alléén op `aria-hidden`, dus Tab liep er gewoon in —
  `Modal` zet zelf `inert` op `#root` (de dialog hangt in een portal op `<body>`, daarbuiten), en
  dat is wat de trap laat werken; (c) Esc bereikt de dialog NIET vanuit een `type="search"`-veld,
  en juist dat veld heeft de focus bij openen in Help én Catalog manager — beide sluiten daar
  expliciet via hun eigen `onKeyDown`. De dirty-guard van de catalogus loopt via de `onClose` van
  Modal, dus Esc/backdrop/Cancel vallen allemaal onder dezelfde bevestiging
- **Eén ontworpen `:focus-visible`-ring** (2 px accent) op alle controls; zonder reed de app op
  de browser-default, die per browser verschilt en het accent negeert. Icoon-only knoppen
  (tab-sluiten, 📌, de ✕ van dialogs) hebben een `aria-label` nodig: een `title` is hover-only en
  dus géén label voor toetsenbord of screenreader
- Bedieningspanelen NOOIT achter de berekening die ze moeten herstellen (fMax="1"-val)
- View-range-velden: focus-freeze (sim pauzeert bij focus, commit op blur/Enter) + debounce
- Optimizer-instellingen moeten zichtbaar effect hebben; resultaten schrijven terug naar live state
- Optimizers autonoom (volledige toolbox, user-instellingen = seeds); budget = harde cap;
  nooit slechter eindigen dan seed (tenzij seed boven budget)
- Alles persistent (autosave + Save/Load project, raw files erin); Reset filters-knop naast Optimize
- Autosave mag NOOIT data vernietigen: lege sessie-state overschrijft geen bestaande autosave,
  en een blob die niet restored wordt apart gezet (…-unreadable), niet verwijderd (hard geleerd:
  HMR-crash tijdens restore + debounced save wiste ooit de autosave)
- **🎯 Targets-popup** (Network-toolbar): het virtuele doelontwerp waar de laatste build tegen
  gefit is (HP/LP kind/orde/knie, EQ-banden, gain, polariteit) + de GEMETEN akoestische
  hellingen naast de kruising (least-squares over ~1 octaaf, in dB/oct én ≈ akoestische orde)
  — elektrische componentvolgorde ≠ akoestische orde, en dit maakt de "akoestisch 4e orde bij
  de tweeter"-vuistregel controleerbaar (KOAN: elektrisch LR2-doel → gemeten ~21 dB/oct ≈ 4e)
- **Optimizers draaien in een WEB WORKER** (`optimWorker.ts` + `optimClient.ts`, jul 2026):
  netOptimize, de crossover-scan (variants-lus + rescue-logica in de worker; ranking op de
  main thread) en de vf-rounds-lus. UI blijft live (spinner animeert écht, tellers tikken via
  progress-messages, scrollen werkt), en de `.busy-overlay` heeft een CANCEL-knop —
  `cancelOptimTasks()` TERMINATE't de worker (geen coöperatieve vlaggen in de solvers nodig;
  volgende run spawnt vers, elke request hydrateert de catalogus zelf via `setCustomSeries`,
  want worker-module-state overleeft een terminate niet en localStorage bestaat er niet).
  Alles over de boundary is plain structured-cloneable data; CancelledError wordt stil
  geslikt (busy reset, ontwerp onaangeroerd). Handmatige "Build passive filter" (seconden)
  bleef bewust synchroon. Gemeten: tijdens een 50s-tune-run antwoordt de main thread direct
  (vroeger: 30s-timeout op élke call), resultaat landt netjes, cancel laat het ontwerp intact.
  **Parallelle scan + fijnmazige voortgang (Sanders "alive gevoel", jul 2026)**: de
  crossover-kandidaten draaien CONCURRENT over een worker-POOL (max 4, cores−1; client
  orkestreert per 'chainOne'-request, rescue-semantiek behouden: vrije keten eerst, follow-ups
  parallel) — bit-identieke uitslag, gemeten ~3× sneller (3m47 vs ~10+ min sequentieel).
  `runDesignChain` kreeg een `onProgress`-callback (per design-ronde + stage-switches) en
  `optimizeNetworkValues` een `onStage` (value tune/prune/escalation/drift check/shrink
  ladder/snap) — callbacks worden WORKER-ZIJDIG geïnjecteerd (functies kunnen niet door
  postMessage; nooit in de payload). De busy-kaart rendert de scan als VAST TABELLETJE
  (rij per kandidaat met live stage, ✓+cijfers bij klaar) + totalenregel
  ("1/3 done · 378.287 sims · best 1.14 dB/6.6° · 1:12" met tikkende klok) op een kaart met
  VASTE breedte — één groeiende zin liet de popup van maat veranderen (Sanders klacht).
  GPU bewust NIET gedaan: sequentiële simplex-stappen op kleine MNA-matrices passen slecht
  bij WebGPU (transfer-overhead domineert); multi-core via workers was de echte winst

## Status

**Planning leeft in [ROADMAP.md](ROADMAP.md)** (kort/middel/groot + bewust-niet;
Sanders leesvolgorde). Dit Status-blok blijft de engineering-stand van zaken.

Origineel 8-stappenplan: 1-5, 7, 8 klaar + veel extra's (optimizer, synthese, directivity,
fase-conventies, shelves, VituixCAD-import/brug). Sonogram + −6dB-beamwidth zijn af (sonogram.ts).

**Open: stap 6, met Sander (jul 2026) verbreed tot "eigen ontwerpomgeving"** — einddoel: vxp
wordt puur een import-optie, niets hangt er meer van af. Gefaseerd:

1. ~~**N-weg-netwerkfundament**~~ KLAAR (netlistEdit.ts): DCR/ESR-componenten, validatie,
   N-weg-netlijst. Sim-som is nog 2-weg (mid/tweeter-slots) — N-weg-som volgt in fase 4
2. ~~**Grafische node-editor**~~ KLAAR (schematicEdit.ts + SchematicEditor.tsx): drag & drop
   op het schema zelf, live solve, inspector met DCR/ESR, wire-tool, undo, persistentie.
   Kruisvalidatie: geïmporteerde CROSSOVER1 bit-identiek aan het vxp-pad
3. **Componentbibliotheek Jantzen + Mundorf** — FUNDAMENT KLAAR (catalog.ts + inspector-
   suggesties; zie hierboven). Nog open: echte lijstprijzen invoeren (formaat heeft priceEur),
   prijstotaal/BOM onder de editor, en discrete optimalisatie (continue fit → catalogus-keuze
   mét echte DCR/ESR her-gefit; E-reeks-afronding = simpelste geval)
4. **3-weg-UI + driverbibliotheek**: meetbundels (FRD+ZMA+hoeken) per driver, herbruikbaar
   over projecten; optimizer/directivity/integration mee naar N-weg

- `netOptimizer.ts` — **passief-in-de-lus** (´⚙ Optimize components´-knop in netwerkpaneel).
  **TWEE-PAAR (aug 2026, trede 4a)**: `opts.midBranch` {response, adjust} zet het
  3-weg-pad aan — tak-transfers via pickSlotsN (canonieke én echte modelnamen), som via
  combineN, paar-lijst [(low,mid),(mid,high)] met per paar een eigen computeIntegration
  (fase = gemiddelde over beide overlapvensters), xo-penalty en safety-gate per paar,
  textbook-anker = meetkundig gemiddelde van de paar-kruisingen (één paar bit-identiek:
  x^(1/1) ≡ x). midBranch undefined ⇒ 2-weg byte-voor-byte (de volle suite is het bewijs);
  directivity/xoRange zijn 2-weg-vocabulaire en gaan in 3-weg uit; safety-note zegt bij een
  seed die al onder de vloer zit "the seed already sat at X Ω" (eerlijke attributie —
  drie parallelle takken rond de lage overname dippen structureel). App levert de mid via
  opts (structured-cloneable, geen worker-wijziging) + safety.m:
  her-fit de waardes van de niet-vergrendelde R/L/C's van de actieve tab direct tegen de
  gemeten som (ripple+fase, priority-slider, én **directivity-bewust**: angleData +
  directivityWeight + ampTarget als de vfOptimizer); `locked?: boolean` op VxpPart (🔒 in
  label, checkbox in inspector, 🔒/🔓-all in toolbar), vangnet nooit-slechter-dan-start,
  resultaat via commitSchematic (undo). Gemeten: 0,67→0,26 dB / 3,3°→2,0° op Working.
  **Dode-tak-fundamentals (jul 2026, Sanders 0,68 µF-schema; in vfOptimizer én netOptimizer)**:
  (1) "geen akoestische kruising" kost ALTIJD 120 — vroeger alleen bij een gepind
  crossover-punt, en zonder kruising stonden breakup-guard én tweeter-bescherming stilletjes
  op 0 (alle ankers zijn kruising-gebaseerd): drie bewakers tegelijk uit, precies in de
  gedegenereerde stand. (2) vallei-kruising (`xoDipDb`): de som op de kruising mag niet >6 dB
  onder min(max links, max rechts) in [xo/4, xo·4] liggen — TWEEZIJDIG gemeten; hard geleerd
  in twee eerdere snedes: een globale referentie (band-mean of P90) kan een vallei (dood gat,
  beide kanten hoger) niet onderscheiden van een niveau-tráp (hete ongepadde tweeter, één
  kant hoger — dat prijst ripple al) en bouwde zo zelf de barrière die de tuner in het
  gestarvede bekken opsloot. Penalty 0,5·dip²; ook in de staged safe-gates (+1 prune / +2
  escalatie). (3) **Full-band safety-gate (`opts.safety`, App levert full-measurement-grid)**:
  de evaluatieband = de view range = bewuste ontwerp-scope, maar fundamentals zijn
  hele-ontwerp-eigenschappen — op band 300–3200 blies de tuner de serie-cap naar 376 µF met
  de kruising naar 891 Hz (tweeter open richting Fs), volledig onzichtbaar in-band. De poort
  hercheckt kruising/vallei/protectie op het volle meetgrid bij acceptatie; gedegenereerd →
  seed terug + `safetyNote` in de UI ("widen the view range"). Regressietests: vallei-seed
  (0,68 µF) groeit terug >2 µF; smalle-band-run met safety wordt afgewezen met intacte seed.
  NB: het kale crude-testnet zónder pad is een ander geval — daar is starven de enige
  niveauregeling van de 5–10 dB hetere tweeter en bestaat er geen beter waardenbekken; de
  vallei-metric vuurt daar terecht niet (vlak-op-mid-niveau = trap noch vallei).
  **Versterker-vloer (jul 2026, Robbert→Sanders "niet onder de 3 Ω"; `Z_FLOOR_OHM` = 2,5)**:
  systeem-|Zin| onder de vloer is een stille fout (spanningssturing: onzichtbaar in élke
  responsmetriek, alleen de versterker voelt hem — bv. een trap/Zobel-R vlak bij de ingang;
  gemeten: staged-tune op het kale template dreef naar 1,5 Ω). Handhaving UITSLUITEND op
  beslisniveau: `zShortOhm` in de metrics, gates (prune/escalatie/challenge/krimpladder,
  slack +0,1/+0,3), full-grid safety-gate-reden (eigen remedie-tekst i.p.v. "widen the view
  range"), en een REPARATIE-pass vóór de snap (lokaal geseedde barrière-retune à la
  doel-barrière, stijf gewicht 1200 — bij 120 bleef hij op 2,7 steken; detectie én acceptatie
  op eval- ÉN safety-grid, vol-of-niet: deelreparatie bounced toch op de gate; acceptatie =
  targets + tweeter-prot onvoorwaardelijk, en dan strikt-betere fx (kortsluit de dip/leak-
  armen — hard geleerd: repFx 4,8 < 5,7 werd op een +7-leak-arm geweigerd en de gate gooide
  daarna 100% van de tune weg) ÓF de 10%/seed-window mét die armen; anders `ampFloorNote`-
  waarschuwing, UI toont hem naast de snap-notes). **VLOER = 2,5, niet Sanders 3,0 (gemeten)**: een textbook 2e-orde
  LP op de KOAN-mid (zelf 3,66 Ω) dipt bij de knie onvermijdelijk naar ~2,7 Ω — een 3,0-vloer
  keurt élk correct filter op een 4Ω-klasse driver af en de reparatie kan fysica niet "fixen";
  1,5 (gedegenereerd) vs 2,7 (eerlijk) scheidt op 2,5 schoon. Het Impedance-paneel blijft
  strenger informeren (IEC-chips 3,2/6,4). **HARD GELEERD (de anker-les nóg een keer, nu
  gemeten op het pad zelf)**: een fx-term van amper 0,065 op het relevante optimum (2,93 Ω
  net onder de toenmalige vloer) stuurde de deterministische simplex op het notch-testnet een
  6 dB slechter bekken in (8,0 → 14,5 dB rimpel) — élke objective-toevoeging verlegt het
  zoekpad, hoe klein ook; ook "vuurt alleen in gedegenereerd gebied" is niet veilig als de
  grens in normaal gebied ligt. Regressietests: respons-invariante 2 Ω-shunt-R over de ingang
  wordt gerepareerd (>2,3 Ω), gezond netwerk raakt de reparatie-pass nooit aan, en de plain
  tune is bit-identiek aan vóór de feature.
  **Serie-pad-realisme-plafond (jul 2026, Sanders 91 µF-B·C1)**: de tuner parkeerde waardes
  in de HOEKEN van de bouwbaarheidsdoos (91 µF serie-cap ≙ 0,87 Ω bij 2 kHz = draadje-met-
  extra-stappen, vlak onder het 100 µF-plafond; alleen als elco te koop). `SERIES_CEIL`
  (C ≤ 33 µF, L ≤ 8 mH) verstrakt het zachte venster voor SERIE-PAD-elementen (zelfde
  bus-BFS als de snap-doctrine, nu gedeeld via `busPositions`).
  **SCHAALT MEE sinds aug 2026 (Sanders "de CAPS zijn echt heel groot")**: een CONSTANT plafond
  is fout zodra de kruising verschuift, want wat een serie-onderdeel tot "draadje" maakt is zijn
  reactantie t.o.v. de last — en die schaalt met 1/(f·Z). De constanten waren geijkt op een
  2-weg-tweetertak (~2 kHz in ~6 Ω); een 3-weg W-M op 200–400 Hz in een 4 Ω-mid heeft voor
  DEZELFDE elektrische taak legitiem 4–8× meer capaciteit nodig. Blanco toegepast verbiedt
  33 µF precies het onderdeel dat een vakman daar kiest: **Gravesen levert 88 µF (4×22 µF film)
  in de mid-hoogdoorlaat van minstens zeven gepubliceerde 3-wegs**, met de waarde bijna
  evenredig aan zijn W-M-punt (22 µF @900 Hz · 38,6 @700 · 66 @400 · 88–99 @200). Nu
  `seriesCeilFor` = max(constante, multiplier × textbook-magnitude van dít ontwerp), waarbij de
  multipliers (C ×2,488 · L ×16,76) de oude constanten exact reproduceren op die 2 kHz/6 Ω-
  referentie. De constante blijft dus een VLOER onder het plafond: 2-weg-gedrag ongewijzigd
  (de waardepins bewaken dat), alleen een ontwerp dat écht meer nodig heeft krijgt meer. De
  C/L-multipliers verschillen sterk omdat de oude constanten dat deden — een serie-woofer-spoel
  is legitiem veel dichter bij "een draadje" dan een seriecap ooit is; die asymmetrie is bewust
  geërfd i.p.v. weggepoetst. BEWUST alleen de bovenkant:
  een vloer aan de onderkant vecht met het starving-evenwicht dat de dode-tak-fundamentals
  bezitten — hard geleerd: mét vloer werd de prune-bait in het padloze testnet dragend
  (tuner leunde op de keten i.p.v. de cap te starven) en snoeide staged niets meer.
  Shunt-elementen (traps/Zobels) houden de ruime grenzen — grote elco's zijn daar legitiem.
  **Textbook-impedantie-anker: GEPROBEERD en TERUGGEDRAAID (jul 2026)** — belangrijke les. Idee:
  de responsobjective is onderbepaald (C2 33 µF én 15 µF = integratie 100), dus een zachte trek
  naar de textbook-magnitude (L≈R/(2π·fc), C≈1/(2π·fc·R)) zou de "caps kleiner, spoelen groter"-
  afweging automatiseren. In de praktijk maakte het het SLECHTER (Sanders "resultaat is duidelijk
  minder"). Waarom: elke term die je aan de objective toevoegt verstoort het ZOEKPAD, en het
  landschap is multimodaal — het anker liet de tuner in een ánder lokaal minimum landen (gemeten:
  fase 9,9°→12,4° op een sane net), terwijl de eindwaardes niet eens gepenaliseerd waren. Dus het
  vóégde instabiliteit toe i.p.v. weg te nemen. Ook geleerd: op een sane net trekt de
  respons-tune een 33 µF-shunt zélf al naar ~18 µF (W=0) — de "grote cap" was daar geen stabiel
  optimum. Conclusie: naïeve objective-termen voor "realisme/matching" deugen niet; de veilige
  weg is SEEDING — gebouwd als **multi-start tuning**: de waarde-tune draait vanaf twee
  startpunten, (1) de gegeven seed en (2) een variant waarin reactieve GROTE-kant-outliers
  (> ×2,2 boven textbook L≈R/2πfc, C≈1/(2πfc·R); fc = akoestische kruising van de seed, R =
  mediaan |Z| eromheen) op exact textbook worden gezet (`reseedOutliers`); beste getunede fx
  wint, en bij ≤1% fx-gelijke bekkens de goedkopere BOM (`challenge`). Seeding raakt het
  zoekpad bínnen een bekken niet (les hierboven), verkent wél het gematchte bekken, en is
  deterministisch (regressietest: 33 µF-seed → 18,9 µF, ripple zelfs beter, twee runs
  byte-identiek). Kleine-kant-outliers bewust met rust gelaten (hete-tweeter-cap, traps).
  **Cap-KRIMPLADDER (Sanders "laag beginnen en opvoeren", als walk-DOWN gebouwd; op ALLE vrije
  caps)**: na de late drift-catch loopt elke vrije cap — serie-pad eerst (bewezen), dan de
  shunts (Sanders "ook bij C2?") — zijn waarde E12-stap voor E12-stap omlaag (slot gepind, rest
  hertuned per stap; warm gestart vanaf het geconvergeerde optimum — laag kóud starten was weer
  een willekeurig-bekken-risico). Doorlopen zolang de lat gehaald wordt: staged = full-grid
  targets + fundamentals-niet-slechter (targets zijn de knop: strakker doel = eerdere stop);
  anders ≤1% fx per stap / ≤2% cumulatief (desnoei-rem-vorm). Vloer 1 µF, max 6 stappen/slot,
  tijdelijke lock lekt niet naar `tuned`. GEMETEN (volle keten, Positie, vrije xo): B·C1 landt
  VANZELF op 6,8–10 µF (Sanders lockte handmatig 10 µF), en C2 blijft op 33 µF — élke krimpstap
  faalde de guard, want kleinere C2 sloopt de mid-LP: op déze drivers is C2 dus NIET indifferent
  (eerlijke fysica), en zijn kosten zijn een TIER-kwestie (shunt → Positie = budget-elco ~€5, geen
  €132 premium). All-caps gaf 0,32 dB/2,3° / BOM €190. **KOSTEN-POORT PER STAP: GEPROBEERD en
  TERUGGEDRAAID** — een "stap mag de geschatte BOM niet verhogen"-poort backfirede (B·C1 bleef op
  15 µF, slechter én duurder): `estimateCostEur` pakt het dichtstbijzijnde deel ongeacht tier, dus
  de prijs flipt terwijl de continue waarde glijdt en een valse stijging brak de ladder. Les
  (weer): kosten horen op SCHONE beslispunten (de snap, de scan-ranking), niet in een ruizige
  per-stap-poort; de ladder poort dus alléén op kwaliteit. Bijvangst: de ladder REPAREERT ook het
  narrow-band-blow-up-scenario (376 µF-plateau → 1,8 µF, passeert de safety-gate eerlijk; test
  accepteert nu poort-afwijzing óf gerepareerde acceptatie).
  **DRIFT-CATCH (Sanders derde 33 µF-run)**: in de app-flow komt de seed uit de
  textbook-verankerde synthese en heeft dus zelden outliers — de drift naar het grote-cap-
  bekken gebeurt TIJDENS het tunen, en een seed-only-check ziet dat nooit. Daarom wordt ook
  het getunede RESULTAAT ge-challenged (max 2 rondes, stopt zodra een challenge verliest —
  dat bekken is dan echt beter), én — hard gemeten — nóg eens NA de staged-fase vóór de snap:
  de barrier/prune/escalatie-retunes wandelden de waardes wéér het grote bekken in (vroege
  challenge won fx 0,192→0,175, C2 eindigde tóch op 33 µF; met late catch: C2/B·C3 → 27,6 µF
  op de ×2,2-textbookrand, NET 0,35/3,2° → 0,33/2,4° — kleiner én beter). Challenge-regels:
  >1% fx-winst wint altijd; ≤1%-tie → goedkoopste (`estimateCostEur`: dichtstbijzijnd
  catalogusdeel per slot ongeacht afstand — bomFor's 1%-window prijsde mid-tune 3/15 parts
  en vergeleek ruis); staged → targets-gehaald + fundamentals-gates binnen 10% fx-ruimte
  (de prune-doctrine veralgemeend: "goedkoopste realisatie die het doel haalt"). NB: de
  premium-snap kan kleinere niet-E-waardes (27,6 µF) als exacte STACKS realiseren en de BOM
  daarmee verhógen (€606→€718) — dat stuurt de gebruiker met de stapel-toggle/tier-profiel.
  Het serie-pad-PLAFOND blijft wél (het bijt
  alleen extreme outliers als 91 µF en verstoort de normale zoektocht niet). **Reproduceerbaarheid**:
  lib-solvers hebben NUL RNG/wall-clock — deterministisch. De App-Optimize-lus is nu ook
  deterministisch: de 60 s wall-clock cap is eruit, alleen `MAX_ROUNDS` (12) + convergentie (<1%
  winst) sturen de stop (App.tsx). De "buiten de gebaande paden"-instabiliteit is de
  onderbepaaldheid + multimodaliteit zelf; alleen constraints die de normale zoektocht NIET raken
  (de dode-tak-fundamentals, het plafond) verbeteren stabiliteit — een globale objective-nudge niet.
  **Staged mode (`staged`, aan bij ⚙ Staged; trapmethode op het geassembleerde netwerk)**:
  doelen gehaald → DESNOEI-pass (greedy: elk vrij part krijgt twee varianten, `open` =
  shunt-verwijdering en `shorted` = serie-overbrugging — VxpPart kent die semantiek al, de
  objective wijst de onzinnige variant af; goedkoopst-ogende eerst, retune, houden zolang
  doelen + fundamentals overleven; serie-part wordt Wire in de output); doelen NIET gehaald →
  ESCALATIE regel 3: bypass-C-kandidaten over serie-weerstanden (raised loop à la synthese,
  moet doelen halen of ≥3% betalen). Gemeten op Working: 8 van 24 parts gesnoeid, 0,46 dB/4,7°
  binnen doel. Hard geleerd (3×): (1) meets/safe-checks op het VOLLE grid — de gedecimeerde
  fase-metriek wijkt zichtbaar af (79,8° vol vs ~89° gedecimeerd), anders blijft de poort
  dicht; (2) retunes hebben een DOEL-BARRIÈRE nodig (gewicht 120, 8%-marge voor de
  grid-mismatch) — zonder glijdt de gemengde objective wég van het doelpunt (rimpel voorbij
  target inruilen voor fase waar niemand om vroeg); (3) die barrière alléén lokaal geseed
  toepassen — vanaf een koude seed verdrinkt hij het landschap (843 µF-caps achter een
  onhaalbaar doel aan). Safety-gate naast de doelen: protSqDb/leakSqDb mogen niet
  verslechteren (rimpel-binnen-doel mag geen gefrituurde tweeter kopen); de gate is
  STRENG bij desnoeien (+0,5) en mild bij escalatie (+3), en de doel-barrière bevat
  zelf een prot-term (4·excess boven de seed-prot) — hard geleerd: barrière-gewicht 120
  vs beschermings-prijs 0,02 liet de retune rimpel kopen met tweeter-aandrijving en de
  gate wees vervolgens élke legitieme bypass-C af. **Desnoei-rem (Sanders drie
  screenshots)**: verwijderen mag alleen (bijna) gratis — ≤10% objective per stuk, ≤35%
  cumulatief; zonder die rem wandelde de pass de kwaliteit af naar de doelgrens (2,7°→7,8°,
  alles "binnen doel") en werd méér EQ-budget zichtbaar slechter.
  **Puin-veeg (staged, na de structure-moves)**: snoeien laat wees-draden/grounds van
  verwijderde ketens achter — elektrisch dood (eigen ground-net) maar het schema OOGT
  gebroken (Sanders foto, jul 2026). Twee passes op de uitvoer: (1) eiland-veeg — Wire/Ground
  wiens coördinaat-net geen enkel component-terminal raakt gaat weg (union-find zonder
  Ground-fusie: twee apart geaarde ketens zijn niet verbonden); (2) stomp-trim — 2-punts
  draden met een ongedeeld eindpunt worden iteratief vanaf de punt opgegeten (geaarde
  staarten overleven: de ground deelt het punt). Staged mode bezit de schema-netheid:
  veegt óók oud puin van eerdere runs; commitSchematic is undo-baar dus een geveegde
  schets is één Undo terug.
  **Synthese kent ook mid-ladder shunt-LC(R)-traps**: stopband-cut op een LP4-tak
  (f > 1,2×knie, breakup!) wordt een trap tússen de laddersecties (elliptic-steilheid,
  rollen 'notch (shunt trap) @…'). **BOM** onder de editor (`bomFor` in catalog.ts):
  per R/L/C de exacte catalogus-match (1%-log-marge) + prijs-optelsom zodra prijzen bestaan

Overige kandidaten (belangrijkste eerst):
- **Serie-crossover-structuur** in synthese + optimizer-enumeratie (bewust uitgesteld: eigen
  build-pad + vergelijkingsharnas nodig)
- Catalogus afmaken: echte SKU-lijsten + prijzen invoeren, positie-voorkeur in catalog-snap
  (serie-pad premium / shunt budget via rol-info)
- Virtueel↔passief-gat verder dichten: **Fs-vloer voor de HP-knie** (≥ ~2×Fs uit gemeten Z)
  in de vfOptimizer-bounds (xoRange dekt dit handmatig al af)
- ~~Web Worker voor vloeiende optimizer-teller~~ KLAAR (optimWorker/optimClient, incl. Cancel)
- Desnoei-rondelimiet (8) dynamisch maken of dode-keten-opruiming bundelen (een gesnoeide
  notch laat zijn buren voor volgende rondes)
- genormaliseerde hoekcurves, verticale metingen (lobing) als Sander die doet.

Dev-server draait doorgaans al; demo-knop "Load KOAN demo data" laadt alles incl. hoeken + de geprijsde demo-catalogus (guarded: nooit over een eigen import heen).
