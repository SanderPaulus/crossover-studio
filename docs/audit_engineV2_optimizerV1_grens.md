# Audit — welke Engine V2-data bereikt Optimizer V1 werkelijk?

**Datum:** 27 augustus 2026
**Werkboom:** `b137f1d` (F3c)
**Opdracht:** inventariseer welke data Engine V2 afleidt, welk deel daarvan de v1-optimizer
werkelijk gebruikt, en wat daaruit volgt als beperking. Geen aannames — elke bewering
hieronder is in de bron nagelopen en draagt een bestand:regel-verwijzing.
**Voor deze audit is geen gedrag gewijzigd.**

---

## 0. Context voor een lezer zonder sessiegeheugen

Crossover Studio ontwerpt passieve luidsprekerfilters uit driver­metingen. Er zijn twee
engines:

- **v1** — de bestaande app: kandidaatgeneratie (`crossover3Variants`), de ketens
  (`threeWayChain`, `designChain`) en de tuner (`optimizeNetworkValues` in
  `netOptimizer.ts`). Een gewogen scalaire optimizer.
- **v2** (`src/lib/engine2/`) — sinds F1 opgebouwd: een ingest-/afleidingslaag, een
  metriekbibliotheek (A4), een pre-design-laag (A5d), harde poorten (M-A/M-B/M-C),
  determinisme (A5e.4), eisen + shortlist (A5e.1) en sinds F3c een aanbevolen zoekband.

De **toggle-invariant** is de ruggengraat van het project: met `engineV2Enabled` uit moet
het app-gedrag byte-identiek zijn. `src/lib/engine2/toggleRegression.test.ts` bewaakt dat.

De vraag die deze audit beantwoordt: *v2 leidt veel af — hoeveel daarvan stuurt de
zoektocht werkelijk?*

---

## 1. Antwoord in één alinea

Engine v2 draagt **zes velden** over de workergrens, en die worden aan de andere kant
vertaald naar **vier opties** op een tuner die verder volledig door v1 wordt aangestuurd.
Alles wat v2 aan pre-design afleidt — vensters, aanbevolen band, gaps, lobing,
orde-afleiding — bereikt de zoektocht niet. Drie van de zes velden lekken bovendien
aantoonbaar: één wordt nooit gevuld, één wordt bij de grens vervangen door een grovere
waarde, één wordt expliciet niet toegepast.

**v2 bestuurt waarden. v1 bestuurt keuzes.**

---

## 2. De grens, exact

### 2.1 Wat er overheen gaat

`src/lib/engine2/optimizer/worker.ts:92–113`

```ts
export interface V2RunSettings {
  gates: GateSettings;
  budgets: BudgetSettings;
  determinism: DeterminismSettings;
  reOhmByModel?: Record<string, number>;
  targetCurve?: TargetCurve;
  judgeBandHz?: [number, number];
}
```

Dat is de volledige payload. `V2Chain3Payload` = `{ input: Chain3Input; v2: V2RunSettings }`,
waarbij `input` de gewone v1-keteninvoer is.

### 2.2 Wat de tuner ervan merkt

`src/lib/engine2/optimizer/run.ts:82` — de typedefinitie legt de bevoegdheid vast:

```ts
tuneOptions?: Omit<NetOptimizeOptions, 'gateViolation' | 'valueCeilings' | 'valueSumCeilings'>;
```

`src/lib/engine2/optimizer/run.ts:241–251`:

```ts
const tuneOptions: NetOptimizeOptions = {
  ...(input.tuneOptions ?? {}),                    // ← letterlijk de v1-instellingen
  ...(gateViolation ? { gateViolation } : {}),
  ...(Object.keys(searchBox.valueCeilings).length > 0
    ? { valueCeilings: searchBox.valueCeilings } : {}),
  ...(searchBox.valueSumCeilings.length > 0
    ? { valueSumCeilings: searchBox.valueSumCeilings } : {}),
  ...(determinism.budgetEvaluations !== null
    ? { maxIterations: determinism.budgetEvaluations } : {}),
};
```

