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
   aangepast — de tuner verzet alleen componentwaardes op een vaste topologie; de synthese-fout
   per tak wordt niet teruggekoppeld naar de vf-stap.

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
alleen `partAudit` smootht 1/6 oct vóór de Δ.

**vfOptimizer** (`vfOptimizer.ts → objValue`, `pw = 0.15 + 0.7·p`, p = prioriteit 0..1):
```
fx = 2(1−pw)·amp + 2pw·[(avgφ/15)² + 0.5·(P95φ/45)²]      (phaseMetric 'band'; 'overlap': alleen 1e term)
     + 0.02·leakSq (breakupGuard) + 0.5·xoDip² + xoPenalty(xo) + slopePen
amp = (1−dW)·std(SPL_som)² + dW·std(energy-average)²      (dW = in-room-gewicht, alleen met hoekdata)
```
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
amp = (1−dW)·bandStd² + dW·powerStd²   (bandStd = one-pass std over de band; solo: fx = 2·amp)
```
`protSq` = gemiddelde (|H_boven| + 15 dB)²⁺ voor f ≤ xo/3 (bovenste tak ≥ 15 dB gedempt);
`corridorSq` = gemiddelde (|tak − doel| − 3 dB)²⁺ tegen de branchTargets van de ontwerpstap
(alleen in de keten). φ = uniform gemiddelde over de overlapvensters van álle paren; poorten oordelen
op de SLECHTSTE pair (`phaseGate`). ZACHT: alles hierboven. HARD (afkap/klasse, niet in fx):
Z-vloer 2.5 Ω (`Z_FLOOR_OHM`, repair-pass + poorten), serie-pad-plafond `seriesCeilFor`
(C ≤ 33 µF·k, L ≤ 8 mH·k, schaalt met textbook-magnitude), bouwbaarheidsdoos `BOUNDS`
(C 0.33–100 µF, L 0.05–15 mH, R 0.22–47 Ω), solo-gevoeligheidscap, DCR-plafond in de snap
(`catalog.dcrCeilingOhms`, 0.5 dB serie / 2 dB shunt).

**threeWayDesign** (`threeWayDesign.ts → evaluate`): `fx = 2(1−pw)·amp + 2pw·φterm + 0.02·leakSq`,
`amp = std² + 0.35·peakExcess²` (positief boven de mediaan), φ = gemiddelde van de twee paren; NM
op (log xoLow, log xoHigh) met +12·penalty buiten de kooi en `xoHigh ≥ 2·xoLow`.

## 3. Meegewogen — en niet

**Meegewogen (objective of poort)**: rimpel als std (zoek) / peak ±dB en avg |dev| (rapport,
doelen); fase avg + P95 per paar over het 20 dB-overlapvenster; overlap-octaven alleen gerapporteerd
(`pairOverlapOct`); Zmin: poort/klasse (2.5 Ω) + repair, nooit een term; tweeter-bescherming
(protSq, gewicht 0.02); breakup-lek (0.02, alleen naast de kruising 1.6–4×); vallei (0.5·dip²);
akoestische flanken (opt-in); in-room energy-average (dW, default 0.25 alleen mét hoekdata, óók in
`rankChain3Results` sinds aug 2026); BOM alleen als tiebreak ≤ 5 % (`rankChainResults`,
`rankChain3Results`) en als kostendruk in de snap (`costWeight` 0.0015); excursie/lobing/breakup/fs
alleen in het VENSTER (§4), nooit in fx.
**NIET meegewogen**: directiviteit/power response in `designThreeWay` (on-axis; bewust, comment
"nog on-axis"); bronimpedantie op fb — alleen gerapporteerd door `partAudit` (`rSourceWarn` ≥ 1 Ω),
geen poort, geen fx (nooit gebouwd als sturing); gedrag onder de datavloer/view-range (bewust: band =
ontwerp-scope, alleen de safety-gate kijkt op het volle meetgrid naar fundamentals); breakup buiten
de as (nooit gebouwd); groepsvertraging van de som (nooit gebouwd — alleen weergave); spoel-DCR
als rendementsverlies (alleen via DCR-plafond in de snap); vermogens/thermisch (nooit gebouwd);
verticale lobing (geen verticale metingen; alleen de geometrieregels).

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
`runAxes`): `candidateCentres` (3/5/7 log-punten), vaste as = pin → DI → warm → log-midden, kooi van
de vaste as = hele venster (`variantsFromPoints`). Kooi = tegel op meetkundige middens; xo-penalty
adaptief (§2). 2-weg: `crossoverVariants` (pin onderverdeeld, 3/5/7/9 slices) of vrije keten +
rescue-followups (`followupVariantsFor` ±12 %).
**Label**: sinds aug 2026 = GEREALISEERDE kruising (`after.xoHzPairs` / `after.xoHz`, App
`deliveredLabel`) met "(aim …)" erachter; **⚠** bij > ⅓ oct afwijking op een bemonsterde as (de
vaste as van een sweep telt niet). Vóór die wijziging was het label het slice-CENTRUM — vandaar de
bekende "label 4028 / header 3335"-discrepantie: het label was het doel, de strip-"Overlap x Hz" de
levering. In een sweep-ronde is de vaste as een anker, geen doel.

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
gehaald → **escalatie** (bypass-C over serieweerstanden, ≥ 3 % of doel) — **geen snoei**. Locked
parts (`locked`) worden nooit verzet/verwijderd. Krimpladder: E12-stappen omlaag per vrije cap, poort
= staged doelen + fundamentals, anders ≤ 1 %/stap, ≤ 2 % cumulatief.
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
  overlap (oct per paar; ⚠ = buiten venster met 6 % slack `judge`), Z min (⚠ < 2.5), BOM.
- **Part audit**: kop = tellingen + R_bron; per rij dA/dP/dZ/ratio/€/verdict.

## 8. Beoordelingskader

| Zie je dit | Betekent |
|---|---|
| ⚠ bij label, levering > ⅓ oct van doel | topologie/tuner kan dat doel niet: venster of realisatie knelt (bemonsterde as); niet cosmetisch |
| Z min ⚠ (< 2.5 Ω) | klasse-verlies in ranking, hoe vlak ook; 2.5–3.2 Ω = oranje IEC-tier, geen fout |
| Phase P95 groen (≤ 45) maar avg hoog | fout is breed maar niet extreem — kijk welk paar (`pairPhaseDeg`) en of het paar met de grootste rig-onzekerheid (W-M) domineert |
| Response 87 vs 66 | avg |dev| ≈ 0.55 vs 1.2 dB (formule §7); check of de zichtbare band onder de optimizer-vloer duikt ("designed from X Hz"-stripitem) |
| "no room … pin it, or relax a threshold" | twee venstergrenzen botsen; kandidaten collapsen op de vloer — kijk welke regel (label) |
| Veel onderdelen bij gehaalde doelen | poort 3 mag alleen ≤ 10 %/part snoeien; poort 4 vond niets inert → alles "doet iets", niet per se rendabel |
| `rSourceWarn` (R_bron ≥ 1 Ω, Qes ×) | serie-R/DCR vóór de lage driver: demping/rendementsverlies dat geen responsmetriek ziet |
| overlap-oct groot (> 2.5) | brede overlap: beide conussen dragen samen — voor een 2-weg-som prima, voor een overname vaak ongewenst |
Bekende gaten: inert-part-bij-onhaalbaar-doel → **opgelost** (poort 4, aug 2026, sessie na
d4bba97, nog niet gecommit); ontbrekend fysisch criterium → **opgelost** (idem); bronimpedantie
onder de meetband → **gerapporteerd**, geen sturing (open); ontwerpstap 3-weg on-axis → **open**;
W-M-geometrie (rig 56° op 1 m vs 30° op 3.4 m; wooferdiepte-anker) → **open** (data, geen code).

## 9. Instellingen & defaults

⚙ Settings (Filters-tab) tenzij anders: prioriteit 50 % (`phasePriority`); staged AAN met doelen
2.5 dB / 15° (`targetRipple`/`targetPhase`); EQ-banden per driver 2 (`vfEqBands`); in-room-gewicht
25 % (`dirWeight`, alleen mét hoekdata; 3-weg mid-set verplicht); phaseMetric 'band'; breakup-guard
AAN; HP/LP-voorkeur auto (laag+hoog); flank-doelen leeg; xo-pin uit; 2-weg scan-stappen 3 (guided 9);
3-weg `scan3Mode` axes (localStorage) + punten 5 (guided 7); venster-drempels (`xoWinThr`,
localStorage 'ads-xo-window'): array-k 0.5, λ/N auto, breakup/1.8, fs×2; KA-tier 'measured' (4 dB);
lobing-k 'auto'; breakup-limiet aan, harmonic 3 (⚡ let op: kaart/driverLimits gebruiken /3, het
venster /1.8 — twee betekenissen naast elkaar); excursie-ref 96 dB; catalog-snap AAN, profiel
'position', stacks uit, costWeight 0.0015; corrections 'lean' bij staged; solo-budget 6 dB; Z-vloer
2.5 Ω (constante); tolerantieband uit; seat re-timing uit; fasemodus measured (auto bij plausible).

## Changelog
Laatst geverifieerd tegen commit **d4bba97** + de niet-gecommitte werkkopie van 19 aug 2026
(part-audit, 3-weg-demo, xoWindow, as-voor-as-scan, regels 8/9). Herzie §4/§5/§8 zodra die
werkkopie is gemerged (hash invullen) of wanneer `fxOf`/`objValue`/`deriveXoWindow` wijzigt.
