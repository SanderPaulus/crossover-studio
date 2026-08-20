# Optimizer-overdracht — hoe "Design for me" werkt, gedestilleerd uit de code

Referentie voor een assistent die optimizer-uitkomsten, screenshots en scores moet beoordelen
zonder toegang tot de codebase. Elke bewering draagt `bestand → functie`. Waar code en tooltip/
doc/CLAUDE.md elkaar tegenspreken staat dat als **⚡ tegenspraak**. Waar de code zwijgt: **[NIET IN
CODE GEVONDEN]**. Alle paden zijn `src/lib/…` tenzij anders vermeld; `App.tsx` = `src/App.tsx`.

## 1. Pipeline end-to-end

**Expert-flow "⚙ Optimize components"** (App `runNetOptimize` → worker `netOptimize` →
`netOptimizer.ts → optimizeNetworkValues`): het actieve netwerk (parts) wordt met de gemeten
driver-Z en de gemeten responsies getuned; input = parts + grid + takken + adjust + opts; output =
parts met nieuwe waardes, `before/after`-rapport, `audit`. Geen kandidaat-generatie, geen synthese.

**"Optimize — design for me", 2-weg** (App `runVfOptimize` → `optimClient.runChainScan` →
worker `chainOne` → `designChain.ts → runDesignChain` per kandidaat):
1. Kandidaten (§4) → per kandidaat de KETEN: **vf-rondes** `vfOptimizer.optimizeVirtualFilters`
   (re-seed van de beste, stop < 1 % winst of 12 rondes, `designChain.ts`) → **synthese**
   `synthesis.ts → synthesize` per tak (topologie uit spec, gradiëntfit op adjoint) →
   **netTune** `optimizeNetworkValues` op het geassembleerde netwerk (incl. staged, drift-catch,
   krimpladder, amp-repair, snap, part-audit) → `rankChainResults` (§8).
2. Wat NIET wordt geherevalueerd: de vf-specs (knieën/EQ) worden na de synthese niet meer
   aangepast — de tuner verzet alleen componentwaardes op een vaste topologie. Er is wél een
   INDIRECTE terugkoppeling: de keten geeft per tak het akoestische doel als **bevroren corridor**
   mee (`branchTargets`, ±3 dB doodband, `corridorSq` in `fxOf`), dus de tuner mag de takken niet
   verder van het vf-ontwerp weglopen dan 3 dB; de vf-stap zelf ziet de synthese-fout niet.

**"Design for me", 3-weg** (App `runVfOptimize` 3-weg-pad → `optimClient.runChain3Scan` →
worker `chain3One` → `threeWayChain.ts → runThreeWayChain`): per kandidaat (xoLow, xoHigh)
**structuur-zoeker** `threeWayDesign.ts → designThreeWay` (64 structuren: alignment laag × hoog ×
polariteit mid × tweeter op pure filtermath, NM-verfijning van de knieën in de kooi, EQ-trede
cut-only bij `eqBandsPerBranch > 0`) → tak-synthese op alive-subgrids → twee-paar netTune met
`branchTargets` (corridor) en `xoRangePairs` (kooi) → `rankChain3Results`. Kandidaat-orkestratie
sinds aug 2026: as-voor-as (`scan3Mode 'axes'`, App): W-M-sweep → M-T-sweep → 3×3-verfijning bij
koppeling; of rooster (`crossover3Variants`).
Solo (één driver): `soloOptimizer.ts → runSoloChain` (eigen engine, buiten dit document).

Stopcriteria per fase: vf-rondes < 1 % / max 12 (`designChain.ts` `maxRounds`, `objective < best·0.99`); NM in vf en
design `tolerance 1e-6` met vaste iteratiebudgetten; synthese L-BFGS-convergentie of stationariteit
(< 3 % winst vanaf eindpunt, `synthesis.ts`); tuner: multi-start NM + blokverfijning (3-weg),
staged-poorten (§5), krimpladder tot 6 stappen/slot, snap = discrete coördinaat-descent.

## 2. Doelfuncties, exact

**Grid**: de app-sim loopt op het volle log-grid (`GRID_N`, doorgaans 600 pt, 2-weg doorsnede /
3-weg unie van meetbereiken). Beide optimizers zoeken op een **gedecimeerd** grid:
`step = max(1, floor(n/150))` → ~150 punten (`vfOptimizer.ts` r. 393, `netOptimizer.ts` r. 507);
poorten en rapport op het VOLLE grid (`fullM`, `after`). Band = view-range, default
`[grid[0]·1.02, grid[last]·0.975]`. Geen smoothing in de objective (alle termen op rauwe gridpunten);
alleen `partAudit` smootht 1/6 oct vóór de Δ. **Sinds punt 3 (aug 2026)**: de MAGNITUDES van de
takken (en hoeksets) die de zoektocht ziet worden vóór de decimatie Gaussisch gesmootht in log-f
(`bandMetrics.smoothDbGaussian`, σ = breedte/2; setting `errorSmoothOct` uit / 1/24 / **1/12** / 1/6,
0 = legacy). Fase nooit; poorten/doelen/safety/rapport blijven rauw; `after.ripplePeakSmoothedDb`
naast `rippleDb` (scan-tabel toont smoothed, rauw in tooltip). GEMETEN (synthetisch ±1 dB/1/20-oct):
knieën blijven binnen 2–3 % van het schone geval, maar het aantal evaluaties daalt NIET (7703 → 8449;
de NM-budgetten zijn per stap vast) — de "≥30 % minder iteraties" uit de spec is niet gehaald en
niet geclaimd.