Vier sleutels. `NetOptimizeOptions` heeft er ruim vijftig (`netOptimizer.ts:71–372`):
`phasePriority`, `directivityWeight`, `powerFoldWeight`, `dissipationWeight`,
`errorSmoothOct`, `xoRange`, `xoRangePairs`, `xoFloorPairs`, `xoPinHard`,
`acousticSlopes`, `catalogSnap`, `costWeight`, `branchTargets`, `safety`, … — allemaal van
v1.

Daarnaast bepaalt v2 de **startpunten**: `jitteredStart(input.seedParts, draw, i)` met een
seeded stroom (`run.ts:253–262`).


#### Erratum bij §2.2 — 27-08-2026 (F4c)

**De tabel en de tekst van §2.2 zijn niet gewijzigd.** F4d verwijst naar deze audit met
paragraafnummers, dus wat er staat blijft staan zoals het op 27-08 is opgeschreven. Hieronder
twee correcties erop.

**(a) `run.ts` is niet de route die de app neemt.** De `Omit<>` op `run.ts:82` en de spread op
`run.ts:241–251` beschrijven `runV2Optimization`, en die functie wordt door **niemand in de app
aangeroepen** — `grep -rn "runV2Optimization" src/` levert uitsluitend twee tests en drie
verwijzingen in commentaar. De scanknop loopt via de worker: `handleV2Request` →
`runThreeWayChain(input, onProgress, hooks)`, en dáár bouwt de **keten** de tuner-opties uit
`Chain3Settings` (`threeWayChain.ts:340–396`) en merget de engine-hook als **laatste**
(`threeWayChain.ts:395`).

Het gevolg voor de lezing van §2.2: de "vier sleutels" zijn juist geteld voor `run.ts`, maar dat
pad is ongebruikt. Op het pad dat de app wél neemt zette de hook diezelfde vier en bouwde de
keten de rest — het lek dat §2.2 beschrijft bestaat dus, alleen één laag verderop dan de
paragraaf suggereert. Wie op grond van §2.2 alleen `run.ts` afsluit, doet een deur op slot die
niemand gebruikt. Dat de hook als laatste merget is bovendien de hefboom waar F4c op leunt: wat
de hook noemt, wint van wat de keten bouwde.

**(b) Het zijn 37 sleutels, geen "ruim vijftig".** Geteld op de top-level eigenschappen van
`NetOptimizeOptions` (`netOptimizer.ts:69–378`): **37**. De schatting "ruim vijftig" verandert
niets aan de redenering van §2.2 — vier van 37 is even weinig als vier van vijftig — maar een
getal in een audit hoort te kloppen, en sinds F4c bewaakt
`src/lib/engine2/optimizer/choiceKeyGuard.test.ts` het: die test leest de sleutelverzameling uit
de bron van `netOptimizer.ts` en faalt zodra er een sleutel bijkomt die in geen enkele klasse zit.

**Wat F4c hiermee heeft gedaan.** Alle 37 zijn ingedeeld in keuze (26), grijs (5) en polish (7,
waarvan 3 al v2-bezit). `run.ts`'s `tuneOptions` is versmald tot de polish-helft — de compiler
weigert nu een keuze-sleutel op dat pad — en op de workerroute noemt de hook tien keuzes en vijf
gewichten expliciet, met de resterende vijftien bij naam in `collect.notes` als nog-overgeërfd.
De definities staan in de nota (A3j) in algemene bewoordingen; de tabel per sleutel is bijlage bij
casusboek **V26**.

---

### 2.3 Wat de worker zelf herleidt

De worker krijgt **geen** `IngestResult`. Hij bouwt een dunne feitenset uit dezelfde arrays
die de v1-keten ook krijgt — `worker.ts:189–221`:

```ts
function measurementFacts(grid, driverZ, branchDb, reOhmByModel) {
  for (const model of Object.keys(driverZ).sort()) {
    const curve   = curveOf(grid, driverZ[model]);
    const stated  = reOhmByModel?.[model];
    const derived = estimateRe(curve);              // ← geen opties meegegeven
    const re      = stated ?? derived?.ohm ?? null;
    if (re !== null) { const fs = classifyImpedance(curve, re).fundamentalHz; ... }
    validHz[model] = band;                          // band = [grid[0], grid[grid.length-1]]
  }
}
```

