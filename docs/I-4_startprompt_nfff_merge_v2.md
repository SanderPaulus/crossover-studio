# Startprompt I-4 — NF/FF-merge v2: de kern staat, nu header, sectie en export

*Meerdere Claude Code-sessies, stoppunten voor Sander. Dit is gereedschap voor iedere gebruiker: casus 1 is één acceptatiecase, niet het ontwerpdoel. Referentiegetallen: `tools/nf_merge_reference.py`. Versie 2 van deze prompt (13-11-2026): de tafelblad-verklaring uit versie 1 is ingetrokken, zie bevinding 4.*

---

> **Rol.** Je bouwt een merge die metingen *verklaart*, niet een die ze *wegfit*. Elke correctie komt uit gestelde geometrie of uit een model waarvan je het residu laat zien. Niets wordt stil weggefit.
>
> **Eerst lezen.**
> - `CLAUDE.md`: P6, schatter-versionering, golden refs, de I-2-entry, het tweelagenbeleid.
> - De nieuwe kern: `src/lib/nfMergeV2.ts`, `src/lib/parsers/pir.ts`, `src/lib/nfMergeV2.test.ts`, `test-fixtures/casus1_pir/`.
> - v1, die blijft staan tot hij uitgefaseerd is: `src/lib/nfMerge.ts` (blok, checks 1–3), `src/lib/nearField.ts`, `src/lib/merger.ts`, `src/lib/cabinet.ts` (`floorBounceGate`).
> - In `src/App.tsx`: het I-2-slot (rond r. 18400–18690), de preview (rond 5550–5860) en de live splice (rond 5420–5545).
> - `tools/nf_merge_reference.py` en de goedgekeurde B-2-schets (link van Sander).
>
> **Werkafspraken (ongewijzigd).** Nederlands. Inventaris vóór wijziging. Golden refs zijn de autoriteit. V-nummers voor afleidingsfouten. `npx tsc -b` vóór elke oplevering, `npm run test:fast` tijdens het werk. Geen bestaande fixture, golden ref of merge-bestand overschrijven: nieuwe sets komen ernaast (M-3-precedent).
>
> ---
>
> ### Wat er gemeten is (13-11-2026, reproduceerbaar met het referentiescript)
>
> 1. **v1 klopt niet met de fysica.** v1 fit niveau, looptijd en een **vrije** faseverschuiving op ongelijk bewerkte curves. Op casus 1 leest hij +13° (woofer boven), −71° (woofer onder) en +55° (mid). Volgens a/2r (AN4) verschillen nabij- en vervelveld alleen in niveau en looptijd.
> 2. **Ingetrokken (V55, door V60): "oorzaak woofers: twee sessies door elkaar".** De I-2-woofermerges zetten het nabijveld van september (testkast, 11-09) op het vervelveld van augustus, maar dat is niet wat het residu maakte.
>    - Augustus had alles zelf, in één sessie: ruwe `.pir`, dual-channel, dus één tijdbasis. Daarmee, gelijk gegate en offset vast op 0, **zonder enig reflectiemodel**: woofer onder **2,2° / 0,21 dB**, woofer boven **2,3° / 0,57 dB** (300–576 Hz, AN4 f0 150 Hz).
>    - Met hetzelfde venster versmelt het septembernabijveld op het augustusvervelveld net zo schoon: **2,9°** en **2,0°**. De 10,6° en 5,0° van sectie C kwamen uit een misgelezen venster: ARTA's `Left/Right window` zijn lengtes vanaf de `Reference time`, dus het vervelveld-FRD is gegate tot ref + 5,021 ms en niet tot ref + 2,521 ms (V60). Een andere sessie kost alleen de gedeelde tijdbasis; de merge meldt dat als notitie.
> 3. **Oorzaak mid: ongelijk gegate.** Gelijk gegate, offset vast, zelfde sessie: **3,5° / 0,56 dB** (300–800 Hz, f0 200 Hz).
> 4. **Ingetrokken: het tafelblad.** Versie 1 van deze prompt verklaarde de woofers met een spiegelvlak (tafelblad, mic 0,70 m erboven). Dat was een fit op de verkeerde combinatie.
>    - De looptijden in de PIR's zeggen: mic op referentiehoogte, ~1 m.
>    - Voor casus 1 is er geen vlak binnen de gate nodig. Het vlakmodel blijft in de kern voor opstellingen die het wél hebben, maar casus 1 is er geen acceptatiecase meer voor.
> 5. **Overname boven de fitband.** Wie de nabijveld-voorspelling over de hele band door het venster haalt, laat het verschil NF ≠ FF boven ka ≈ 1 via het venster van 2,5 ms de fitband in lekken.
>    - v2 laat daarom boven fitHi·2^(1/6 … 2/3) het gemeten vervelveld overnemen, vóór het venster.
>    - Een onafhankelijke numpy-versie (sectie D) geeft exact dezelfde τ en residuen als de TypeScript-kern.
> 6. **De FRD-exports dragen de sessie-tijdbasis niet.** Ze zijn gemaakt van verschoven impulsen: referentie 2,5 ms, terwijl het directe geluid in de PIR op ~9,2 ms ligt. Alleen de PIR heeft de gedeelde t = 0. PIR is dus de primaire invoer, FRD de terugval.
> 7. **De gate-check kijkt alleen naar het referentiepunt.** `floorBounceGate` rekent het reflectiepad alleen voor het referentiepunt. Hij hoort per driver en per vlak te rekenen. Dit blijft staan.
> 8. **Poortdiameter.** `D 74 mm` in het blok is teruggerekend uit g = 0,41. Volgens Helmholtz heeft de poort ~110 cm² in de taille (Ø ≥ 118 mm). Effect: +3 dB op 30 Hz, +2 op 40, +1 op 50 Hz. Op de fit in 300–576 Hz doet het niets (2,2° met en zonder poort). Melden, Sander meet de mond.
> 9. **Het baffle-step-model doet er weinig toe.** Shelf of AN4-vorm scheelt na de fit ≤0,5 dB en ≤2° rond de overname.
>
> ---
>
> ### Stand van de code
>
> Branch `i4-nf-merge-v2`. Nieuw, niets van v1 aangeraakt.
>
> - **`src/lib/parsers/pir.ts`**: ARTA-PIR lezen en schrijven. Meettype 2 (dual-channel) betekent een gedeelde tijdbasis.
> - **`src/lib/nfMergeV2.ts`** (`nf-merge/2.0`): de kern.
>   - **Invoer:** impulsen uit PIR, of FRD herbouwd op een FFT-raster (geweigerd als het raster niet op de bins ligt).
>   - **Venster:** uit de header (links, referentie, rechts, Tukey-α), over de voorspelling, gelijk aan de vervelmeting.
>   - **Fit:** versterking en looptijd vrij; offset vast op 0 of 180°, en 180° wordt gemeld.
>   - **Startwaarde τ:** uit een band-beperkte kruiscorrelatie, daarna globaal gezocht.
>   - **Modellen:** nabij → ver (geen, shelf, AN4, overdrachtsbestand) en reflectievlak (spiegelbron met zuigerrichtwerking), allebei gesteld.
>   - **Zelfdiagnose:**
>     - residu boven 10°
>     - de vrije offset die, gelijk gegate, nog zou helpen
>     - sessiemix
>     - een verkeerde cyclus: |τ_fit − τ_gemeten| boven een kwart periode in het midden van de fitband
>     - een ongemodelleerde reflectie binnen het venster, boven −20 dB
>   - **Echozoeker:** alleen in de fitband ±½ octaaf; daarbuiten is het nabijveld geen vervelveld en ziet hij spookecho's. De notitie zegt welke afstand hij niet kan scheiden.
>   - **Uitvoer:** op een log-raster; boven de overname het vervelveld met de gestelde reflecties eruit gedeeld (geregulariseerd).
> - **`src/lib/nfMergeV2.test.ts`**: 24 tests.
>   - Synthetisch, met bekende waarheid: τ ±2 µs, versterking ±0,05 dB, residu < 0,5°; omgepoold; gestelde en ongestelde reflectie; foute geometrie; tijdcheck; sessiemix.
>   - Weigeringen met veldnaam.
>   - PIR round-trip.
>   - Casus 1, augustus: drie drivers, en de woofers met poort (gewicht 0,205 gesteld).
>   - De I-2-combinatie wordt gemeld.
> - **`test-fixtures/casus1_pir/`**: de acht augustus-PIR's, inclusief `poort_near.pir`.
>
> ---
>
> ### Sanders eis: foolproof, niet alleen de demodata
>
> - **Gestelde invoer, geen standaardwaarden (P4/P6).** Geen Koan-hoogtes, geen 150 of 300 Hz en geen startwaarde voor τ in de code. Fitband en overname worden voorgesteld uit het venster en ka, zichtbaar en overschrijfbaar.
> - **Sessie is een eersteklas begrip.** Elke impuls hoort bij een meetsessie.
>   - Dual-channel PIR's uit één sessie maken de looptijdcheck mogelijk.
>   - Een merge over sessies heen wordt altijd gemeld, nooit geblokkeerd zonder uitleg.
> - **N-weg-agnostisch.** Elk aantal drivers per tak; gesloten, reflex of passieve straler; een poort met eigen gewicht.
> - **Venster altijd uit de header.** Onbekend of afwezig: weigeren, met de naam van wat ontbreekt.
> - **Geometrie per meting** (via `measured_in`), niet per kast.
> - **Zelfdiagnose roept niet onnodig.** Een schone merge uit één sessie geeft nul meldingen; dat staat als test vast.
>
> ---
>
> ### Fase 0 — Inventaris voor de inbouw (geen wijziging)
>
> 1. Draai `python3 -I tools/nf_merge_reference.py` en `npx vitest run src/lib/nfMergeV2.test.ts`; lever beide uitvoeren.
> 2. **Inventaris.**
>    - Waar wordt samengevoegd: I-2-slot, live splice, `scripts/annotate-casus1-merge.ts`, fixtures.
>    - Welke lezers lezen het v1-blok, en welke tests pinnen dat vast.
>    - Waar wordt `floorBounceGate` gebruikt.
>    - Hoe komen PIR's de app in (nu: niet).
> 3. **Boekhouding.** Boek bevinding 1, 2, 6, 7 en 8 als V-nummers (het volgende vrije nummer na V53; controleer dat). Boek de ingetrokken tafelblad-verklaring erbij, zodat niemand hem terugvindt en opnieuw gelooft.
>
> **Stop (B-1).** Leg Sander voor: de uitvoer, de inventaris en een voorstel welke bestanden je aanraakt. Nog geen code.
>
> ### Fase 1 — Schets
>
> Gedaan; Sander keurt hem goed of stuurt bij (**B-2**). Volg de goedgekeurde versie, inclusief zijn antwoorden op de drie open punten.
>
> ### Fase 2 — Header en fixtures (na B-1 en B-2)
>
> - **Header-blok `nf-merge/2.0`.**
>   - Velden voor sessie, venster, model, poortgewicht, fitband, τ, versterking, polariteit, residu, meldingen en fase-conventie.
>   - Een `render`/`parse`-paar met een round-trip-test. Alle lezers van het v1-blok lezen ook v2; een test pint dat vast.
> - **`floorBounceGate`** rekent per driver en per vlak.
> - **Versiebump** volgens de schatter-versioneringsregel.
> - **Nieuwe merge-set** uit de augustus-PIR's naast de oude: `test-fixtures/koan_2026-11_merge_v2/`.
>
> **Stop (B-3).** De cijfers, de nieuwe set, en oud tegen nieuw tussen 300 en 600 Hz.
>
> ### Fase 3 — Sectie en grafieken
>
> - **Eigen sectie.** De I-2-merge **verhuist** uit de takken; niet kopiëren. Er is één plek waar samengevoegd wordt. De takken laden alleen resultaten en tonen de herkomst.
> - **PIR-import:** sleep een map PIR's erin; de sessie wordt herkend uit de bestanden.
> - **Grafieken** met het bestaande `Chart.tsx`, volgens de schets.
> - **Browsercontrole:** een merge van begin tot eind met de casus-1-PIR's. De console blijft leeg.
>
> **Stop (B-4).**
>
> ### Fase 4 — Export
>
> - **Eén pakket per sessie:** een FRD per driver, de ZMA's, `manifest.json` (assen X horizontaal, Y verticaal, Z diepte; mic-afstand, tijdreferentie, frame, geldigheid, modelstatus) en `leesmij.txt`.
> - **Fase-conventie, één per set:**
>   - zoals gemeten: t = 0 op de sessie-tijdbasis (standaard)
>   - op een gekozen referentiepunt
>   - minimumfase, alleen expliciet en met een waarschuwing
> - **Voor het andere programma:** baffle step en diffractie zitten er al in (volle ruimte), dus zet de diffractietool in VituixCAD niet ook aan. Onder het samenvoegpunt is het nabijveld plus model.
> - **Raster:** het origineel, of optioneel log 1/48 octaaf zonder de fase af te vlakken.
> - **Header-stijl:** ARTA-stijl met `*`. De ontwerpsectie leest hetzelfde pakket in; export → import is numeriek identiek.
>
> ---
>
> **Buiten scope.**
> - BEM zelf.
> - Opnieuw meten; de gate verlengen (≥ 5 ms kan in deze opstelling niet).
> - Engine, poorten, budgetten, corpus.
> - Bestaande fixtures, golden refs en merges wijzigen.
> - De poortdiameter in de data aanpassen.
> - Een tafelblad- of vloermodel voor casus 1.
>
> **Acceptatie.**
>
> 1. **De kern blijft groen.** Alle 24 tests in `nfMergeV2.test.ts`, onveranderd. Een test aanpassen mag alleen met een V-nummer en Sanders akkoord.
> 2. **Casus 1, augustus, één sessie.** Haal de getallen van sectie D binnen ±0,2° en ±0,02 dB, met nul meldingen:
>
>    | Driver | Poort | τ | Residu |
>    |---|---|---|---|
>    | Woofer onder | — | 3,282 ms | 2,2° / 0,21 dB |
>    | Woofer onder | 0,205 | 3,281 ms | 2,2° / 0,23 dB |
>    | Woofer boven | — | 2,916 ms | 2,3° / 0,57 dB |
>    | Woofer boven | 0,205 | 2,914 ms | 2,3° / 0,60 dB |
>    | Mid | — | 2,833 ms | 3,5° / 0,56 dB |
> 3. **Het venster wordt goed gelezen en de zelfdiagnose wijst de echte oorzaak aan** (vervangt "de I-2-combinatie wordt gemeld", die op V55 rustte; Sander, 13-11-2026).
>    - FRD-route: venster = lengte vanaf de referentie (V60). Augustus via FRD en via PIR onder hetzelfde venster liggen binnen 1°.
>    - Een misgelezen venster (rechterrand ref + 2,521) laat de zelfdiagnose aanslaan, en de residu-melding noemt de header als eerste oorzaak.
>    - Sessiemix is een notitie ("geen gedeelde tijdbasis, looptijd alleen gefit"), de poortsessie wordt meegewogen; het septembernabijveld op het augustusvervelveld (PIR, D-venster) geeft 2,9° / 2,0° zonder melding.
>    - Of de 6–7° op het lange venster de reflectie binnen de gate is: gesteld vlak, gerapporteerd bij B-3; pas daarna een acceptatiegetal.
> 4. **Niets verschuift.** Bestaande fixtures en golden refs zijn byte-identiek (P2).
> 5. **Groen.** `npx tsc -b` en `npm run test:fast` slagen; browsercontrole gedaan.
> 6. **Export.** De round-trip is numeriek identiek, en VituixCAD leest het pakket (Sander controleert dat).
> 7. **Afsluitend:** de gewijzigde bestanden, wat er níet gedaan is, en de open V-nummers.