**vfOptimizer** (`vfOptimizer.ts → objValue`, `pw = 0.15 + 0.7·p`, p = prioriteit 0..1):
```
fx = 2(1−pw)·amp + 2pw·[(avgφ/15)² + 0.5·(P95φ/45)²]      (phaseMetric 'band'; 'overlap': alleen 1e term)
     + 0.02·leakSq (breakupGuard) + 0.5·xoDip² + xoPenalty(xo) + slopePen
amp = (1−dW)·std(SPL_som)² + dW·(std(residu EA)² + wF·fold²)   (dW = in-room-gewicht, alleen met hoekdata)
```
`residu EA` = energy average minus zijn 1e-orde trend in (log f, dB) (`bandMetrics.powerShape`,
setting `powerMetric` 'smooth' default; 'legacy' = std van de rauwe EA = vlakheid), `fold` = max
|residu| binnen ×/÷1,6 van de kruising, wF = `powerFoldWeight` 0,5. De HELLING is vrij en wordt
gerapporteerd (dB/dec; > +1 ⇒ waarschuwing, geen term).
`avgφ` = uniform gemiddelde |Δφ| over het overlapvenster (|ΔdB| ≤ 20, `integration.ts`), P95 uit
1°-buckets. `leakSq` = gemiddelde (20 − marge)²⁺ waar de niet-dominante tak in
[xo/4, xo/1.6] ∪ [xo·1.6, xo·4] minder dan 20 dB onder de som zit. `xoDip` = max(0, min(max links,
max rechts) − som(xo) − 6) over [xo/4, xo/1.3]/[xo·1.3, xo·4]. `xoPenalty` = 120 zonder kruising;
mét pin `30·s·oct²`, s = min(100, max(1, (0.15/halve breedte in oct)²)). `slopePen`: per doelflank
d = (|gemeten| − doel)/6 → 2.5d² tekort, 0.4d² steiler. Bounds-overschrijding: +12·Δ² (`optimise`).
Band-acceptatie: nieuwe EQ-band alleen bij fx-winst ≥ `minBandImprovement` = **0.01**
(⚡ tegenspraak: de JSDoc zegt "Default 0.02", de code r. 339 zet 0.01). Full-grid-audit: band weg
als verwijderen < 0.5 % kost op het volle grid (r. 1044). Cut-only altijd aan.

**netOptimizer** (`netOptimizer.ts → fxOf`, `p = 0.15 + 0.7·prioriteit`, `dW` idem):
```
fx = 2(1−p)·amp + 2p·[(φ/15)² + 0.5·(P95/45)²] + 0.02·leakSq + 0.02·protSq + 0.5·xoDip²
     + 2·corridorSq + Σ_paren xoPenalty + (repair: 20·ΣxoEdgeSq) + slopePen
     + Σ_paren 1200·log2(floor/xo)²⁺   (fix 2c: fysische vloer `xoFloorPairs` als STIJVE bound onder de vloer)
     + wDiss·(Rs/Re)²                   (fix 3a: dissipatie vóór de LAAGSTE tak, `dissipationWeight` 0,05; 0 = legacy)
amp = (1−dW)·bandStd² + dW·(powerStd² + wF·fold²)   (bandStd = one-pass std; powerStd = residu-std van de
                                                      gedetrende EA in 'smooth'; solo: fx = 2·amp)
```
`m.powerFoldDb`/`m.powerSlopeDbDec` in de metrics en `after.powerFoldDb`/`after.powerSlopeDbDec` in het
rapport (`netOptimizer.ts → report`). `Rs` = reëel deel van de Thevenin-impedantie vóór de laagste
driver op Fb (of zijn Z-piek), `Re` = reëel deel van zijn Z dáár (`seenImpedance`, één extra
1-punts solve per evaluatie; `after.dissRatio`). HARD GELEERD onderweg: `seenImpedance` kreeg de
VOLLE driverZ-arrays met een 1-punts freqs-lijst en laadde de andere drivers stil met hun Z op
grid[0] — nu `sliceDriverZ` (zelfde bug zat in de audit-R_bron).
`protSq` = gemiddelde (|H_boven| + 15 dB)²⁺ voor f ≤ xo/3 (bovenste tak ≥ 15 dB gedempt);
`corridorSq` = gemiddelde (|tak − doel| − 3 dB)²⁺ tegen de branchTargets van de ontwerpstap
(alleen in de keten). φ = uniform gemiddelde over de overlapvensters van álle paren; poorten oordelen
op de SLECHTSTE pair (`phaseGate`). ZACHT: alles hierboven. HARD (afkap/klasse, niet in fx):
Z-vloer 2.5 Ω (`Z_FLOOR_OHM`, repair-pass + poorten), serie-pad-plafond `seriesCeilFor`
(C ≤ 33 µF·k, L ≤ 8 mH·k, schaalt met textbook-magnitude), bouwbaarheidsdoos `BOUNDS`
(C 0.33–100 µF, L 0.05–15 mH, R 0.22–47 Ω), solo-gevoeligheidscap, DCR-plafond in de snap
(`catalog.dcrCeilingOhms`, 0.5 dB serie / 2 dB shunt).