De grens-inversies worden **in de worker opnieuw berekend** uit deze feiten
(`worker.ts:288`: `invertBudgets(ways, v2.budgets, v2.gates)`), niet doorgegeven vanuit het
rapport. Rapport en zoektocht berekenen dezelfde grenzen dus twee keer, uit verschillende
R_e-bronnen.

---

## 3. Het grootboek

| Afgeleid door v2 | Bereikt de zoektocht | Langs welke weg, of waarom niet |
|---|---|---|
| M-A/M-B/M-C poortgrenzen | **ja** | `gateViolation`-closure, bevraagd bij elke geaccepteerde stap |
| Budgetten → componentplafonds | **ja** (3 van 4) | `valueCeilings` / `valueSumCeilings` |
| Seed, starts, evaluatiebudget | **ja** | gejitterde starts + `maxIterations` |
| Doelcurve (A5e.2) | **ja** | per ontwerp, voor venster- en RMS-oordeel |
| Oordeelband | **ja** | geclipt op meetgeldigheid vóór verzending (geverifieerd, §5) |
| Haalbare kruisvensters (A5d.3) | nee | zit niet in de payload; kandidaten komen uit v1 |
| Aanbevolen zoekband (F3c) | nee | alleen via een mens die op de overnameknop drukt |
| Meetgeldigheidsintervallen | **vervangen** | worker zet `validHz` op het hele raster — lek 2 |
| R_e uit motionele fit | **vervangen** | worker leest de directe aflezing — lek 1 |
| Ingevoerde DC-weerstand | **nee** | veld bestaat, wordt gelezen, wordt nooit gevuld — lek 1 |
| Dempingsmargebudget | **nee** | expliciet niet toegepast — lek 3 |
| Verankerde gaps / ankerniveau | nee | wacht op doelcurve-object (open besluit A5e.2) |
| Breakups, directiviteit, diffractie | nee | rapportage; v1 heeft eigen, aparte afleidingen |
| Lobing, fasekoppeling, orde per flank | nee | rapportage; voedt geen keuze in de zoektocht |
| Semi-inductantie, Z-ripple, baffle step, persistence, level | nee | rapportage |


### Erratum bij §3 — 27-08-2026 (F4b2)

**De tabel hierboven is niet gewijzigd.** F4c en F4d verwijzen naar deze audit met
paragraafnummers, dus de tekst waar zij naar wijzen blijft staan zoals zij op 27-08 is
opgeschreven. Wat hieronder staat corrigeert één regel ervan.

**Wat er staat.** De regel *"Budgetten → componentplafonds | **ja** (3 van 4)"*. Gelezen als:
van de vier A5d.6-inversies bereiken er drie de zoektocht, en alleen de dempingsmarge niet.

**Wat gemeten is.** Bij F4b, en opnieuw bij F4b2 met alle vier de budgetten tegelijk gewapend
door de échte workerroute: **2 van 4**. Naast de dempingsmarge was ook de **LF-bult-inversie**
dood. `BudgetWay` kreeg op de workerroute geen `nearField` en geen `impedance`, en zonder die
twee komt `lfBumpBudgetDb` niet verder dan de notitie *"needs a near-field measurement, the
loaded impedance sweep and the impedance peak M-D derives its band from"*.

**En dat was al zo vóór F4b.** Die regel is geschreven bij F2, toen de worker `BudgetWay`
ging vullen, en de twee ontbrekende velden zijn er nooit in gezet. F4b heeft het lek niet
veroorzaakt — F4b heeft `collect.notes` een scherm gegeven, en daardoor werd zichtbaar wat er
al die tijd stond. De juiste lezing van de tabelregel is dus: **"ja (2 van 4)", en dat is de
stand sinds F2.**

