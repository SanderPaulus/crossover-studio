# SD Acoustics - Crossover Studio (v/h Acoustic Design Studio)

Eigen crossover-ontwerptool (React + TypeScript, pure frontend, Vite) voor Sander & Stefan.
Kern-idee: ontwerpen op **gemeten fase** (incl. echt inter-driver tijdverschil) waar VituixCAD
minimum phase reconstrueert. Voertaal met Sander: **Nederlands**; code/comments Engels.

## Commands

- `npm run dev` — dev-server via de Browser-pane tool (`preview_start {name:"dev"}`), poort 5173
- `npx vitest run` — testsuite (312 tests, allemaal groen houden)
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

- `parsers/` — frd/zma/vxp (VituixCAD-project incl. WIRE-topologie via coördinaat-union-find in
  `vxpNetwork.ts`). Fixtures = echte KOAN-metingen in `parsers/fixtures/`. **vxp is volledig
  optioneel**: .zma's kunnen per driver mee in de FRD-file-dialoog (standalone `zStandalone`,
  merged met evt. project-impedanties; keys 'mid'/'tweeter'); solver/synthese/editor draaien op
  de merged map. vxp = alleen nog import van Stefans crossover-varianten.
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
  (complexe som; exporteert ook `combinedPhaseDeg`), `applyTransfer`
- `network.ts` — MNA-solver (complexe admittantie, Norton-bron, gemeten Z als driver-load).
  Elke solve levert ook `inputZ`: de systeem-ingangsimpedantie aan de generatorklemmen
  (excl. Rg) — de versterker-belastingscurve, voedt het Impedance-paneel
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
  Nelder-Mead (`optimize.ts`) in log-ruimte, bouwbaarheids-penalty, modes 'filter' | 'acoustic'
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
  3e-orde = C-L-C, geen ontstemde 4e). **Zoekstrategie**: iteratiebudget 140/slot, deterministische
  restarts, blok-coördinaat-verfijning >9 dims, polish-rondes; `converged` = simplex-collapse
  óf stationariteits-probe (verse brede simplex vindt <3% meer). **Fase↔vlakheid-trade zit in
  de priority-slider en is groot**: zware tweeter-tak p=0,15→0,41 dB/23°, p=0,5→0,9/17°,
  p=0,85→2,1 dB/8° (top −4 dB — "de 119 dB-inzak" is een fasekeuze, geen bug)
- `integration.ts` — score = overlap-gewogen cos(ε/2); klassen op 45/90/120° (fysische ankers)
- `phaseStats.ts` — fase-flatness-score/avg/P95/std over overlapgebied (à la Stefans screenshot)
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
- `directivity.ts` — per-hoek som (zelfde filter elke hoek), energy average, listening window (≤30°), DI
- `sonogram.ts` + `components/Sonogram.tsx` — directivity-sonogram: ±hoeken gespiegeld, discrete
  3 dB-banden (vloer −24 dB, sequentiële blauwe ramp, dark-mode flipt het anker), −6 dB-beamwidth-
  contour, scale genormaliseerd/absoluut (gepersisteerd), canvas-heatmap in SVG-frame
- `minphase.ts` — cepstrum-minimum-phase (fs 768k default; puur voor VituixCAD-vergelijkmodus)
- `timeDomain.ts` + `fft.ts` — EGD (bulk eruit), step response, ETC via IFFT
- `project.ts` — persistentie: raw files + design-state in JSON, versieveld, autosave localStorage
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
  **BOM is stapel-bewust**: geen single-match → 2-delige stack-match (som binnen 1%, met
  prijs) — de netwerk-snap bouwt stapels en de BOM moet ze kunnen benoemen i.p.v.
  "no exact catalog value" (Sanders klacht).
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
  Fase-chart toont ook filter-fase per tak (arg van totale transfer) + ruwe driver-Δφ (dashed)

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
  schematic-editor heeft breedte nodig). Scores boven de charts zijn compacte `.score-strip`s
  (integration + phase flatness) — de grafiek is de hoofdzaak; vrijwel elk control heeft een
  title-tooltip (helpers).
- **Layout-toggle in de topbar** (naast thema, localStorage 'ads-ui-layout'): Auto (volgt
  vensterbreedte, split ≥760 px — het Claude-browserpaneel is ~800 px, vandaar de lage drempel) /
  Split (altijd twee panes, ook smal) / Stacked (altijd de klassieke stapeling, gecentreerd op
  max 920 px). CSS: media query gegate op `:not(.layout-split)`, geforceerd-stacked blok op
  `.layout-stacked`, `#root:has(...)` voor de hoogte.
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

- `netOptimizer.ts` — **passief-in-de-lus** (´⚙ Optimize components´-knop in netwerkpaneel):
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
  bus-BFS als de snap-doctrine, nu gedeeld via `busPositions`). BEWUST alleen de bovenkant:
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