---

### Openstaand (lijst, bijgehouden tijdens fase 2 — 13-11-2026)

- **Vergelijkingsrun van de M-2b-ontwerpen op de v2-set** (Sander, B-3). Het verschil nieuw − oud in
  300–600 Hz (−1,15 dB / −10,9° woofer onder, −0,94 dB / −12,8° mid; `koan_2026-11_merge_v2/vergelijking.json`)
  valt in het overnamegebied. Golden refs worden er niet voor gewijzigd; de run is een meting.
- **Poortmaten** (mond onder de kastbodem, spleet tot het tafelblad, uitsteek van het blad, mic-plaats bij
  `poort_near.pir`) → de echo per bron voor de poort stellen, het definitieve poortgewicht (V58), en casus 1
  met poort vastpinnen. Tot dan staat 0,205 in de kop als VOORLOPIG.
- **Woofer boven**: de vlakken achter de echo's op 2,63 en 4,02 ms (maten van Sander).
- **De mid-hoogte** boven de vloer, voor de vloervergelijking op het lange venster.
- **Nominale T/S van de WO24TX-8** (f_s, Q_ts, V_as): het casusboek draagt ze niet. Met de M-2-modellen is de
  doelkastgrens voor casus 1 **146,2 Hz** (±0,2 dB / ±5°; het niveau bindt, niet de fase); met de nominale
  T/S kan de T/S-route er naast gelegd worden.
- **App-aanroepers van `reflectionGates`** (`App.tsx`, `MeasuringGuide.tsx`) op de driverposities: fase 3.