**Wat F4b2 heeft veranderd.** De LF-bult-inversie is hersteld: de nabij-veldkromme, de
impedantiesweep en de fundamentele resonantie steken sindsdien over als feiten en de inversie
bereikt haar grens. De **dempingsmarge blijft dood**, met opzet en met reden — A5d.4(a) wil het
ankerniveau ná baffle step in de beoogde opstelling en dat is het doelcurve-object, open besluit
A5e.2. Sinds F4b zegt het rapportpaneel dat erbij. De stand is daarmee **3 van 4**, en de vierde
wacht op een besluit en niet op een reparatie.

**Waarom de sweep meemoest, en niet alleen de nabije-veldmeting.** De worker houdt al een
driverimpedantie, maar op het ketenraster, waarvan de ondergrens de ver-veldspanwijdte is —
in de draaiende app minstens 200 Hz. M-D evalueert over [0,7·f_p, 2,2·f_p], op casus 1's woofer
36,7–115,2 Hz. Daar inverteren wéigert niet: het leest nergens bult, verdubbelt zijn bracket tot
de limiet en levert **1 048 576 mH** af als zoekgrens. Om dezelfde reden steekt f_p zélf over —
een classificatie op dat raster vindt de resonantie niet, of vindt een conusmode en noemt die
f_s (V8b).

Zie casusboek **V23** (waar dit als bijvangst is vastgelegd) en **V25** (de vier-inversies-tabel
en de reparatie).


### Tweede erratum bij §3 — 27-08-2026 (F4d), de rij "Seed, starts, evaluatiebudget"

**De tabel is opnieuw niet gewijzigd.** Wat hieronder staat corrigeert één rij ervan en legt het
besluit vast dat F4d erover genomen heeft.

**Wat er staat.** *"Seed, starts, evaluatiebudget | **ja** | gejitterde starts + `maxIterations`."*
Gelezen als: A5e.4 werkt op de route die telt.

**Wat gemeten is, per onderdeel, door `handleV2Request` → `runThreeWayChain`:**

| A5e.4-onderdeel | bereikt de zoektocht op de workerroute? | langs welke weg, of waarom niet |
|---|---|---|
| `budgetEvaluations` | **ja** | de hook zet `maxIterations` (`worker.ts`, `tuneOptionsFor`) |
| seed | **nee** | de keten draait **één keer** per kandidaat; er is geen gejitterde start. De seed stempelt alleen. |
| `starts` | **nee** | wordt op deze route door niemand gelezen. `jitteredStart` staat in `run.ts`, en `runV2Optimization` roept niemand in de app aan (erratum §2.2). |
| vingerafdruk | **ja** | elk resultaat draagt hem, en sinds F4d ook het `choices`-ingrediënt (zie hieronder) |

Dat de seed niet doorwerkt is bij F4c gemeten en in `f4b2_v2_worker_baseline.json` vastgelegd
(*"beide seedrijen zijn identiek"*). Het was daar een **bijvangst**. Bij F4d is het een **besluit**.

**Het besluit (F4d): diversiteit komt uit KANDIDATEN, niet uit gejitterde starts.** Onder
satisficing zijn die twee niet uitwisselbaar. Een kandidaat is een keuze die een ontwerper kan
lezen en betwisten — dit kruispunt, deze orde, uit dit venster, om deze reden. Een gejitterde
start is toeval, en een veld dat uit toeval is samengesteld laat zich niet spreiden over
topologie-klassen, want niets heeft zijn topologie gekozen. A5e.1 vraagt om een *gediversifieerde
shortlist*; die kan alleen bestaan als de diversiteit ergens **besloten** is.

**Wat daarmee met de jitter-machinerie gebeurt.** Zij is niet verwijderd en ook niet stil blijven
staan: `DEFAULT_RUN_STARTS` is **1**. De engine jittert dus uit zichzelf niet meer; een project dat
het expliciet vraagt krijgt het nog steeds, en `determinism.test.ts` bewijst nog steeds dat de
trekking reproduceerbaar is. Waarom niet gesloopt: `f4b2_v2_baseline.json` is de acceptatie van een
eerdere sessie en pint `runV2Optimization` op twee seeds mét `starts: 2`. Die vastlegging weggooien
om een geteste codeweg te verwijderen kost meer dan het oplevert, en de weg die telt raakt hem
sinds F4d niet meer aan. Dat is een afweging, en zij staat hier zodat een lezer haar kan betwisten.