**threeWayDesign** (`threeWayDesign.ts → evaluate`): `fx = 2(1−pw)·amp + 2pw·φterm + 0.02·leakSq
+ wDI·[log2(xoLow/DI_low)² + log2(xoHigh/DI_high)²]` (punt 2: DI-ankers uit `directivity.diMatchHz`,
`diWeight` default 0,3, alleen mét hoekdata; `diDistanceOct` in het resultaat en in `structureLabel`),
`amp = std² + 0.35·peakExcess²` (positief boven de mediaan), φ = gemiddelde van de twee paren; NM
op (log xoLow, log xoHigh) met +12·penalty buiten de kooi en `xoHigh ≥ 2·xoLow`. GEMETEN op de
KOAN-3-weg-fixture: wDI 0,3 = tiebreak (0,3·log2(2000/2400)² ≈ 0,02 tegen fx ~1; het on-axis-optimum
zit aan de onderrand van het M-T-venster) — de spec-eis "verkiest [2,25k, 2,6k] boven 3,3k bij verder
gelijke fx" geldt bij gelijke fx; bij wDI 30 landt de knie op 2215 Hz. Zonder hoekdata bit-identiek.

## 3. Meegewogen — en niet

**Meegewogen (objective of poort)**: rimpel als std (zoek) / peak ±dB en avg |dev| (rapport,
doelen); fase avg + P95 per paar over het 20 dB-overlapvenster; overlap-octaven alleen gerapporteerd
(`pairOverlapOct`); Zmin: poort/klasse (2.5 Ω) + repair, nooit een term; tweeter-bescherming
(protSq, gewicht 0.02); breakup-lek (0.02, alleen naast de kruising 1.6–4×); vallei (0.5·dip²);
akoestische flanken (opt-in); in-room energy-average (dW, default 0.25 alleen mét hoekdata, óók in
`rankChain3Results` sinds aug 2026); BOM alleen als tiebreak ≤ 5 % (`rankChainResults`,
`rankChain3Results`) en als kostendruk in de snap (`costWeight` 0.0015); excursie/lobing/breakup/fs
alleen in het VENSTER (§4), nooit in fx.
**Sinds aug 2026 óók meegewogen**: DI-afstand in de structuurzoeker (`diWeight`, §2); bron-R aan de
lage driver GETRAPT (fix 1): geel ≥ 0,5 Ω (strip/kolom), KLASSE-verlies ≥ `rSourceLimitOhm` 1,0 Ω
(`rsClass` naast `zClass`), DISKWALIFICATIE ≥ `rSourceDisqualifyOhm` 2,0 Ω (klasse 10: zichtbaar,
doorgestreept, reden in `Chain3Result.disqualified`) — alles op Fb met de gemeten ZMA, gelabeld
"modelschatting buiten meetband"; én als staged-safe-poort (`netOptimizer.ts → rsSafe`: een snoei-/escalatiezet die
R_bron van ≤ grens naar > grens duwt wordt geweigerd; `partAudit.sourceResistanceOhm`); helling van
de EA gerapporteerd (nooit gestuurd); excess-GD van de som op 500/2k/8k en mid-band-octaven (alleen
weergave, App `sumGroupDelay`).
**Fix 3a GEMETEN (harness, 3 kandidaten, dissipatie 0,05 vs 0)**: R_bron per kandidaat 2,85/1,17/0,00
mét term tegen 2,48/1,05/0,00 zonder — ruis, geen effect: (Rs/Re)²·0,05 ≈ 0,01 tegen fx ~12. De
winnaar met R_bron < 1 Ω (514/1849 → 627/1942, peak 1,70) komt uit de HARDE trap van fix 1 (de
2,85 Ω-kandidaat is gediskwalificeerd), niet uit de zachte term. Open: gewicht kalibreren (orde 1–2)
zoals B1. **Fix 3b — niveau-match via filtercomponenten i.p.v. dissipatie: [ONDERZOCHT, NIET GEBOUWD]**. De
tuner heeft geen niveau-route: hij verzet waardes op een vaste topologie en de synthese realiseert
trims als L-pad/serie-R (`synthesis.ts`, rol 'pad'). "Verzwak de luidere tak via haar eigen
filtercomponenten" vraagt een topologie-keuze IN de tune (grotere serie-L / kleinere shunt-C
binnen de flank-doelen, pad als laatste) — dat is een structuurzoeker-feature, geen waarde-tune; met
de dissipatieterm (3a) + de harde R_bron-trap (fix 1) is de prikkel weggehaald, de alternatieve
route niet gebouwd. Feitelijke route nu: trims uit `trimsFor` landen als pads; de tuner mag ze
vrij verzetten en betaalt sinds 3a voor een pad vóór de laagste tak.
**Kosten als ontwerpas (aug 2026, "minimaal netwerk")**: `bomCapEur` (B1, 0 = uit) = KLASSE-verlies
in beide rankers boven het plafond (`rankChain*Results(…, bomCapEur)`), strip toont "BOM €y / cap €x"
en het aantal [NO PRICE]-regels; `costWeight` (snap-druk) blijft een tiebreak in de snap — herijking
zie §8/B2; het Pareto-front (B3, App `paretoY`) laat de gebruiker het knikpunt kiezen.
**NIET meegewogen**: power response in `designThreeWay` behalve via het DI-anker (de EA-term zelf
zit alleen in vf/net/ranking); bronimpedantie is klasse+poort, geen fx-term (bewust); gedrag onder de datavloer/view-range (bewust: band =
ontwerp-scope, alleen de safety-gate kijkt op het volle meetgrid naar fundamentals); breakup buiten
de as (nooit gebouwd); groepsvertraging van de som (nooit gebouwd — alleen weergave); spoel-DCR
als rendementsverlies (alleen via DCR-plafond in de snap); vermogens/thermisch (nooit gebouwd);
verticale lobing (geen verticale metingen; alleen de geometrieregels).

