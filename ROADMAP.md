# Roadmap — SD Acoustics Crossover Studio

Voertaal: Nederlands (zoals alle projectdocumentatie voor Sander & Stefan).
Volgorde binnen een blok = aanbevolen prioriteit. Inschattingen zijn grof:
**S** = uurtje(s), **M** = dagdeel–dag, **L** = meerdere dagen/gefaseerd.

## Onlangs afgerond (jul–aug 2026, ter referentie)

- **FASE 4 IS DICHT** (aug 2026) — de laatste twee dingen die in 3-weg leeg
  bleven werken nu: de **tab-ghosts** (som via `combineN`, en de fase-ghost is
  dezelfde GESTIKTE actieve-paar-lijn als de live curve, met per tab zijn EIGEN
  overlapvensters — een tab die elders overneemt hoort dat te laten zien) en de
  **target-curves** (de mid krijgt zijn bandpass-doel, gemaskeerd buiten zijn
  eigen meetbereik: een doel voor data die niet bestaat is geen doel). Het
  stikwerk zit nu in één gedeelde `stitchPairPhase` — live en ghost op
  verschillende regels tekenen zou geen vergelijking zijn maar de bekende
  "twee consumenten, twee definities"-val.
- **Legend-keuzes overleven een reload** (aug 2026) — het laatste stuk UI dat
  de alles-is-persistent-regel miste. Opgeslagen als EXPLICIETE keuzes per
  curve, nooit als de resulterende verborgen-set: een `defaultOff`-curve die je
  nooit hebt aangeraakt blijft zijn default volgen, zodat een latere wijziging
  van die default iedereen nog bereikt. (Het oude punt "tab-ghosts onder één
  groepstoggle" is vervallen: de `+N more`-vouw en de "Compare tabs"-schakelaar
  doen dat werk al.)