**Wat F4d er wél aan toevoegt.** Het `choices`-ingrediënt van de vingerafdruk was op deze route
altijd leeg — `runV2Optimization` vult het, en dat pad loopt niemand. Leeg was juist zolang v1 de
kandidaten koos; het houdt op juist te zijn zodra het veld een v2-afleiding is, want twee runs over
twee verschillende velden zouden dan identiek gestempeld zijn. `V2ScanSettings.candidateFieldKey`
draagt sinds F4d het veld: elke kandidaat met kruispunten, kooi, orde en uitlijning, plus de
generator-parameters en wat er gedund is.

**De assert die dit bewaakt** staat in `optimizer/candidateRoute.test.ts` (*"the SEED does not reach
the search — and after F4d that is a decision"*), met ernaast de tegenproef dat een andere
KANDIDAAT de zoektocht wél bereikt. Zonder die tweede assert zou de eerste ook waar zijn voor een
route die niets doet.

---

## 4. Drie bevestigde lekken

### Lek 1 — de ingevoerde DC-weerstand komt nooit aan

**Bewijs:**
- `worker.ts:101` declareert `reOhmByModel?: Record<string, number>`
- `worker.ts:203` leest het: `const stated = reOhmByModel?.[model];`
- `worker.ts:510` en `:567` geven het door aan `measurementFacts`
- `grep -rn "reOhmByModel" src/` levert **uitsluitend** treffers in `worker.ts`.
  Niets in `App.tsx` of elders vult het ooit.

Het A5a-formulierveld gaat een andere kant op — `App.tsx:3216`:

```ts
const re = stated(v2Meas[role].reOhm);
...
...(re !== undefined && re > 0 ? { measuredReOhm: re } : {}),
```

→ `AdapterBranch.measuredReOhm` → `buildEngineV2Input` → `buildReport`. **Alleen de
rapportagelaag.**

**Doorwerking:** in de worker is `stated` altijd `undefined`. `estimateRe(curve)` wordt
zonder opties aangeroepen, en `impedance.ts:171` schakelt de motionele fit alleen in als
`opts.fundamentalHz` én `opts.motionalPeaks` gezet zijn:

```ts
const fit = opts.fundamentalHz !== undefined && opts.fundamentalHz !== null && opts.motionalPeaks
  ? fitMotionalRe({ ... })
  : null;
```

Beide ontbreken, dus de fit is altijd `null` en de directe aflezing wint. De hele
F3b-verbetering (R_e woofer 3,81 → 2,90 Ω) is **rapportage-only**.

**Gevolg:** de M-E-inversie `R_s ≤ R_e·(q−1)` draait op een andere R_e dan het paneel toont.

### Lek 2 — de meetgeldigheid wordt bij de grens weggegooid

**Bewijs:** `worker.ts:218`

```ts
validHz[model] = band;   // band = [grid[0], grid[grid.length - 1]]
```

De A5b.1-geldigheidsintervallen (uit de meetheaders: 1/T, 2/T) worden vervangen door het
volledige analyseraster. `freezeGateReference` (`worker.ts:240–247`) krijgt dat mee, en de
budgetinversies gebruiken `reference.frozenPassbandHz[model] ?? facts.validHz[model]`
(`worker.ts:275`).

**Gevolg:** poortreferentie en inversies oordelen ook op frequenties waarvan de meting zelf
zegt dat ze er niet zijn. Dit is dezelfde klasse fout die V15 op de fasetracking-referentie
blootlegde, één laag lager.

### Lek 3 — één van de vier budgetten is dood op deze route

**Bewijs:** `worker.ts:281–295`

```ts
// TODO(A5e.2): the anchored attenuation budget wants the anchor level
// AFTER baffle step in the intended setup, which is a property of the
// target-curve object. Until that decision is taken the damping bound
// has no measured budget to sit on in this route, so it is not applied
// here — and saying so beats inventing a gap.
gapBudgetDb: null,
```

Er volgt een noot in `collect.notes` als `dampingMarginDb` gezet is — maar die noot bereikt
het scherm niet.

**Gevolg:** een ingevuld veld dat niets doet. De F0-doctrine zegt *leeg = geen oordeel*;
hier geldt *ingevuld = ook geen oordeel*, en dat staat nergens.

---

## 5. Wat wél klopte

De claim in het commentaar bij `judgeBandHz` — *"the caller clips it to measurement
validity (A5.5)"* — houdt stand. `App.tsx:6077`:

```ts
const band: [number, number] = evalBand
  ? [evalBand.fromHz, evalBand.toHz]
  : [Math.max(200, grid[0] * 1.02), Math.min(grid[grid.length - 1] * 0.975, num(fMax, 20000))];
```

`evalBand` (`App.tsx:3883`) komt uit `sourceMeta`, en het commentaar erboven zegt expliciet
dat er geen terugval op het raster is omdat `refuseIfUnverified` de run dan al gestopt heeft.
De literale terugvalwaarden (200 / 20000) zijn daarmee onbereikbaar op het normale pad.

---

## 6. Structurele beperkingen

Deze volgen uit *waar de grens ligt*, niet uit een vergissing. Ze zijn niet met een
reparatie op te lossen.

### 6.1 v2 bestuurt waarden, v1 bestuurt keuzes

De inversies bepalen componentwaarden **binnen** een kandidaat. Wélke kandidaten bestaan —
waar overgenomen wordt, welke topologie, welke orde per flank — beslist
`crossover3Variants` stroomopwaarts, vóór de v1/v2-splitsing op `App.tsx:6355`
(`const useV2 = engineSelection.optimizer === 'v2';`).

v2 kan **vetoën** en **rapporteren**. Het kan niet **voorstellen**.

### 6.2 De pin overleeft de reis niet altijd

`App.tsx:6115–6126`:

```ts
const clampPin = (pin, win) => {
  if (!pin || !win || !win.userClampedByData || win.floorHz === null) return pin;
  const lo = win.floorHz;
  const hi = Math.max(win.ceilHz ?? lo, lo * 1.02);
  return { freq: (lo + hi) / 2, margin: (hi - lo) / 2 };
};
const pins = { low: clampPin(pinsRaw.low, physWin3?.win.low), high: ... };
```

Live waargenomen op het KOAN 2951-project: de aanbevolen band 396,7–448,5 Hz werd vervangen
door 707–728 Hz (het v1-fysicavenster), waarna de pre-start-raming meldde dat **4 van de 4**
kandidaten buiten het A5d.3-venster 396,7–549,7 Hz vielen. De raming had gelijk; de oorzaak
lag stroomopwaarts.

### 6.3 Twee lagen, twee meetvloeren, geen verzoening

| laag | vloer W-M | herkomst |
|---|---|---|
| v2 (A5d.3) | 396,7 Hz | meetgeldigheid, **mid** ver-veld |
| v1 | 707 Hz | near-field/far-field-splice op 500 Hz, ±0,5 oct blend, **woofer** |

Beide zijn verdedigbaar. De v1-waarde wint omdat hij eerder in de keten zit, niet omdat hij
beter is. Er is geen plek waar de twee tegen elkaar worden gehouden.

### 6.4 Satisficing bovenop een gewogen zoektocht

A5e.1 verbiedt gewogen aggregatie in de satisficing-vlakte, en
`src/lib/engine2/optimizer/noWeights.test.ts` bewaakt dat op woordniveau in
`requirements/`, `shortlist.ts`, `relaxation.ts` en `diversity.ts`.

De zoektocht zelf is `optimizeNetworkValues`, met `phasePriority`, `dissipationWeight`,
`directivityWeight`, `powerFoldWeight` en de in-room-weging. Het "veld" dat F3 belooft te
leveren is in de praktijk de zeef van een gewogen zoektocht: de shortlist kan alleen
diversifiëren over wat die zoektocht toevallig bezocht.

Aanverwant, en sinds F3c zichtbaar gemaakt in de dialoog: de tuner zoekt op 1/12 oct terwijl
de acceptatie op 1/6 oct oordeelt (`WINDOW_SMOOTHING_OCTAVES`, A5e.1).


### Erratum bij §6 — 27-08-2026 (F4d)

**§6.1 en §6.2 zijn op de v2-route gesloten; §6.3 is gesloten door hem te rapporteren in plaats
van op te lossen; §6.4 staat.** De tekst hierboven blijft staan zoals zij op 27-08 is opgeschreven.

**§6.1 — "v2 kan niet voorstellen".** Dat is niet langer waar op de v2-route. `predesign/
candidates.ts` maakt kandidaten uit de haalbare vensters (A5d.3), de aanbevolen band (F3c) en de
orde-afleiding per flank, en `App.tsx` gebruikt ze in plaats van `crossover3Variants` zodra de
optimizer op v2 staat. `crossover3Variants` is niet gewijzigd en blijft de bron op de v1-route.
**Op de v1-route is §6.1 onverkort waar en blijft dat.**

**§6.2 — "de pin overleeft de reis niet altijd".** `clampPin` staat sinds F4d achter `if (useV2)
return pin;`. Op de v2-route wordt niets meer geklemd; op de v1-route is de functie byte-identiek.
De 4-van-4-meting die deze paragraaf noteert is op casus 1 gereproduceerd als **0 van 9**
(`predesign/casus1Field.test.ts`), mét de tegenproef dat dezelfde schatter de v1-vensterkruispunten
nog steeds als buiten-het-venster telt.

**§6.3 — "twee lagen, twee meetvloeren, geen verzoening".** Er is nu een plek waar zij tegen
elkaar gehouden worden, en het is met opzet géén verzoening: `predesign/floorComparison.ts` zet
beide vloeren met hun herkomst naast elkaar, zegt wélke de kandidaten gestuurd heeft (de A5d.3-
vloer, want die staat sinds F4d in `xoFloorPairs`), en waarschuwt wanneer de andere laag een deel
van het veld geweigerd zou hebben. Geen van beide wint automatisch. De reden dat er niet verzoend
wordt staat in het bestand zelf: de twee beantwoorden verschillende vragen — waar een respons
*geloofd* mag worden, en waar een overname mag *zitten*.

**§6.4 — "satisficing bovenop een gewogen zoektocht" — staat, en is niet kleiner geworden.** De
zoektocht binnen één kandidaat is nog steeds `optimizeNetworkValues` met zijn gewichten; wat F4d
verandert is dat het VELD waarover de shortlist spreidt niet langer de toevallige buit van die
zoektocht is maar een gestelde verzameling keuzes. De vijf grijze sleutels zijn ongewijzigd en
worden nog steeds expliciet gesteld (F4c).

---

## 7. Bijvangst — buiten de grens, wel relevant

`App.tsx:1723–1724` en `1779–1780`:

```ts
const [xoFreqHz, setXoFreqHz]           = useState('2200');
const [xoMarginHz, setXoMarginHz]       = useState('400');
const [xoLowFreqHz, setXoLowFreqHz]     = useState('400');
const [xoLowMarginHz, setXoLowMarginHz] = useState('150');
```

Ook als fallback bij het laden van een ontwerp (`App.tsx:5863`, `5882–5883`).

Hardgecodeerde frequenties die een ontwerp sturen. De lage default geeft 250–550 Hz, terwijl
de A5d.3-meetgeldigheidsvloer voor dat paar op 396,7 Hz ligt — het bereik begint dus 147 Hz
onder de laagste frequentie die de app zelf vertrouwt. Dezelfde klasse als P6 verbiedt, maar
`src/lib/engine2/p6Lint.test.ts` scant alleen `src/lib/engine2/`, dus de regel bestaat en de
bewaking niet.

---

## 8. Conclusie en de volgende beslissing

Engine v2 is vandaag geen tweede engine maar **een vetorecht met een rapportagelaag**. Het
kan een netwerk afkeuren en componentwaarden begrenzen. Het kan niet voorstellen waar het
kruispunt hoort, ook al leidt het dat als enige uit de metingen af.

De drie lekken in §4 zijn losse reparaties en veranderen die verhouding niet. De verhouding
verandert pas als **de kandidaatgeneratie verhuist** — de naad die de spec zelf al trekt:
A5d is pre-design, A5e is de run.

Voorgestelde werkverdeling bij een Optimizer V2:

| | wie | waarom |
|---|---|---|
| Kandidaatgeneratie & zoekruimte (waar overnemen, topologie, orde per flank) | **nieuw, v2** | Hier zit elk probleem uit §6. v2 heeft het gereedschap al: vensters, aanbevolen band, grens-inversies, orde-afleiding. |
| Polish (componentwaarden bij gegeven topologie en doel) | **v1-tuner, ongewijzigd** | Goed gesteld numeriek probleem; een scalar is dáár verdedigbaar, en het ding is grondig getest. |

**Wat eerst moet, vóór er een regel optimizer geschreven wordt:** de golden references van
casus 1 pinnen uitkomsten van de v1-tuner. Een eigen kandidaatgeneratie levert legitiem
andere netwerken, en dan breekt de acceptatie-autoriteit precies wanneer ze nodig is. V15
zegt het al voor een ander geval — een referentie met een eigenschap van één meetsessie
ingebakken is geen referentie; hier zou het een eigenschap van één engine zijn.

Uit te zoeken: welke casus-1-referenties leggen eigenschappen van de v1-zoektocht vast, en
welke echte natuurkunde? Per referentie: behouden, herdefiniëren, of intrekken.


### Erratum bij §8 — 27-08-2026 (F4d)

**De voorgestelde werkverdeling is uitgevoerd, en de voorwaarde ervoor was al vervuld.** F4a
beantwoordde de vraag onderaan §8: casus 1 heeft géén klasse-C-referenties — elke kandidaat-
referentie is een metriek op een netlist-BESTAND, en die verschuiven niet wanneer v2 eigen
kandidaten gaat maken. Dat is bij F4a nagemeten in plaats van aangenomen (V19).

F4d heeft de v2-kandidaten daarom op dezelfde manier bevroren als de v1-kandidaten: geëxporteerd
als `KAND-V2-*.adsfilter.json` in `test-fixtures/casus1/`, opgenomen in
`manifest_en_geometrie.netlists`, met hun metrieken als klasse B. De herkomst (commit, seed,
run-vingerafdruk, generator-parameters, kandidaat-herkomst) staat in
`test-fixtures/casus1_v2_herkomst.json` en is **documentatie, geen acceptatiewaarde**.

De verhouding uit §1 luidt daarmee op de v2-route: **v2 bestuurt keuzes en waarden; v1 polijst.**
Op de v1-route luidt zij onveranderd: v2 bestuurt waarden, v1 bestuurt keuzes.

---

## Bijlage — bestanden die deze audit raakt

| bestand | rol |
|---|---|
| `src/lib/engine2/optimizer/worker.ts` | de grens: payload, `measurementFacts`, `tuneOptionsFor` |
| `src/lib/engine2/optimizer/run.ts` | de v2-run; `Omit<...>` legt de bevoegdheid vast |
| `src/lib/engine2/optimizer/bounds.ts` | de vier A5d.6-inversies |
| `src/lib/engine2/ingest/impedance.ts` | `estimateRe` / `resolveRe`, A5c.1-hiërarchie |
| `src/lib/engine2/ingest/derive.ts` | `IngestResult` — wat v2 werkelijk weet |
| `src/lib/engine2/report.ts` | `EngineV2Report` — de volledige rapportage-uitvoer |
| `src/lib/engine2/predesign/xoWindow.ts` | A5d.3-vensters |
| `src/lib/engine2/predesign/recommendedBand.ts` | F3c-compositie |
| `src/App.tsx` | `runVfOptimize`, `clampPin`, `v2ScanSettings`, de pin-defaults |
| `src/lib/netOptimizer.ts` | `NetOptimizeOptions` — waar de vier sleutels in landen |