**Niveau-anker — wie wordt naar wie verzwakt** (vraag 0b): passief is cut-only, dus het anker is de
STILSTE tak. 3-weg: `threeWayDesign.ts → trimsFor` — per (xoLow, xoHigh) de mediaan van elke tak
over zijn fysica-gesplitste passband; `floor = min(medianen)`; elke tak krijgt `gainDb = min(0,
floor − eigen mediaan)` (per knie herleid, dus het anker kan per kandidaat een andere tak zijn); de
scan-ankers gebruiken dezelfde regel vooraf (`threeWayChain.ts → crossover3Variants`, "level first").
2-weg: `vfOptimizer.ts` tuned alléén `tweeter.gainDb` (handle `dbP(−24, +6)`, r. 281), woofer vast
op 0 — de woofer is het anker, met tot +6 dB tweeter-BOOST toegestaan in de virtuele fase; bij de
bouw schuift App (`gShift`, r. 5826) alle gains als paar omlaag zodat de luidste op 0 staat en de
synthese alleen verzwakking realiseert. netOptimizer: GEEN niveau-anker — pads en DCR zijn vrije
componentwaardes binnen `BOUNDS`; alleen `partAudit.rSourceWarn` (§5) meldt een serie-R vóór de
lage driver achteraf. Gevolg: een luidere woofertak dan de mid wordt in 3-weg door `trimsFor` gepad
(serie-R in de woofertak; zie Qes-waarschuwing) — dat is de plek waar punt 4 van de vervolgopdracht
ingrijpt.

## 4. Kandidaat-generatie

**Venster per overgang** (`xoWindow.ts → deriveXoWindow`, gevoed door App `physWin3`): doorsnede
van (1) datavloer `2/T_gate` (gate uit FRD-header `gateMsFromHeader`, anders kast-veld; gesplicete
tak: top van het splice-blend `splice·2^(blend/2)`), wint van alles incl. pin; (2) array-lobing
`k·c/d`, k 0.5; (3) hart-op-hart `c/(N·d)`, N 'auto' = per as (verticaal 1, zij-aan-zij 2,
`ctcDivisorFor`); (4) breakup/1.8 (`driverLimits.breakupHz`, lokale ±½-oct-trend); (5) fs in situ
× K (K 2; uit ZMA-piek `App fsFloorFrom`); (6) excursievloer (`excursionFloorHz`, Sd/Xmax/ref-SPL);
+ reach (`bandMetrics.reachesLevelHz`) en gemeten bundeling (`directivity.beamingCeilingHz`, 30°-set,
KA-tier default 4 dB). Botsing → banner + collapse op de vloer (`ceil = floor·1.03`); rails 150–2000 /
1200–12000. Pin = regel 7: vervangt 2–6, niet 1.
**Plaatsing**: rooster `crossover3Variants` (hoeken + log-midden bij steps 3, warme start = huidige
overlap-centra, DI-anker `directivity.diMatchHz` als hij binnen het venster valt); as-voor-as (App
`runAxes`): `candidateCentres` (3/5/7 log-punten), vaste as = pin → DI-anker (in het venster geklemd,
punt 5a) → warm → log-midden, kooi van de vaste as = hele venster (`variantsFromPoints`). Volgorde =
eerst de as met de mid als gedeelde driver stabiliseren (W-M-sweep met M-T op het DI-anker), dan M-T,
dan de 3×3. Punt 5c (vf-fase 3-weg "mid eerst, dan woofer, dan tweeter, dan globaal"): **[NIET ZO
GEÏMPLEMENTEERD]** — `designThreeWay` is een GEZAMENLIJKE enumeratie van 64 structuren + NM op beide
knieën tegelijk; er is geen per-tak-fase. Niet gemeten op 3 referentieprojecten (één set in huis). Kooi = tegel op meetkundige middens; xo-penalty
adaptief (§2). 2-weg: `crossoverVariants` (pin onderverdeeld, 3/5/7/9 slices) of vrije keten +
rescue-followups (`followupVariantsFor` ±12 %).
**Label**: sinds aug 2026 = GEREALISEERDE kruising (`after.xoHzPairs` / `after.xoHz`, App
`deliveredLabel`) met "(aim …)" erachter; **⚠** bij > ⅓ oct afwijking op een bemonsterde as (de
vaste as van een sweep telt niet — behalve voor de WINNAAR, die op beide assen wordt beoordeeld,
punt 5b; `threeWayChain.deliveredLabel`). Vóór die wijziging was het label het slice-CENTRUM — vandaar de
bekende "label 4028 / header 3335"-discrepantie: het label was het doel, de strip-"Overlap x Hz" de
levering. In een sweep-ronde is de vaste as een anker, geen doel.

**B1 — wDI-omslagkromme (GEMETEN, KOAN-3-weg-fixture, M-T-venster 1849–3149, `designThreeWay`,
eqBands 0)**: on-axis-optimum zit op de VLOER (1849; fx 12,34). Anker 3149 (= het echte DI-match
3,5 kHz, in het venster geklemd): wDI 0,3/1/2/3 → 1849 (+0 %); 5 → 1925 (+2,9 % on-axis); 8/15/30 →
**3111 (+30 % on-axis, structuur wisselt naar BW3@615)** — een klif, geen omslagpunt. Anker 2400: wDI
≤ 8 → 1849; 15 → 1965 (+4,7 %); 30 → 2188 (+14,7 %). Conclusie: er is GEEN wDI die het anker laat
winnen tegen < 5 % on-axis-prijs; het gedrag is een sprong tussen twee bekkens. De fx-term blijft
dus op tiebreak-sterkte (0,3) en de spec-regel wijst naar **B2 (kooi-versmaller op het DI-anker)** —
nog niet gebouwd, aparte branch na de merge.

## 5. De poorten (LCR-levenscyclus)

