# A5e.3 — voorstel: spanning en tolerantie uit de catalogus gebruiken

*07-11-2026. Een VOORSTEL. De datavelden zijn gebouwd; het gebruik niet. Sander beslist.*

## Wat er nu staat (gebouwd, alleen data)

- `CatalogPart` en `CatalogSeries` dragen optioneel `tolerancePct` (± %) en `voltageV` (V).
  - Een serie geeft beide door aan elk onderdeel dat zijn waardenraster genereert (`catalog.ts`).
  - Een exacte SKU draagt zijn eigen waarde.
- Het bestandsformaat is **v5** (`catalogFile.ts`) en leest beide spellingen: `tolerancePct`/`tolerance_pct` en `voltageV`/`voltage_v`.
  - Een v4-bestand importeert zonder één van beide velden, en dat is getest op de v4- en v8-fixture.
  - Afwezig wordt nergens ingevuld.
  - Aanwezig maar onbruikbaar (tekst, 0, ≥ 100 %) wordt **geweigerd**, met de regel bij naam.
- De cataloguseditor heeft beide velden, met dezelfde regels (`catalogManager.ts`). Een bewerking laat ze dus niet stil vallen.
- **Niets leest ze.** Geen poort, geen kolom, geen zoekgrens.

## Voorstel 1 — spanning over elke condensator naast zijn rating

**Wat al bestaat:** U-5c's `capacitorLoads` (`metrics/buildability.ts`) leest de piekspanning over elke condensator bij de piekingang. Dat is rapportage. Op het levende corpus loopt die tot **370 V**, op de referentiefilters 83–94 V. Er staat niets tegenover.

**De vorm, dezelfde als M-A/part (V50):**
1. `partRatingsOf` (`optimizer/partRatings.ts`) leest de rating van gesnapte onderdelen al uit hun `catalog`-attributie, voor weerstand (W) en spoel (A). Voeg condensatoren toe: `voltageV`. Een bank (`SKU+SKU`, parallel) is zo sterk als zijn zwakste lid, dus het minimum.
2. **Fase A — kolom, geen poort (aanbevolen eerst).** Per condensator: piekspanning tegen de rating, met de marge in procent. Een condensator zonder rating zegt "niet opgegeven" (P4) en nooit een nul (F0). Zo zien we eerst wat het casusboek leest voordat er iets bijt; dat is de V47-les.
3. **Fase B — poort `M-V/part`, pas na fase A en alleen op Sanders besluit.** Gewapend door een gestelde marge (bv. piekspanning ≤ marge × rating). Een onderdeel zonder rating wordt niet geoordeeld en dat wordt gezegd.

**Open vraag die het getal betekenis geeft:** welke rating staat er in `voltageV`?
- Folies worden meestal als **VDC** opgegeven (bv. 250 VDC), soms met een aparte **VAC rms**.
- U-5c leest een **piekwaarde** van een AC-signaal.
- Piek ≤ VDC is een gangbare vuistregel, maar dan moet het veld als DC gedefinieerd zijn. Of we voegen later een `voltageAcV` toe.

**Dit moet beslist zijn vóór fase B.** Mijn advies: `voltageV` = de DC-rating, zo genoemd in de veldbeschrijving.

## Voorstel 2 — tolerantie per gekozen onderdeel

- **Wat al bestaat:** U-5c's `scripts/measure-u5c-tolerance.ts` trekt álle onderdelen uniform binnen **één** aangenomen ±5 %. Gemeten op KAND_V2_2: min |Z| zakt tot 2,41 Ω tegen een vloer van 2,60 Ω.
- **Voorstel:** dezelfde meting, met per gesnapt onderdeel zijn eigen `tolerancePct`. Een onderdeel zonder opgave houdt de aangenomen waarde en wordt zo gelabeld. Eerst als script en rapportage; geen kolom, geen poort en geen gewicht (A5e.1).

## Wat dit NIET doet

- Geen enkele waarde ingevuld in de meegeleverde of demo-catalogus. Die getallen komen van de datasheets, en ik verzin ze niet (A3h). Wie ze invult: Sander, via de editor of een v5-bestand.
- Geen wijziging aan snap, tuner of ketens; geen motorgrensbestand aangeraakt.
- `fitFor` zit hier niet in (zie de toets van 07-11-2026: verkeerde aanroeplaats in de prompt, en geen effect onder het standaardprofiel `'auto'`).

## Beslispunten voor Sander

1. `voltageV` = DC-rating? (aanbevolen: ja)
2. Fase A (kolom) bouwen?
3. Wie vult de ratings voor de demo-catalogus, en uit welke bladen?