- **DE ONTWERPERS-SEQUENCE** (aug 2026, Sanders "mijn gevoel zegt dat de huidige
  sequence niet klopt") — de grootste ingreep van de zomer, en geen feature maar
  een VOLGORDE. De engine liet de SOM de STRUCTUUR sturen; elke bewaker die we
  eromheen bouwden (kandidaat-kooien, adaptieve xo-gewichten, pin-reparatie, de
  lek-term die de ontwerpstap moest leren) was een symptoom daarvan. Drie
  omkeringen rechtgezet: (1) **niveau vóór kruispunt** — de scan-ankers lezen
  niveau-gematchte responsies, dus een hete tweeter sleept de kandidaten niet
  meer naar een kruising die de gepadde luidspreker nooit krijgt (test:
  ankers zijn niveau-invariant); (2) **de geleverde overname wordt beoordeeld** —
  kruising én overlapbreedte tegen de pin (belofte) of het gemeten venster
  (fysica), als ranking-klasse tussen de Z-vloer en de targets; (3) **de tuner
  aan de leiband** — elke tak binnen ±3 dB van zijn ontwerpdoel, exact 0 kosten
  erbinnen. GEMETEN op Robberts 3-weg: paar-fase 30,9° → 9,6°/8,7°, overlap
  3,2 → 1,6 oct, kruisingen binnen venster, 25–29 parts (10 prijsloos) → 18,
  alle geprijsd; kost ~0,4 dB on-axis — de ruil van de ontwerper zelf.
  **Geport naar 2-weg** (A/B op de KOAN-keten, beter op élke as: piek
  1,06 → 0,88 · avg 0,59 → 0,31 · fase 9,7° → 3,6° · 19 → 16 parts, en de
  kruising liep niet meer een halve octaaf weg) en solo waar van toepassing.
- **Versterkerslast van begin tot eind** (aug 2026) — `zOk` was RELATIEF (de tune
  had de dip niet erger gemaakt), dus een ontwerp waarvan de seed al onder de
  vloer zat passeerde élke poort: gemeten winnaar op **0,5 Ω** met alles groen.
  Nu: het absolute minimum wordt gerapporteerd, als klasse gerangschikt,
  verdedigd door een strikte reparatie in de ketens (`zFloorStrict` — de seed is
  onze eigen synthese, dus de seed-relatieve lat was betekenisloos) en niet meer
  teruggegeven door de catalogus-snap. Uitkomst: 0,5 → 2,6–3,0 Ω eerlijk.
  Bijbehorende les: de leiband WIJKT voor de reparatie — twee bewakers die
  elkaar tegenwerkten lieten anders negen kandidaten als rauwe seeds terugkomen.
- **Onderdelen die je kunt bestellen** (aug 2026) — echte SKU's verslaan
  gegenereerde roosters zodra ze de waarde dekken (10 van 25 BOM-regels waren
  prijsloos én onbestelbaar: fictieve E24-waardes die als GRATIS lazen voor de
  kostenterm), en tier-voorkeur geldt niet meer voor SPOELEN — DCR is een
  positie-eigenschap, geen tier, en het Positie-profiel zette €319-folie waar
  een P-core van €11 met 0,2 Ω meer DCR hetzelfde doet.
- **Lobing-strengheid uit de geometrie** (aug 2026, Sanders "de engine ziet toch
  dat de woofers naast elkaar liggen?") — `lobingKFor`: horizontaal gescheiden
  drivers loberen ÓVER de bank (streng, k 0,5), verticaal gestapelde naar
  vloer/plafond (Dickason k 1,0), gemengd interpoleert; stand `auto` is default
  en toont wat hij per paar oploste. Op Sanders center: het wooferpaar houdt zijn
  490 Hz-plafond, de mid/tweeter gaat 2450 → ~4900 Hz.
- **Gemeten fysica-venster voor de 2-weg-scan** (`physWin2`) — hiermee is het
  oude roadmap-punt "Fs-vloer in de vfOptimizer-bounds" afgerond én uitgebreid:
  vloer = max(2×Fs, reach, excursie), plafond = min(gemeten bundeling, lobing,
  array-afstand, breakup/N). Begrenst de vrije scan én oordeelt over de
  geleverde kruising; een DEGENERATIEF venster oordeelt niet en meldt zich luid
  (Sanders ka-2-run gaf anders negen valse waarschuwingen).
- **Piek-bewuste amplitudeterm in de 3-weg-ontwerpstap** — het EQ-budget van 2
  naar 4 veranderde eerst LETTERLIJK niets (byte-identiek), want std merkt een
  3 dB-lift nauwelijks en geen band verdiende zijn 1%. Zelfde metgezel als de
  solo-engine al had; over het hele kandidatenveld: piek 3,57 → 3,20 dB,
  fase 20,0 → 17,8°.
- **Bouwtolerantie-band werkt in 3-weg** — juist het ontwerp met de meeste
  onderdelen kon de bouwbaarheidsvraag niet gesteld krijgen. Gemeten: ±5% →
  worst ±1,67 / RSS ±0,76 dB, en de drie gevoeligste slots zijn alle drie spoelen.
- **De snoei kijkt nu vóór hij opgeeft** — hij testte drie verwijderingen per
  ronde en stopte zodra die faalden, waardoor dode onderdelen structureel bleven
  staan (een 6,8 mH-spoel = 186 Ω op de kruising, in een tweetertak). Nu acht per
  ronde en rondes die meeschalen; alle acceptatie-remmen ongewijzigd.
- **Single-driver mode**: één FRD+ZMA volstaat — sim draait op de solo-tak,
  twee-driver-UI verbergt/blokkeert zichzelf. Voor de FRS8-validatiemeting
  (VALIDATIE.md) én de eerste trede richting fase 4 (N-weg)
- **Solo-optimizers** (soloOptimizer.ts + netOptimizer `solo`): "Optimize —
  flatten driver" ontwerpt cut-only EQ/shelves en bouwt de échte
  breedbander-topologie (serie-LCR-traps, shelf-groepen, gated Zobel);
  ⚙ Optimize components tuned solo op pure vlakheid. Architectuur:
  gedeelde kern + eigen structuur-zoeker per topologie — de mal voor 3-weg
- Versleepbare paneelscheiding (grafieken ↔ invoer, dubbelklik = auto)
- **Response flatness**-score (hele-bereik, mediaan-referentie, geijkt op
  ontwerpersoordeel) + integration naar de achtergrond
- Crossover-scan-ranking oordeelt op hele-bereik-avg (piek = targets-garantie);
  avg-kolom in de scan-tabel
- Stappenkaart-overlay voor ⚙ Optimize components (à la de scan)
- Per-driver-totaalfases in de fase-chart (Stefans samenvallen-bij-0°-check),
  legend-defaults: totals aan, filterfases uit
- Impedantie-**fase**-chart + belastingskarakter op Z-min (capacitief/inductief)
- Voor/na-tabel ("N value changes") na elke tune-run
- **Bouwtolerantie-band** ±2/5/10% met worst-case/RSS en gevoeligheidsranking
- Setup-tab: vxp-variantsectie verborgen zonder varianten
- **LIMP .lim-import** (aug 2026): ARTA's binaire impedantieformaat direct
  inladen — formaat reverse-engineered en gevalideerd met fysica (woofer ∥
  tweeter parallel-meting klopt op ~0,1 Ω met de berekende combinatie).
  Conversie naar ZMA-tekst op de importgrens, dus persistentie en
  VituixCAD-export werken ongewijzigd; de omweg via VituixCAD is weg
- **Import-sanity op inhoud** (aug 2026): niveauprofiel-check bij het laden —
  een impedantiebestand dat als responsie binnenkomt (of andersom) krijgt een
  luide waarschuwing i.p.v. stil ohms-in-de-dB-kolom. Signaleren, niet
  omschakelen; getest op de KOAN-fixtures beide kanten op
- **Model-vs-meting-overlay** (aug 2026, `verification.ts`): de VALIDATIE.md-lus
  als feature — gemeten FRD van de gebouwde build over de gesimuleerde Combined,
  niveau-uitgelijnd (offset zichtbaar), Δ-cijfers (avg/P95/worst @ f) in de
  SPL-strip; fase: mic-delay weggefit, residu-curve in de fase-chart,
  polariteit-flag bij offset ~180°. Alles op het ZICHTBARE bereik, dus overlay
  en strip oordelen over dezelfde band. Persistent in project + autosave.
  Plus **🔬 Compare wizard** (Import-tab): dezelfde lus als begeleide
  checklist — vier stappen die live app-state lezen, meting laden kan ín de
  wizard, verdict met de cijfers als slotstap
- **Near-field laag-eind-merge** (aug 2026, `nearField.ts`): het gat dat het
  meetonderzoek aanwees. Binnenshuis is een gepoorte meting pas eerlijk boven
  200–290 Hz en een 3-weg kruist woofer-mid daar net boven; de merge haalt het
  laag uit een nabij-veldmeting (conus + optioneel poort, complex gesommeerd),
  schaalt met a/2r, fit niveau EN pure delay over de blend, en crossfade
  complex. Ook: de gate-limiet volgt nu uit de vloerreflectie, dus de app zegt
  zelf tot welke frequentie je meting draagt en biedt aan f min daarop te zetten.
- **Cabinet & drivers-invoer** (aug 2026, `cabinet.ts` + Setup-tab): driverposities,
  meetafstand, baffle, kasttype per driver, Sd/Xmax en luisterpositie. Regel:
  een veld mag er alleen in als het een getal verandert dat de app toont, en
  het voedt vensters/waarschuwingen — nooit de meetdata. Grootste opbrengst:
  de app rekent uit welke hoek een meting ECHT heeft vastgelegd (Sanders woofer
  bleek 37°→46° te dekken in plaats van 0°→30°) en meldt of de meetafstand
  überhaupt ver-veld was.
- **Driver-limieten uit de meting** (aug 2026, `driverLimits.ts`): waar een driver
  ophoudt, volgt nu uit de data i.p.v. uit een vuistregel. Breakup → kruis op
  f_b/3 (harmonische afbeelding, door Purifi gemeten); bundeling geijkt op ka
  in plaats van op smaak (onze oude 4 dB bleek ka≈3,5 — veel te ruim; de
  industriegrens ka=2 is 1,11 dB); hart-op-hart-afstand als gratis geometrisch
  plafond (dé reden dat 3-wegs op 200–500 Hz kruisen); de IEC-norm voor de
  bruikbare band; en een niveau-bewuste excursievloer uit Sd+Xmax. De ⚙-uitlezing
  noemt WELK criterium bindt.
- **Grote caps: het was geen fout** (aug 2026) — onderzoek naar Gravesens
  gepubliceerde 3-wegs laat zien dat 88–99 µF in een mid-hoogdoorlaat normale
  praktijk is bij een laag W-M-punt, gebouwd als 4×22 µF film. Daarop aangepast:
  het serie-plafond schaalt mee met 1/(f·Z) i.p.v. blanco 33 µF, en de catalogus
  kan uniforme banken benoemen. Bijvangst: de synthese seedde élk alignment op
  Q=1 (2× te grote caps voor Linkwitz-Riley) — nu meegenomen als extra startpunt.
- **Analytische gradiënten in de synthese** (aug 2026, `adjoint.ts` + `lbfgs.ts`):
  de tak-fit zoekt niet langer op de tast. De adjoint-methode levert de exacte
  afgeleide van de respons naar élke componentwaarde voor de prijs van één
  extra driehoeks-solve (i.p.v. een her-solve per component), en L-BFGS gebruikt
  die kromming direct. Gemeten: **3,4× sneller** op acht echte KOAN-taken, fit
  identiek op vijf en beter op drie; nul regressies in de suite. Kwam uit
  Sanders vraag of machine learning de optimizer kan verbeteren — het antwoord
  was "niet in de objective, en hier ligt eerst een exacte methode klaar"

## Kort — kleine, afgebakende verbeteringen

1. **Undo voor de Filters-tab** (M) — de schematic-editor heeft undo/redo, de
   virtuele filters niet; een misklik op een chart-handle is onherstelbaar.
2. **EPDR-curve** in het Impedance-paneel (S/M) — |Z| en fase gecombineerd tot
   "equivalent peak dissipation resistance": zo zwaar voelt de belasting écht.
   Verfijning van de nieuwe fase-chart.

## Middel — meer werk, duidelijke winst

3. **BOUWEN EN METEN — de lus sluiten** (M, en het belangrijkste open punt) —
   alles hierboven is een getrouwe simulatie van de meetdata; of de kéten klopt
   weten we pas als een gebouwd filter over zijn simulatie ligt. Het gereedschap
   staat er (verificatie-slot + 🔬 Compare wizard) en is nog nooit op een echte
   build gebruikt. Loopt het residu binnen ~1 dB, dan is elk getal in deze app
   verdiend; wijkt het af, dan wéét je dat het aan de meetopstelling ligt en niet
   aan het filter. Zolang dit open staat, is elke verdere optimizer-verfijning
   sleutelen aan de verkeerde kant van het probleem.
4. **Dood gewicht fysisch herkennen** (M — gebouwd, gemeten, TERUGGEDRAAID)
   — een tak kan onderdelen dragen die elektrisch niet bestaan (een 6,8 mH
   shunt-spoel = 186 Ω op de kruising; twee valstrikken op 232 en 411 Hz in een
   TWEETER-tak). Een veeg op "verwijderen kost <0,5% van de objective" maakte
   het geleverde filter meetbaar SLECHTER (piek 2,22 → 3,20 dB), en de
   nooit-slechter-controle vuurde nooit — het verlies ontstond STROOMAFWAARTS,
   in de amp-reparatie en de catalogus-snap, die op een netwerk met één
   onderdeel minder anders landen. Volledig teruggedraaid. Het criterium moet
   FYSISCH zijn: de impedantie van dít element tegen de tak waarin het zit, over
   de band waar die tak werkelijk bijdraagt — een onderdeel dat écht inert is
   kan de stroomafwaartse stappen niet verplaatsen en heeft dus geen terugdraai
   nodig. Zie CLAUDE.md voor de volledige meting.
5. **Catalogus-onderhoud** (doorlopend) — nieuwe Gemini/SKU-updates blijven
   importeerbaar; prijzen periodiek herijken op echte NL/EU-ankers (zie de
   prijsverificatie-ronde in CLAUDE.md).
6. **Gradiënt-warmstart voor de componenttuner** (M/L) — het vervolg op
   `adjoint.ts`. De synthese draait nu op exacte gradiënten; `netOptimizer.tune`
   nog niet, en dáár zit de meeste rekentijd van een scan (een 3-weg-net draagt
   16–25 vrije waardes). Kan niet één-op-één: zijn objective bevat termen die
   NIET differentieerbaar zijn — de akoestische kruising is een trapfunctie van
   de componentwaardes (in aug 2026 gemeten toen de stijve pin-barrière geen
   gradiënt bleek te hebben), en de overlap-maskers van computeIntegration
   springen. De veilige vorm is dus een HYBRIDE: L-BFGS op het gladde deel
   (tak-vlakheid + fase) als warme start, daarna de bestaande Nelder-Mead met
   de VOLLE objective — puur seeding, het enige mechanisme dat hier
   herhaaldelijk veilig is gebleken. De anker-les blijft leidend: de objective
   zelf blijft af.
7. **Run-logboek als dataset** (S, dan doorlopend) — elke optimizer-run
    produceert al (instellingen → resultaat); die paren wegschrijven kost bijna
    niets en levert over maanden de enige data waarmee je een voorspellend model
    voor kandidaat-snoei kunt BEOORDELEN in plaats van hopen. Eerst meten, dan
    bouwen — precies de werkwijze die deze zomer drie hypotheses afschoot.

## Groot — de fases

8. **Fase 4: 3-weg / N-weg** (L) — het netlist-fundament is N-weg-klaar en de
   template-kiezer heeft de (disabled) 3-weg-optie al.
   **Trede 1 KLAAR (aug 2026): de som-kern is N-weg** — `combineN` in dsp.ts,
   per-tak adjust, `combine` als dunne wrapper erover; K=2 bit-identiek
   bewezen tegen een bevroren kopie van het oude algoritme én via de volle
   suite (381 tests) door de nieuwe kern, looptijd ongewijzigd.
   **Trede 2a KLAAR: slot-laag N-weg** — `pickSlotsN`/`isMidModel` in
   driverSlots.ts: 2 drivers = exact het oude gedrag (KOANs lage driver héét
   "mid" en blijft de LAGE tak — gepind in een test), 3 drivers = tweeter en
   mid op naam, en bij niet te scheiden namen WEIGERT de mapping met een
   melding i.p.v. te raden (een mid die als woofer meetelt is precies de
   stille fout waar deze codebase tegen bestaat).
   **Trede 2b KLAAR (aug 2026): de sleutel-knoop opgelost + mid-slot door de
   App.** De knoop was namespace-vervuiling: 'mid' was tegelijk MODEL-naam
   (van de gebruiker/het bestand — KOANs lage driver héét mid) en
   OPSLAG-sleutel (van ons, 2-weg-historie). Oplossing: **opslag spreekt
   ROLLEN** (`BranchRole` low/mid/high; zStandalone + projectformaat v2
   `zByRole`), **netlijsten houden vrije model-namen**, en de brug is
   `pickSlotsN` (`canonicalModelForRole` = dé ene plek waar "de lage tak
   heet historisch 'mid'" leeft; `withSlotAliasesN` = de alias-laag, 2-weg
   test-gepind identiek). v1-bestanden migreren bij LEZEN ('mid'→low,
   'tweeter'→high — nooit een vxp's model-namen-record); niets wordt ooit
   herschreven. App: derde import-slot (Midrange), sim via combineN zodra
   álle drie responsies geladen zijn (anders luide banner + mid buiten de
   sleutelruimte — géén stille verschuiving onder een lopend 2-weg-ontwerp),
   mid-filterkaart (hp+lp = bandpass), mid-adjust, amber `--viz-mid`-curves,
   fase-chart met de twee AANGRENZENDE paren, SPL-handles op de mid.
   Optimizers/synthese/vxp-export/integratie-score zijn in 3-weg GEGATE met
   uitleg (paar-eigenschappen — trede 4); 2-weg/solo-paden bit-onaangeroerd
   (volle suite + browser-check op Sanders v1-autosave).
   **Trede 4a KLAAR (aug 2026): de componenttuner is twee-paar.** `netOptimizer`
   kreeg `opts.midBranch`: tak-transfers via pickSlotsN, som via combineN,
   paar-lijst [(low,mid),(mid,high)], fase per paar gemiddeld, álle beslispunten
   paar-bewust (xo-penalty per paar, safety-gate op beide kruisingen, textbook-
   anker = meetkundig gemiddelde). 2-weg byte-onaangeroerd (midBranch undefined;
   volle suite 402 = bewijs). ⚙ Optimize components werkt dus in 3-weg.
   GEMETEN op Robberts set: de amp-vloer-gate vuurt eerlijk (generieke seeds
   dippen daar zelf al ~2 Ω — drie parallelle takken rond de lage overname) en
   de 640 Hz-gridvloer knelt.
   **Trede 4b KLAAR (aug 2026): per-tak-banden + per-paar-scores.** In 3-weg
   spant het sim-grid de UNIE van de meetbereiken (2-weg houdt de historische
   doorsnede — bit-compat); een tak buiten zijn eigen meetbereik is de stille
   ghost (eerlijke vloer: de som draagt alleen echte bijdragen, en de
   drive-bescherming bewaakt de tweeter dáár elektrisch). Charts maskeren
   stilte naar gaps; tak-syntheses fitten op hun eigen sub-grid (arrays
   NaN-gepad voor de SynthChart; rawSpl clampt in 3-weg — de slicing snijdt
   de geclampte punten weg). `pairScores` in de App: per aangrenzend paar
   integration + phaseStats — topbar "Overlap laag/hoog", SPL-strip
   "W-M/M-T score · Hz", fasepaneel per-paar-flatness, paar-markers in de
   fase-chart. GEMETEN op Robbert: de 400 Hz-overname is nu ontwerpbaar
   (build W-M 531 Hz — vóór 4b onzichtbaar achter de 640 Hz-gridvloer).
   Eerlijke bevinding: de tuner-Z-vloer bijt daar structureel (tune dreef
   naar 1,6 Ω, reparatie haalde de vloer niet — twee 4 Ω-klasse drivers
   parallel kunnen fysiek ~2,4 Ω halen) — Z als ontwerprandvoorwaarde is
   trede-4c-werk. Nog open in 4b-staart: pairwise timing-check (verdicts per
   aangrenzend paar met eigen fitband — de huidige w-t-check op 500–5000 Hz
   zegt op Robberts set eerlijk "cannot judge").
   **Trede 4c KLAAR (aug 2026, staged v1): de 3-weg-ontwerpketen.**
   `threeWayChain.ts`: per (laag, hoog)-kandidaat een TEXTBOOK-doelontwerp
   (LR4-knieën + niveau-trims uit de gemeten tak-medianen, cut-only) →
   tak-synthese op elke taks eigen alive-subgrid → assembled TWEE-PAAR-tune;
   `crossover3Variants` = 2×2-rooster rond de rauwe paar-kruisingen;
   `rankChain3Results` gate't EERST op het versterker-verdict (zOk), dan
   targets, dan de 2-weg-blend, tie → goedkoopste BOM. Bewust v1 zonder
   vf-EQ-enumeratie (de acoustic-synthese draagt de gegate correcties al;
   de note zegt "staged v1"). Worker 'chain3One' + pool-scan in de client;
   App: Optimize — design for me werkt in 3-weg, wizard loopt door (zonder
   Crossover-stap, à la solo), winnaar landt compleet in Working.
   GEMETEN op Robberts echte set: winnaar 411/2520 Hz → avg 0,79 dB /
   peak 1,66 dB / fase 9,7°, Response 77, beide paren integratie-score 99,
   Fase P95 27° — terwijl 767 Hz-kandidaten 9–14 dB scoren (de scan
   onderscheidt echt; de woofer-breakup wreekt zich daar). Determinisme
   test-gepind. Nog open (4-staart): pairwise timing-verdicts, xo-pin per
   paar in de UI, scan-keuzetabel voor 3-weg, per-tak-EQ-enumeratie in de
   keten, directivity/tolerantie/tab-ghosts in 3-weg, vxp-export 3-weg
   (trede 5).

   **Trede 4d KLAAR (aug 2026, Sanders "we moeten voor het beste resultaat
   gaan"): de twee gaten in 4c gedicht.** (a) `threeWayDesign.ts` — een echte
   STRUCTUUR-ZOEKER: alignment(laag) × alignment(hoog) × mid-polariteit ×
   tweeter-polariteit (64 structuren) op pure filtermath, daarna de basisknoppen
   van de beste 4 verfijnd. v1 gokte hier vaste LR4 + polariteit-zoals-geladen,
   en dat zijn juist de twee dingen die de componenttuner NOOIT kan repareren
   (vaste topologie, vaste polariteit) — de 2-weg-uitvlucht "EQ wast het weg"
   bestaat hier niet, want de 3-weg-keten heeft geen EQ-trede. Gemeten spreiding
   over de 64: combined-std 1,39 → 6,52 dB. (b) blok-coördinaat-verfijning in de
   assembled tune (de tak-synthese doet dit al boven 9 dims; een 3-weg-netwerk
   draagt er 16–25) — zoekdiepte op dezelfde volle objective, gegate op 3-weg.
   **A/B over de hele keten op Robberts set (411/2520):** piek-rimpel
   5,13 → 1,58 dB, avgDev 1,055 → 0,628 dB, fase 10,5 → 6,6°, slechtste paar
   11,9 → 7,0°. Kost runtime; dat is de bewuste ruil. Bindende alignment per
   kruising nu via twee ⚙-dropdowns (de bestaande "HP/LP preference" was in
   3-weg zichtbaar maar werd genegeerd).
   **Trede 3 KLAAR (aug 2026): de bandpass-tak.** De synthese kón het al —
   `deriveTopology` cascadeert de HP-ladder in de LP-ladder zodra beide knieën
   enabled zijn; nu bewezen op de gemeten KOAN-mid (regressietest; ~2 dB rms
   is daar eerlijk: de Z-piek op 388 Hz ligt ín de 600 Hz-overgang, de Fs-trap
   is tuner-werk). 3-weg-TEMPLATES staan aan (1e–4e orde, LP / bandpass / HP
   op neutrale 600/3000 Hz-referenties, mid = 2×orde onderdelen; modellen via
   pickSlotsN geresolved — zModels-laadvolgorde is niet te vertrouwen) en
   **"Build passive filter" werkt in 3-weg**: drie tak-fits landen als één
   netwerk in een Passive build-tab, met een eerlijke note dat de assembled
   tune (paar-oordeel) nog volgt. Wizard/help-teksten mee.
   **Trede 4-staart AFGEROND (aug 2026)**: pairwise timing-verdicts op
   EXCESS-fase (de oude w-t-check zei op Robberts set "unreliable" — vals
   alarm van de check, niet van de meting: op excess-fase geeft dezelfde mid
   −21 µs met R²=1,000 in élke subband), xo-pins en akoestische flanken PER
   PAAR, de scan-keuzetabel in 3-weg, per-tak-EQ in de ontwerpstap,
   directivity + sonogram, en de bouwtolerantie-band. Daar bovenop de
   ontwerpers-sequence (zie "Onlangs afgerond") en de Z-vloer end-to-end.
   **Trede 5 KLAAR (aug 2026)**: vxp-export in 3-weg — model → ROL via
   `pickSlotsN` (dezelfde mapping als de solver, dus een mid kan niet als
   woofer exporteren mét de verkeerde responsie, hoekset én delay), en de
   excess-delay-normalisatie loopt over álle geladen drivers. Een 3-weg-ontwerp
   kan dus naar Stefan.
   **FASE 4 IS HIERMEE DICHT** (aug 2026): tab-ghosts en target-curves waren de
   laatste twee 2-weg-gates en zijn opgeheven. Alles wat een 2-weg-ontwerp kan,
   kan een 3-weg-ontwerp nu ook.
9. **Driverbibliotheek** (L) — meetbundels (FRD + hoeken + ZMA) per driver,
    herbruikbaar over projecten; het einde van losse-bestanden-slepen.
    Uitbreiding daarbovenop: **ontwerpgeheugen als seed-bibliotheek** —
    afgeronde ontwerpen bewaren mét driver-kenmerken (Fs, Z-profiel,
    kruisingsgebied) en bij een nieuw ontwerp het meest gelijkende als éxtra
    startpunt meegeven naast de textbook-seed. Retrieval, geen training:
    deterministisch en uitlegbaar — zelfde patroon als de multi-start-tuner
    (seeding verkent bekkens zonder het zoekpad te verstoren, de anker-les).
10. **Serie-crossover-topologie** (L) — eigen build-pad + vergelijkingsharnas
    naast de parallelle synthese (bewust uitgesteld tot dat harnas er is).
11. **Genormaliseerde hoekcurves & verticale metingen** (M, wacht op data) —
    zodra Sander verticaal meet: lobing-analyse naast de horizontale
    directivity.
12. **Meetmodule in de app** (L) — sweep + deconvolutie kan met Web Audio, en
    fft.ts/timeDomain.ts doen de wiskunde al. Twee harde voorwaarden vóórdat
    dit iets waard is:
    (a) **Gekalibreerde meetmicrofoon mét cal-bestand.** Geverifieerd op de
    MM-1-bestanden (JustOct `.mic`): `parseFrd` leest ze ongewijzigd — 134
    punten, 10 Hz–21 kHz, 0 dB op 1 kHz, header netjes bij de comments. Maar:
    de **fasekolom is leeg** (mic-fase blijft dus een minimum-fase-aanname),
    het bestand is **Latin-1** en niet UTF-8, en 0° vs 90° scheelt tot **6 dB
    in de topoctaaf** — de app moet vragen onder welke hoek is gemeten, niet
    zelf kiezen. Zelfde stille-fout-familie als de import-sanity-check.
    (b) **Eén klokdomein met loopback-kanaal.** Browserlatency is niet
    deterministisch; zonder gedeeld tijdnul is het inter-driver-tijdverschil —
    het kernidee van deze tool, 47 µs ≈ 16 mm — verzonnen. Een USB-meetmic is
    daarmee de verkeerde route (eigen klok, geen elektrische loopback); XLR in
    een 2-in/2-uit-interface wel.
    Realistische eerste stap is niet REW namaken maar de VALIDATIE.md-lus
    sluiten: een verificatie-sweep die de meting als extra curve over de
    simulatie van de actieve tab legt. Relatieve respons volstaat daarvoor —
    absolute dB heb je niet nodig om te zien of het model klopt. Impedantie
    meten vraagt een sense-resistor-jig: hardware, geen software.
13. **ARTA .pir-import met gating-UI** (M/L, future — wacht op voorbeeldpaar)
    — de ruwe impulsrespons vóór ARTA's gate/FFT-stap; feitelijk de
    ANALYSE-helft van de meetmodule (punt 12), los te bouwen. Geen tweede
    .lim: een .pir → FRD vraagt een GATE-keuze (venster vóór de eerste
    reflectie) die Robbert nu bewust in ARTA maakt — automatisch gaten met
    een vaste waarde bakt stil een meetkeuze in (zelfde stille-fout-familie
    als de import-sanity-check). Dus: parser (S) + gate+FFT→FRD op fft.ts (M) + gating-UI met
    sleepbaar venster en zichtbare reflecties (M, het meeste werk). Harde
    invariant: de gate mag de TIJDAS NIET HERNULLEN — per bestand een eigen
    t=0 gooit het inter-driver-tijdverschil weg (Robberts set: Δ105 µs ≈
    36 mm, gemeten, verdict plausible) en dat is het fundament van de tool;
    regressietest verplicht. Winst = export-klikken besparen (2 drivers ×
    8 hoeken), geen blokkade: de FRD-route draagt fase én timing al. Bouwen
    zodra er een validatiepaar ligt (één .pir + de FRD die ARTA daaruit
    exporteerde — zelfde bewijs-aanpak als de .lim-import) of zodra de
    meetmodule (punt 12) actueel wordt.

## Bewust niet

- Onboarding-tour / grote restyling — de app is voor twee ontwerpers, de
  dichtheid is een feature, ❓ Help dekt de uitleg.
- GPU-versnelling van de optimizers — gemeten: workers waren de winst,
  WebGPU past slecht bij sequentiële simplex-stappen (zie CLAUDE.md).
- Kosten of "realisme" als extra term in zoek-objectives — de anker-les:
  alleen op schone beslispunten (ranking, snap), nooit in de zoektocht.
- Lerende/AI-gestuurde optimizer ("steeds gerichter zoeken") — drie gemeten
  argumenten (aug 2026): (1) de dataset is twee ontwerpers en een handvol
  driver-sets groot, daar generaliseert niets van; (2) een geleerd model is
  een PROXY voor de eindmeting, en zelfs de fysisch onderbouwde vf-proxy
  voorspelde de eindranking niet (xo 1900 vf-slechtst → assembled-best; de
  remedie was scannen op de eindmeting, ~3× winst) — een zwakkere proxy
  terugbrengen is die les terugdraaien; (3) er valt niets te besparen:
  ~380k sims in <4 min met volledige dekking van de zoekruimte. Wat WEL mag
  leren: de seeds (ontwerpgeheugen, zie punt 9) en het model (kalibratie
  uit de meet-lus) — retrieval en calibratie, deterministisch, geen training.