Poort 1 — ontwerp (`vfOptimizer` greedy): band alleen bij ≥ 1 % fx-winst (`minBandImprovement`
0.01); Q-vloer 0.7 op piek-cuts; full-grid-audit verwijdert banden < 0.5 % (r. 1044); staged: banden
alleen zolang de doelen niet gehaald zijn. 3-weg-EQ-trede: ≥ 1 % (`threeWayDesign` stage 3).
Poort 2 — synthese (`synthesis.ts`, `corrections 'lean'`): kale ladder eerst; haalt die
`leanTargetDb` (0.5 dB rms) → klaar; anders correcties (Zobel/Fs-trap/hold) die ≥ 10 % fit-winst
moeten betalen (r. 485). Gated: Zobel bij |Z|-stijging ≥ 1.3×, Fs-trap bij Z-piek onder de HP-knie.
Poort 3 — tuner staged (`optimizeNetworkValues`, alleen `opts.staged`): `meets` = peak ≤ doel én
worst-pair φ ≤ doel op het VOLLE grid. Doel gehaald → **desnoei**: elk vrij part open/shorted, retune
(0.6 budget), houden als `meets` én `safe` (prot +0.5, dip +1, zShort +0.1, leak +4) én fx ≤ 1.10×
huidig én ≤ 1.35× start; max 8 kandidaten per ronde, rondes = clamp(vrij/2, 8..20). Doel NIET
gehaald → **escalatie** (bypass-C over serieweerstanden, ≥ 3 % of doel) — **geen snoei**. Beide
zetten moeten sinds punt 4 óók `rsSafe` passeren (R_bron aan de lage driver niet van ≤ naar > grens).
**Fix 2 (na de axes-run van 19 aug: levering 1789 Hz onder de 2×fs-vloer 1902)**: de fysische
vloeren (fs·K / excursie / reach — NIET de datavloer) gelden nu voor de LEVERING: (a) `xoFloorPairs`
→ stijve barrière in `fxOf` + ondergrens van de ontwerp-knievensters (`floorBound`); (b) na de tune
`xoFloorVerdict` per paar: 'ok' / 'warn' (≤ `xoFloorSlack` 5 % eronder) / 'fail' → diskwalificatie
met reden; (c) App levert de vloeren uit `physWin3.win[side].limits` (regels fs/excursion/reach). Locked
parts (`locked`) worden nooit verzet/verwijderd. Krimpladder: E12-stappen omlaag per vrije cap, poort
= staged doelen + fundamentals, anders ≤ 1 %/stap, ≤ 2 % cumulatief.
**Afslank-pass (C, `minimize.ts → minimizeNetwork`, op verzoek, nooit stil)**: (C1) verwijder
iteratief het DUURSTE niet-VERDIENDE onderdeel (poort 4), retune (staged op de doelen), houden zolang
doelen + fundamentals + R_bron-grens (≤ max(grens, voor)) + Z-min (≥ min(2,5, voor−0,05)) staan;
(C2) per resterend R/L/C de GOEDKOPERE catalogusonderdelen binnen ±25 % (re-solve, geen retune),
goedkoopste dat blijft voldoen; (C3) twee-voor-een als SUGGESTIE (serie-L + serie-R in één tak → één
spoel met hogere DCR, met R_bron-waarschuwing); (C4) rapport BOM vóór/na, besparing per stap,
kwaliteitsdelta's, "Apply as new tab" — het opgeslagen ontwerp wordt niet aangeraakt. De baseline-
tune zelf verwijdert al wat poort 4 INERT vindt en wat de staged-snoei afstoot; die stappen staan in
het rapport. HARD GELEERD in de test: een "dood" vrij onderdeel bestaat zelden — de tuner hergebruikt
een 6,8 mH-shunt gewoon als filterelement; REDUNDANTIE (parallelle cap) is het eerlijke fixture.
Poort 4 — `partAudit.ts → auditNetwork` (aug 2026, ALTIJD, twee keer: seed en getuned): per part en
serie-LCR-keten open/short zonder retune; dA = max|ΔSPL| 200 Hz–15 kHz (1/6-oct), dP = P95 van de
puntsgewijze Δ relatieve paar-fase in de overname-kern (≤ 6 dB verschil), dZ = ΔZmin/ΔR_bron.
INERT (dA < 0.15, dP < 1.5°, |dZ| < 0.2 Ω, geen vloer/grens-kruising) → verwijderd ongeacht doelen
(hercheck peak +0.1/φ +1°, anders terug + GRIJS); VERDIEND (dA ≥ 1 ∨ dP ≥ 3° ∨ Zmin kruist 2.5 Ω ∨
ΔZmin ≥ 1 Ω ∨ R_bron kruist 1 Ω); anders GRIJS. Rapport `NetOptimizeResult.audit`, incl. `rSourceOhm`
aan de lage driver op Fb/Z-piek en `qesFactor = (Re+Rs)/Re`, `rSourceWarn` bij ≥ 1 Ω.
⚡ tegenspraak: de spec vroeg dP < 1°; code 1.5° (gemeten: een textbook-dode shunt-spoel leest 1.07°).

## 6. Data-afhandeling

`parsers/frd.ts → parseFrd` (3 kolommen; `classify.ts` waarschuwt bij Ω-in-dB), `parsers/lim.ts`
(LIMP-binair → ZMA-tekst op de importgrens). `dsp.ts → resample`: dB en ge-UNWRAPTE fase apart
lineair in log-f (complex-exact voor delay), unwrap op het dichte bronrooster; **weigert
extrapolatie** (throw; grid-top wordt geklemd op het bestandseinde in App). Z: `resampleImpedance`
log-log |Z| + fase, randen vlak geklemd. Som: `combineN` complex per punt; somfase via
`unwrapGuided` (gids = magnitude-gewogen takfase). Filter H uit MNA-solver `network.ts →
solveNetwork` op de gemeten complexe Z (Rg als Norton-bron). Gedeelde tijdreferentie: fase wordt
NIET per file genuld; `TweeterAdjust.offsetMm` voegt φ −= 360·f·(mm/c) toe (`dsp.ts` r. 116–121) —
in measured-modus hoort dit 0 te zijn (dubbeltelling anders; auto-fill zet 0, UI waarschuwt);
`depthMm` (kast) raakt de som NIET (alleen geometrie), behalve met opt-in seat re-timing
(`listeningDelayShiftUs`). Minimum-fase-modus (`minphase.ts`) gooit timing weg en zet de excess-Δ
als offset. "Timing plausible": 2-weg `timing.ts → assessSharedReference` (bulk-delay-fit op rauwe
fase, R² ≥ 0.9 beide, |Δ| ≤ 300 µs → 'plausible', anders 'suspect'/'unreliable'); 3-weg
`assessPairTimeBase` per aangrenzend paar op EXCESS-fase in het eigen passband; chip = slechtste
paar. Model-vs-meting: `verification.ts → compareMeasurement` (mediaan-niveau-offset, delay+offset
least-squares op de fase, ~180° ⇒ "likely inverted").

## 7. Scores in de UI

- **Response flatness** (`responseStats.ts`): avg = gemiddelde |SPL − mediaan| over de zichtbare
  band; score = `100·(1 − (avg/2.5)^1.3)` (85 ≈ ±1 dB-klasse); avg/P95/peak ±dB t.o.v. mediaan;
  "±1 dB xx %" = aandeel punten met |dev| ≤ 1. Display-only.
- **Integration** (`integration.ts`): overlap-gewogen `Σw·cos(ε/2)/Σw·100`, w = 10^(−|ΔdB|/20),
  punten met |ΔdB| ≤ 20; overlap-centre = punt met max w; bandwidth = aaneengesloten ≤ 90°.
- **Phase flatness / P95** (`phaseStats.ts`): over de overlap-punten avg, P95, score
  `100·(1 − avg/45)`; chip "Phase P95" = P95 van het slechtste paar (3-weg); chip-kleur ok ≤ 45,
  warn ≤ 90 (App r. 10240/10257).
- **Kleurzones** (App `phaseTier`, `TIER_BOUNDS` 15/45/90/120): ≤ 15 tight, ≤ 45 full summing,
  ≤ 90 ≥ 3 dB gain, ≤ 120 no gain, > 120 cancelling — visueel; de score-ankers zijn 45/90/120.
- **Overlap x / y Hz** = overlap-centres per paar (integration), **niet** de knieën.
- **Nulcheck** "Combined, tweeter inverted" = dezelfde som met de tweeter geïnverteerd; diep gat =
  goede uitlijning van het normale ontwerp.
- **Scan-tabel**: peak (±dB), avg (|dev| hele band), phase (avg over paren; 3-weg-poorten op worst),
  overlap (oct per paar; ⚠ = buiten venster met 6 % slack `judge`), Z min (⚠ < 2.5), **R src** (△ ≥ ½
  grens · ⚠ ≥ grens · ✗ ≥ diskwalificatie), BOM. Een gediskwalificeerde rij is doorgestreept
  (`tr.disqualified`), reden in de tooltip van de kruising-cel; △ in die cel = levering ≤ 5 % onder
  een fysische vloer.
- **Part audit**: kop = tellingen + R_bron; per rij dA/dP/dZ/ratio/€/verdict.
- **Pareto-scatter** (B3, boven de scan-tabel, ≥ 2 geprijsde rijen): x = BOM, y = piek/avg/fase
  (keuze), gevuld = niet-gedomineerd, ✗ = gediskwalificeerd, ◂ = geladen; klik laadt.
- **Minimaal-netwerk-rapport** (✂ Minimize network, Network-tab): BOM vóór → na, piek/fase/R_bron
  vóór → na, per stap verwijderd/vervangen + €, twee-voor-een-suggesties, "Apply as new tab".
- **Nieuwe strip-items (aug 2026)**: "source R at the low driver x Ω (Qes ×y) — R5, L1" (△ vanaf ½
  grens, ⚠ erboven; onderdelen = grootste |ΔR_bron| bij verwijdering); "excess GD 500 Hz/2 kHz/8 kHz"
  (bulk = in-band-mediaan afgetrokken); 3-weg "mid band x oct" (△ < 2,3). Directivity-paneel: "Power
  response: slope … dB/dec · smoothness … · fold …" met ⚠ bij stijgende helling.

## 8. Beoordelingskader

| Zie je dit | Betekent |
|---|---|
| ⚠ bij label, levering > ⅓ oct van doel | topologie/tuner kan dat doel niet: venster of realisatie knelt (bemonsterde as); niet cosmetisch |
| Z min ⚠ (< 2.5 Ω) | klasse-verlies in ranking, hoe vlak ook; 2.5–3.2 Ω = oranje IEC-tier, geen fout |
| Phase P95 groen (≤ 45) maar avg hoog | fout is breed maar niet extreem — kijk welk paar (`pairPhaseDeg`) en of het paar met de grootste rig-onzekerheid (W-M) domineert |
| Response 87 vs 66 | avg |dev| ≈ 0.55 vs 1.2 dB (formule §7); check of de zichtbare band onder de optimizer-vloer duikt ("designed from X Hz"-stripitem) |
| "no room … pin it, or relax a threshold" | twee venstergrenzen botsen; kandidaten collapsen op de vloer — kijk welke regel (label) |
| Veel onderdelen bij gehaalde doelen | poort 3 mag alleen ≤ 10 %/part snoeien; poort 4 vond niets inert → alles "doet iets", niet per se rendabel |
| `rSourceWarn` (R_bron ≥ 1 Ω, Qes ×) | serie-R/DCR vóór de lage driver: demping/rendementsverlies dat geen responsmetriek ziet; ≥ 2 Ω = gediskwalificeerd (✗, doorgestreept) |
| ✗ doorgestreepte rij | gediskwalificeerd: R_bron ≥ 2 Ω óf levering > 5 % onder een fysische vloer — reden in de tooltip; rij blijft klikbaar |
| overlap-oct groot (> 2.5) | brede overlap: beide conussen dragen samen — voor een 2-weg-som prima, voor een overname vaak ongewenst |
**Deel A gemeten (harness, KOAN-3-weg-fixture, demo-catalogus v6, snap AAN, costWeight 0,0015, 4
kandidaten)**: A1 — in de winnaar-achtige kandidaat (591/2415) is ÉLK onderdeel VERDIEND behalve één
inert (ongeprijsd); niet-verdiend draagt €0 van €165. A2 — BOM's 143–220 € bij peak 1,7–3,5 dB: de
goedkoopste (€143) is ook de slechtste; er zijn in DEZE harness géén kandidaten binnen 0,3 dB/3° voor
< 60 % — de €273–€642-spreiding uit Sanders sessie komt niet uit de topologie maar uit de SNAP-TIER
(profiel 'position' + zijn v8-catalogus: premium caps/spoelen in het seriepad). A3 — de MID-tak
draagt het meeste (€89–101 van €165–177: bandpass = twee ladders + shunts), woofer €34–38, tweeter
€38–41. Conclusie: het BOM-verschil is een tier-/SKU-keuze, en daarom zit de hefboom in costWeight/
profiel + de afslank-pass (C2-substitutie), niet in componenten schrappen. Bijvangst: met deze
catalogus snapt de keten naar Z-min 0,46–0,52 Ω op de twee beste kandidaten (demo-SKU-roosters) —
in de app-ranking verliest dat de Z-klasse; in Sanders sessie stond Z op 2,6–3,4 Ω.
**B2 gemeten (costWeight-kromme, kandidaat 591/2415, demo-catalogus)**: eerste meting op {0,005 …
0,15} was BYTE-IDENTIEK — `costWeight` was NERGENS aangesloten (ketens noch App gaven hem door; de tuner
draaide stil 0,0015). Na het plumben: 0,0015 → €165/peak 1,90 · 0,005 → €163/1,77 · **0,015 → €160/1,74**
· 0,05 → €165/1,78 · 0,15 → €165/1,78 (fase 9,4–10,3°, R_bron 0,63 overal). Default nu 0,015 (App
'ads-cost-weight'; tuner-default blijft 0,0015). De hefboom is klein (±3 %) omdat de snap per slot
alleen ±25 %-waarde-buren ziet; tier-profiel en de afslank-pass zijn de echte kostenknoppen.
**Acceptatie "≤ €300 met peak ≤ 2,5 / fase ≤ 12° / R_bron ≤ 1,2 / Z ≥ 2,5"**: in de harness NIET
gehaald door één kandidaat tegelijk — 591/2415 en 552/2288 halen alles behalve Z-min (0,46/0,52 Ω, een
demo-catalogus-snap-artefact: de roosterdelen dippen de ingangsimpedantie), 424/2432 haalt alles
behalve R_bron (1,69 Ω); bindend zijn dus de SNAP-Z en de woofer-pad, niet de prijs (alle vier ≤ €220).
Op Sanders eigen catalogus/profiel liggen de BOM's 2–4× hoger en ís prijs de as — daar hoort het
Pareto-front het knikpunt te tonen.
**⚡ DE R_BRON-KOLOM WAS KAPOT (aug 2026, Sanders "van 19 pogingen hebben we maar 1 goede")** —
de belangrijkste vondst van deze ronde. `sourceResistanceOhm`/`auditNetwork` namen het gridpunt
NAAST `fbHz` zonder te toetsen of Fb ÍN het grid lag. Sanders poort staat op 31 Hz en zijn meting
begint op 200 Hz, dus élke kandidaat werd geprobed op grid[0] = 210 Hz — op zijn woofer-LP precies
de parallelresonantie van L1‖C2 (3,3 mH ‖ 136 µF = 237 Hz). Wat als "bronweerstand" in de tabel
stond was de resonantiepiek van het filter zelf. GEMETEN op zijn opgeslagen ontwerpen: zijn eigen
handgebouwde filter (het beste ontwerp in de kamer) las 7,40 Ω, een ontwerp mét een 3,3 Ω-weerstand
in het woofer-seriepad 8,62 Ω — 15 van de 19 rijen werden op dat getal gediskwalificeerd, het goede
ontwerp incluis. Fix: `sourceProbeIndex` (fb buiten het grid ⇒ géén probe) + `seriesPathResistanceOhm`
(DC-limiet: spoel-DCR + weerstanden op het bus-pad naar de lage driver, `busTopology.driversOf`) als
terugval, met `rSourceOutOfBand` in het rapport zodat de tekst zegt WELK getal je ziet. Na de fix:
0,43 vs 3,63 Ω — precies de scheiding die de bewaker moest maken. HARD GELEERD binnen dezelfde fix:
terugvallen op de impedantiePIEK binnen de band is óók fout — daar shuntet de cap de serieweerstand
weg (0,48 Ω gerapporteerd voor 3,63 Ω serie-pad), terwijl juist bij Fb die weerstand de conus dempt.
De DC-limiet is een ONDERGRENS: hij mag veroordelen, nooit vrijpleiten.
**Per-tak DCR-budget in de snap (zelfde ronde)**: `branchDcrBudgetOhms` (1,0 dB per TAK, referentie =
min |Z| van de eigen driver) + `BRANCH_SERIES_DCR_DB`; `pickCandidates(..., dcrCeilOhms)` filtert de
pool én de STAPELS (twee spoelen die elk binnen budget zitten tellen in serie op — de 2,59 mH-stapel
uit de scan). Verdeling over de serie-spoelen van een tak naar L^0,65. Bij een onhaalbaar budget wint
het DIKSTE koper op de juiste waarde (de eerste versie gaf de pool vrij, en dan koos de kostenterm
het dunste draad — gemeten: R_bron bewoog geen millimeter); de snap MELDT de overschrijding.
**Referentierij in de scan-tabel** (App `measureReferenceDesign` + `scanReference`): het ontwerp dat
op het scherm stond vóór de run, door dezelfde pijplijn gemeten (`before`-metrics, één solve), plus
een luide regel als geen enkele levende kandidaat het verslaat op piek/fase/R_bron. Een scan die
alleen zijn eigen rijen rangschikt kroont altijd een winnaar — ook als ze allemaal slechter zijn dan
wat de ontwerper al had. Bijvangst: `NetOptimizeResult.before` DROEG de velden al (zMinOhm,
pairPhaseDeg, …), het TYPE was te smal.
Bekende gaten: inert-part-bij-onhaalbaar-doel → **opgelost** (poort 4, c4699f5); ontbrekend fysisch
criterium → **opgelost** (idem); bronimpedantie → **klasse + safe-poort** (punt 4, na c4699f5),
schatting buiten de meetband blijft gelabeld; ontwerpstap 3-weg on-axis → **DI-anker in de
structuurzoeker** (punt 2), de EA-term zelf niet; power "vlak"→"glad" → **opgelost** (punt 1, legacy-
toggle); objective op rauwe punten → **smoothing 1/12 vóór decimatie** (punt 3, legacy-toggle),
iteratiewinst NIET gemeten; W-M-geometrie (rig 56° op 1 m vs 30° op 3,4 m; wooferdiepte-anker) →
**open** (data, geen code); ranking-verschuiving op bestaande projecten door punt 1/3 → **[NIET
GELOGD]** (vergt dubbele run; A/B via de legacy-toggles).

## 9. Instellingen & defaults

⚙ Settings (Filters-tab) tenzij anders: prioriteit 50 % (`phasePriority`); staged AAN met doelen
2.5 dB / 15° (`targetRipple`/`targetPhase`) — **bewust ruimer dan 1.5/10** (punt 6b): een doel is het
STOPPUNT van de escalatieladder én de voorwaarde voor de desnoei-pass; 1.5/10 was geijkt op de
KOAN-topdrivers en duwde elk gewoon ontwerp de dure kant op (banden blijven komen, snoei draait nooit)
terwijl het doel toch gemist werd. Wie het haalt kan het aanscherpen; de default mag niet; EQ-banden per driver 2 (`vfEqBands`); in-room-gewicht
25 % (`dirWeight`, alleen mét hoekdata; 3-weg mid-set verplicht); phaseMetric 'band'; breakup-guard
AAN; HP/LP-voorkeur auto (laag+hoog); flank-doelen leeg; xo-pin uit; 2-weg scan-stappen 3 (guided 9);
3-weg `scan3Mode` axes (localStorage) + punten 5 (guided 7); venster-drempels (`xoWinThr`,
localStorage 'ads-xo-window'): array-k 0.5, λ/N auto, breakup/1.8, fs×2; KA-tier 'measured' (4 dB);
lobing-k 'auto'; **twee breakup-marges, bewust** (punt 6a, naast elkaar onder Driver limits): "driver
card & limits (harmonic)" f_b/3 = waar de vervormingsprijs landt; "candidate window" /1.8 = hoe dicht
een overgang bij de breakup mag; **power response** 'smooth' + fold 0.5 (localStorage 'ads-power-*');
**error smoothing** 1/12 oct ('ads-err-smooth'); **DI anchor weight** 0.3 ('ads-di-weight'); **source
R limit** 1.0 Ω ('ads-rsource-limit') + **disqualify ≥** 2.0 Ω ('ads-rsource-disq'); **BOM cap per
channel** 0 = uit ('ads-bom-cap'); **Room correction present** uit ('ads-room-corr', rimpeldoel 3.5 dB
'ads-room-ripple' — fase-doel ONGEWIJZIGD: amplitude corrigeert de kamer, driver-integratie niet);
**snap cost pressure** 0.015 ('ads-cost-weight'); **dissipation weight**
0.05 ('ads-diss-weight', 0 = legacy); vloer-slack 5 % (`xoFloorSlack`, nog geen UI-knop); excursie-ref 96 dB; catalog-snap AAN, profiel
'position', stacks uit, costWeight 0.0015; corrections 'lean' bij staged; solo-budget 6 dB; Z-vloer
2.5 Ω (constante); tolerantieband uit; seat re-timing uit; fasemodus measured (auto bij plausible).

## Changelog
Laatst geverifieerd tegen commit **ddca34b** + de werkkopie van 19 aug 2026 (minimaal netwerk: Deel A
meting, BOM-plafond, costWeight geplumbed + kromme, Pareto-scatter, afslank-pass, kamercorrectie).
Herzie §2–§5/§8 wanneer `fxOf`/`objValue`/`deriveXoWindow`/`rankChain*` wijzigt.
